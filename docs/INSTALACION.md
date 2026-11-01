# Instalación y operación

## Instalación recomendada: mini PC Linux

1. Instala Docker Engine y el complemento Docker Compose desde las instrucciones oficiales de Docker para tu distribución.
2. Copia este proyecto a una carpeta privada del servidor.
3. Copia `.env.example` a `.env`. Usa una contraseña alfanumérica aleatoria para POSTGRES_PASSWORD y un secreto aleatorio de al menos 32 caracteres para BETTER_AUTH_SECRET. No uses los textos de ejemplo. Si la contraseña de PostgreSQL contiene caracteres reservados de URL, codifícalos en DATABASE_URL; en Compose conviene usar hexadecimal para evitar este problema.
4. Mantén BETTER_AUTH_URL=http://localhost:3000 para acceso solo desde el servidor. El secreto debe mantenerse entre reinicios.
5. Ejecuta `docker compose build web` y después `docker compose up -d --no-build`. El servicio migrate aplica la migración antes de iniciar web y worker.
6. Crea el primer usuario:

```sh
docker compose exec -e ADMIN_EMAIL=tu@empresa.es -e ADMIN_PASSWORD='TU_CONTRASEÑA_DE_12_O_MAS_CARACTERES' -e ADMIN_NAME='Tu nombre' -e COMPANY_NAME='Tu empresa' web npm run bootstrap
```

7. Entra en http://localhost:3000. Guarda la contraseña en un gestor. Retira ADMIN_PASSWORD de `.env` tras el alta. El servicio web no la necesita y el registro público está deshabilitado.

Los documentos, la base y las copias persisten en volúmenes y `backups`. No ejecutes `docker compose down -v`: eliminaría volúmenes. PostgreSQL no publica puerto. `docker compose logs web worker backup` permite revisar errores. No compartas `.env`, documentos ni copias.

## Acceso desde móvil en la red

El acceso habitual de esta instalación es el puerto 3000; el puerto 3001 se reserva al desarrollo. Para dar acceso en la red local configura `PORT_BIND=0.0.0.0` y `BETTER_AUTH_URL=http://IP_DEL_SERVIDOR:3000`. Para mantener también el acceso desde el ordenador, añade `APP_TRUSTED_ORIGINS=http://localhost:3000,http://IP_DEL_SERVIDOR:3000`. Reconstruye con `docker compose build web` y aplica la configuración con `docker compose up -d --no-build web worker`. Abre únicamente el puerto necesario en el cortafuegos de la red privada. Autenticación y operaciones comparten esta lista exacta de direcciones permitidas; otros puertos y orígenes se rechazan. El móvil debe estar conectado a la misma red. Si cambia la IP del ordenador, actualiza las dos variables y los códigos QR que contengan la dirección anterior; conviene reservar esa IP en el router.

Para un uso habitual con datos fiscales, sitúa un proxy HTTPS delante de web y deja el puerto web accesible solo desde el proxy. Configura un nombre DNS interno, un certificado confiable en todos los dispositivos y BETTER_AUTH_URL=https://tu-nombre-interno. Reenvía Host y X-Forwarded-Proto correctamente. La cámara y la instalación PWA en móviles necesitan un contexto seguro. El botón Galería o PDF permite seleccionar un archivo aunque la cámara no esté disponible. No publiques el servidor directamente en Internet.

Las funciones principales funcionan sin Internet una vez descargadas las imágenes/dependencias e instalado el idioma OCR. PWA no significa que se puedan guardar partes desconectados: la pantalla sin conexión avisa y no afirma que se hayan guardado cambios.

## Alta de técnicos y usuarios

Lo habitual es hacerlo desde la aplicación: **Configuración → Usuarios y accesos** (solo el responsable). Allí puede crear técnicos o responsables con una contraseña inicial generada, dar acceso a un trabajador que ya estaba en «Equipo y coste laboral», cambiar contraseñas (cierra sus sesiones) y desactivar o reactivar cuentas sin borrar sus datos. No puede desactivarse a sí mismo. La consola sigue disponible como alternativa:

```sh
docker compose exec -e ADMIN_EMAIL=tecnico@empresa.es -e ADMIN_PASSWORD='OTRA_CONTRASEÑA_LARGA' -e ADMIN_NAME='Nombre del técnico' -e WORKER_HOURLY_COST=25.50 web npm run bootstrap -- --technician
```

Introduce tu coste laboral real. El comando crea el usuario y su trabajador asociado. Después asígnale trabajos al crearlos. Crear solo un trabajador en Configuración permite registrar sus horas desde administración, pero no crea una cuenta de acceso. La primera versión no dispone de cambio de contraseña ni recuperación por correo; para restablecer una cuenta se requiere intervención del administrador del servidor. No uses contraseñas compartidas.

## Copias automáticas

El servicio backup crea una copia al arrancar y luego cada 24 horas: `backups/FECHA/database.dump`, documentos y sumas SHA-256. Los archivos originales son inmutables: se escriben antes de insertar su registro, por lo que una copia de documentos posterior al volcado puede contener archivos adicionales, pero no omitir los ya referenciados. Solo las copias completas pasan de `.partial` a la carpeta final. Si falla, se conserva la copia incompleta y queda un error en el registro. No hay borrado automático: supervisa el espacio y aplica una retención adecuada. Copia periódicamente una carpeta completa a un disco externo cifrado y comprueba su restauración.

El proceso espera a que PostgreSQL responda al arrancar. Si una copia falla, registra el último intento fallido y reintenta a los cinco minutos; tras un éxito vuelve al intervalo de 24 horas. Configuración → Estado del sistema muestra la última copia completa, su comprobación de sumas y los fallos posteriores. Estos metadatos se montan en lectura para la aplicación.

En Windows puedes solicitar una copia inmediata y una segunda comprobación de sumas sin construir rutas de montaje manualmente:

```powershell
powershell -File scripts/backup-now.ps1
```

El script espera una copia nueva y verifica `SHA256SUMS` dentro de su carpeta. No restaura ni elimina datos. La verificación de archivos y el ensayo de restauración son comprobaciones diferentes.

## Restauración

La restauración sustituye la base actual. Haz antes una copia y utiliza una instalación de prueba para comprobar el procedimiento.

```sh
docker compose stop web worker backup
# Montaje de documentos en escritura solo para esta operación explícita.
docker compose run --rm -e CONFIRM_RESTORE=RESTAURAR -v instala-jesus_documents:/documents -v "$(pwd)/scripts/restore.sh:/restore.sh:ro" --entrypoint bash backup /restore.sh /backups/FECHA
docker compose up -d
```

El script comprueba las sumas y ejecuta pg_restore en transacción. Los documentos sobrantes no se eliminan. Ajusta el nombre de volumen si has cambiado el nombre del proyecto Compose. Verifica que se puedan abrir los documentos y consultar un trabajo restaurado.

El ejemplo de restauración usa Bash en Linux. En Windows pasa la ruta absoluta del script (por ejemplo `C:/ruta/del/proyecto/scripts/restore.sh:/restore.sh:ro`) en el argumento `-v`; una ruta relativa se interpreta como nombre de volumen.

## Desarrollo en Windows

En esta entrega puedes iniciar la instalación Docker con `./Iniciar.ps1` desde PowerShell y detenerla con `./Detener.ps1`. El arranque conserva los datos y crea el primer responsable solo si todavía no existe. Necesita Docker Desktop abierto y Node disponible para generar claves durante el primer inicio. Si las directivas de tu organización bloquean scripts, utiliza los comandos Docker del manual.

`npm ci`, PostgreSQL 16 accesible y `.env` configurado. Ejecuta `npm run db:migrate`, `npm run bootstrap`, `npm run dev` y, en otra terminal, `npm run worker`.

El servidor de desarrollo usa el puerto 3001 para no competir con Docker en el 3000. Configura su origen de autenticación y una base de desarrollo accesible antes de usarlo. La instalación habitual se abre en `http://localhost:3000`. Evita iniciar otro servidor Next.js en ese puerto: un proceso en IPv6 y Docker en IPv4 pueden responder a la misma dirección `localhost` con instalaciones distintas.

Si Tesseract no figura en PATH, añade `TESSERACT_PATH=C:/Program Files/Tesseract-OCR/tesseract.exe`. Instala los idiomas spa y eng, y Poppler (pdfinfo/pdftoppm) para PDF. PDFINFO_PATH, PDFTOPPM_PATH y TESSDATA_PREFIX pueden configurarse en `.env`. Cada comando del worker usa argumentos separados, sin intérprete de comandos. Si faltan herramientas, el documento pasa por reintentos y queda disponible para revisión manual con el error visible.

La preparación de fotos usa Python 3, NumPy y OpenCV. Docker los instala automáticamente mediante `python3-opencv`. Para ejecutar el worker directamente en Windows instala `numpy` y `opencv-python-headless` en el Python seleccionado; puedes indicar `PYTHON_PATH` si no está en PATH. `node --import tsx scripts/check-ocr-photo.ts RUTA_FOTO SALIDA_JSON` permite comparar una foto local sin subirla ni modificar contabilidad.

## Seguridad y límites operativos

Sesiones Better Auth de 12 horas, cookies HttpOnly, comprobación de sesión y rol en cada operación, origen estricto, límites de subida, firma de archivo, límite de píxeles, documentos privados, ejecución OCR sin shell y worker con recursos limitados en Docker. Se admiten PDF/JPEG/PNG/WebP; no SVG, HTML ni ejecutables. La validación no equivale a un antivirus: mantén Tesseract, Poppler, imágenes base y dependencias actualizados. El registro de cambios conserva usuario, acción, entidad y fecha; no almacena contraseñas ni texto fiscal en el log. Los datos en disco no se cifran por esta aplicación: configura cifrado del servidor y protege las copias.
