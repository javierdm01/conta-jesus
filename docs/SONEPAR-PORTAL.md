# Consulta automática de precios Sonepar

Se utiliza Playwright, ya incluido en el proyecto, y Chromium porque la web exige
autenticación y carga precios y paginación con JavaScript. La herramienta no llama
a modelos ni APIs de IA. El uso de Codex/Terra para desarrollar y mantener el código
es independiente de las ejecuciones. No hay una medición de tokens o de coste del desarrollo.

Sonepar anuncia [integraciones System to System](https://sonepar.es/system-to-system/)
para catálogos y condiciones comerciales. No se ha verificado una API pública
documentada de precios para España. No se han adivinado endpoints: se usa el portal visible.

## Instalación y sesión

```sh
npm ci
npx playwright install chromium
npm run sonepar:portal -- login
```

En este servidor se comprobaron escritorio gráfico, RDP y Chromium. El usuario
completó personalmente el login y se comprobó su reutilización. RDP usa XFCE/X11.
Desde SSH puedes abrir el navegador en la sesión RDP activa (comprueba el display):

```sh
env -u WAYLAND_DISPLAY DISPLAY=:10.0 XAUTHORITY=/home/javier/.Xauthority GDK_BACKEND=x11 npm run sonepar:portal -- login
```

Completa la verificación, mantén la ventana abierta y pulsa Intro en la terminal
que lanzó el comando. La sesión se guarda en `data/automation/sonepar/portal/session.json`,
archivo 600 y carpeta 700 excluidos de Git. Tras una consulta correcta se conserva
también el estado renovado del navegador. Sesión caducada o CAPTCHA detienen la
ejecución; vuelve a ejecutar login. No se incluyen secretos en código, logs ni resultados.

Sin GUI, ejecuta ese mismo login en un equipo propio con las mismas versiones de
Node/Playwright y transfiere solo la sesión por SSH/SCP a la ruta privada (chmod 600).
Comprueba su validez: el proveedor puede pedir renovar la autorización al cambiar de
equipo. No publiques puertos de depuración ni copies el perfil personal completo.

## Uso manual

```sh
npm run sonepar:portal -- extract --input data/automation/sonepar/catalago_sonepar.json --output data/automation/sonepar/portal/resultado-rico.json --interval-ms 1000 --resume
```

`--limit 4` limita la entrada para pruebas: usa un archivo con las referencias
que quieras comprobar. `--timestamped` conserva una salida nueva por ejecución;
sin esa opción reemplaza la última salida de forma atómica. Los importes y la
cantidad salen como números, sin redondeo general a dos decimales; los datos no
verificables son null. Se conservan registros ambiguos, ausentes y sin referencia.

Primero recorre todas las páginas de «Ya comprado». Comprueba número y huella
de referencias, espera contenido estable y respeta el botón final deshabilitado.
Después busca solo pendientes y exige coincidencia exacta de `supplierRef`,
conservando ceros. El desglose visible confirma bruto y neto. Los envases nunca
se importan como unidades. No se añade al carrito ni se realizan compras.

Solo hay una navegación activa. Entre búsquedas deja al menos un segundo,
configurable al alza. Hay reintentos limitados para fallos transitorios. Un avance
incierto detiene el recorrido para no saltarse páginas. Un 429 detiene la ejecución
y registra una pausa mínima de un minuto (o Retry-After si es mayor) y un intervalo mayor para el siguiente
intento en `portal/rate-limit.json`. No se eluden bloqueos ni verificaciones.

Se guarda progreso por página y búsqueda en `*.state.json`. `--resume` recupera
interrupciones; consultas completadas o con datos de más de 24 horas comienzan de
nuevo. Si se reanuda la fase de compras se vuelven a verificar las páginas para
navegar con seguridad. `*.summary.json` registra duración, estados, fuentes, páginas
y búsquedas individuales lógicas; no cuenta todas las peticiones HTTP de recursos.
La duración mide la invocación actual y excluye tramos anteriores si se reanuda.

## Importación y domingos

`scripts/sonepar-weekly.sh` consulta, conserva copia en `portal/runs/` y publica
precios seguros. Usa flock para evitar solapamientos. Los ejemplos
[service](systemd/sonepar-portal.service) y [timer](systemd/sonepar-portal.timer)
programan los domingos a las 08:00 Europe/Madrid, con límite de dos horas.

El publicador comprueba empresa, referencias exportadas, unidad del catálogo y
antigüedad. Solo publica ambos precios unitarios verificados, EUR y cantidad uno.
Omite envases, unidades incompatibles y datos incompletos, y no sobrescribe un
`precios_sonepar.json` pendiente. Usa el formato snake_case del importador existente.

El servicio Docker `sonepar` supervisa archivos cada minuto, sin consultar la web
ni usar IA. Importa en una transacción desde una hora después de la exportación;
conserva el precio pagado y actualiza neto actual, bruto y fuente. Tras importar se
renueva el catálogo del siguiente ciclo. Ver [intercambio](SONEPAR-AUTOMATIZACION.md).

```sh
systemctl --user list-timers sonepar-portal.timer
journalctl --user -u sonepar-portal.service -n 30 --no-pager
docker compose logs --tail 30 sonepar
```

Sesión, catálogo, precios, progreso y resultados quedan en `data/`, fuera de
GitHub y la web pública. Las pruebas unitarias son sintéticas; las consultas reales
tienen sus propios JSON y resúmenes privados.
