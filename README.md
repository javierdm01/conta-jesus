# Instala · gestión para instaladores

Primera versión local para electricidad y climatización. No incluye datos comerciales ficticios. Lee [la arquitectura y el modelo](docs/ARQUITECTURA.md), [la instalación](docs/INSTALACION.md), [el manual de usuario](docs/USUARIO.md) y [el alcance y verificación](docs/VERIFICACION.md).

La segunda iteración incorpora navegación persistente con Next.js, almacén por lotes y etiquetas para impresora en rollo. Consulta [Almacén y etiquetas](docs/ALMACEN_Y_ETIQUETAS.md) y [el plan de continuación](docs/PLAN_DE_CONTINUACION.md).

La continuación añade recuentos físicos auditados, recuperación de faltantes, filtros por proveedor/ubicación, mínimos sobre material libre y exportación CSV de los lotes visibles. El plan ampliado distingue estas entregas de las fases futuras de pedidos, recepciones parciales, trabajo en campo y operación del servidor.

La tercera iteración mejora el OCR (proveedor por NIF o nombre más parecido, fechas, totales e IVA) y añade la pantalla **Trimestres**: IVA, resultado aproximado y descarga de un ZIP con las facturas del periodo. Estado y pendientes en [Verificación](docs/VERIFICACION.md); ideas futuras en [el plan](docs/PLAN_DE_CONTINUACION.md). Prueba específica: `npm run test:quarters`.

La revisión de continuidad contrasta Graphify con el código y completa pruebas de pedidos parciales, perfiles de etiquetas, estado del sistema y Trimestres. El paquete trimestral comprueba que los originales existen antes de descargar y mantiene nombres únicos coincidentes con sus CSV. Para generar y verificar una copia desde Windows: `powershell -File scripts/backup-now.ps1`.

La revisión de documentos muestra ahora la página como escaneada junto al formulario, con recuadros etiquetados de dónde sale cada dato, y permite eliminar subidas sin confirmar. Pruebas nuevas: `npm run test:pages`, `npm run test:delete`, `npm run test:review-visual`, `npm run test:tablet`.

## Servidor de producción

Escaneo desde la impresora de red (eSCL/AirScan) directo al OCR: [docs/ESCANER.md](docs/ESCANER.md).

Con HTTPS, comprobaciones de salud, copias con retención y actualización guiada: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) (`bash scripts/deploy.sh`).

## Arranque en Linux con Docker

Requisitos: Docker Engine y Docker Compose, 4 GB de RAM recomendados, disco suficiente para documentos y copias.

```sh
cp .env.example .env
# Edita POSTGRES_PASSWORD, BETTER_AUTH_SECRET y ADMIN_PASSWORD con valores propios.
docker compose build web
docker compose up -d --no-build
docker compose exec -e ADMIN_EMAIL=responsable@empresa.local -e ADMIN_PASSWORD='TU_CLAVE_LARGA' -e ADMIN_NAME=Responsable web npm run bootstrap
```

Abre http://localhost:3000. El alta inicial se cierra tras crear el primer responsable. Las contraseñas no se incluyen en el código.

## Desarrollo local

Node 22.12 o posterior; PostgreSQL 16; Tesseract spa+eng y Poppler para PDF.

```sh
npm ci
cp .env.example .env
# Configura DATABASE_URL, secreto, correo y contraseña del responsable.
npm run db:migrate
npm run bootstrap
npm run dev
# Otra terminal:
npm run worker
```

También puedes generar `.env` y una clave inicial aleatoria con `node scripts/init-local.mjs` si todavía no existe `.env`. Configura después DATABASE_URL para tu PostgreSQL.

```sh
npm test
npm run typecheck
npm run build
# Con web y worker iniciados, crea registros transitorios en una empresa de prueba y los limpia:
npm run test:integration
```

Para repetir la prueba del servidor instalado en Docker (incluye OCR de PDF y limpia sus registros de prueba):

```sh
docker compose exec -T -e SKIP_BROWSER=1 -e TEST_PDF=1 -e NODE_OPTIONS=--dns-result-order=ipv4first web npm run test:integration
docker compose exec -T -e NODE_OPTIONS=--dns-result-order=ipv4first web npm run test:inventory
```

En la instalación Docker la variable DATABASE_URL se resuelve dentro de la red de Compose; para ejecutar herramientas Prisma desde el ordenador utiliza `docker compose exec web ...` o configura expresamente una base de desarrollo local.

## Acceso remoto desde otro dispositivo

Para acceder desde otro dispositivo en la misma red (móvil, tablet, otro ordenador):

1. **Obtén tu IP local:**
   - Windows: `powershell -File get-ip.ps1`
   - Linux/Mac: `bash get-ip.sh`

2. **Configura el .env:**
   ```
   BETTER_AUTH_URL=http://TU_IP:3000
   PORT_BIND=0.0.0.0
   ```
   (Sustituye `TU_IP` por la dirección que encontraste, ej. `http://192.168.1.100:3000`)

3. **Inicia el desarrollo:**
   ```sh
   npm run dev
   # En Docker: ya está configurado para todos los interfaces
   ```

4. **Accede desde el otro dispositivo:**
   - Abre `http://TU_IP:3000` en el navegador
   - Los dispositivos deben estar en la misma red local (WiFi o Ethernet)

Los informes usan datos reales introducidos por el usuario. El OCR local entrega texto para revisión; la extracción de líneas es conservadora y requiere revisión; no hay conectores de proveedores en esta fase. Los detalles y límites están documentados en `docs`.
