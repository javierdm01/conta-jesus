# Despliegue en el servidor

Servidor Linux con Docker Engine y Compose, 4 GB de RAM y disco para documentos y copias. Todo el tráfico entra por HTTPS (Caddy); la aplicación y la base no se exponen.

## 1. Copiar el proyecto (desde Windows)

Sin `node_modules`, `.next`, `.env`, `data`, `backups` ni `graphify-out`:

```powershell
cd "C:\Users\javie\Desktop\PRUEBA CONTABILIDAD JESUS"
tar --exclude=node_modules --exclude=.next --exclude=.env --exclude=data --exclude=backups --exclude=graphify-out --exclude=tsconfig.tsbuildinfo -czf "$env:TEMP\instala.tar.gz" .
scp "$env:TEMP\instala.tar.gz" USUARIO@IP_SERVIDOR:~/
```

En el servidor: `mkdir -p ~/instala && tar -xzf ~/instala.tar.gz -C ~/instala`.

## 2. Desplegar

```sh
cd ~/instala
bash scripts/deploy.sh
```

Pregunta dominio o IP, genera `.env` con claves aleatorias, construye, arranca, espera a que esté sana y crea el primer responsable. Las credenciales quedan en `data/ACCESO_INICIAL.txt` (léelas, guárdalas y bórralo).

- **Red local** (IP o nombre `.local`): usa certificado propio de Caddy (`tls internal`). Instala `caddy-root.crt` como CA de confianza en cada ordenador y móvil; sin eso el navegador avisará y la cámara no funcionará.
- **Dominio público**: apunta el DNS al servidor y abre los puertos 80 y 443; Let's Encrypt se encarga del resto.

Cortafuegos recomendado: `ufw allow 22,80,443/tcp && ufw enable`. No abras el 3000 ni el 5432.

## 3. Operación

| Tarea | Comando |
|---|---|
| Estado | `docker compose ps` |
| Registros | `docker compose logs --tail 100 web worker` |
| Actualizar (copia previa, build, migración, comprobación) | `bash scripts/update.sh` |
| Alta de técnico | ver `docs/INSTALACION.md` |
| Olvido de contraseña | `docker compose exec -e ADMIN_EMAIL=correo -e NEW_PASSWORD='nueva_de_12_o_más' web npm run reset-password` |
| Copia inmediata | `docker compose restart backup` |

Las copias diarias van a `backups/`; `BACKUP_KEEP_DAYS=60` en `.env` borra las anteriores a 60 días y conserva siempre las 7 más recientes. Pon `0` para no borrar nunca.

**Copia externa (imprescindible):** una copia en el mismo disco no protege de un fallo del servidor. Programa con `crontab -e`, por ejemplo: `30 3 * * * rsync -a --delete ~/instala/backups/ usuario@otro-equipo:/ruta/copias/`. Prueba una restauración (`docs/INSTALACION.md`) antes de fiarte.

Nunca ejecutes `docker compose down -v`: borra la base y los documentos.

## 4. Llevar los datos actuales (opcional)

Por defecto el servidor empieza vacío. Para trasladar los datos de este equipo, copia una carpeta de `backups/` al servidor y restáurala con el procedimiento de `docs/INSTALACION.md`.
