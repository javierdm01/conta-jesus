# Escanear documentos desde la impresora

En **Subir albarán / factura** aparece la opción **Escanear documento**. Escanea en la impresora multifunción de la oficina, crea un PDF y lo pasa al lector de documentos (OCR) de siempre: el documento aparece en **Pendientes de revisar** como si se hubiera subido a mano.

## Cómo funciona

```
Navegador ──► Servidor de la aplicación (Docker) ──eSCL/HTTP──► Impresora
    ▲                     │
    └── PDF ──────────────┘ ──► /api/documents ──► OCR (worker) ──► Revisión
```

- El **servidor** habla con la impresora con **eSCL (AirScan)**, el protocolo de escaneo por red que usan AirPrint/Mopria. No hace falta instalar nada en los ordenadores ni un agente local: el navegador no toca el escáner.
- **Impresoras HP**: si la impresora tiene el servicio propio de HP (**LEDM**, `/Scan/ScanCaps.xml`), los trabajos se hacen por ahí, como el controlador libre de HP (HPLIP). Muchas HP anuncian eSCL pero rechazan los trabajos con 409. Se detecta solo; las capacidades se siguen leyendo por eSCL.
- Las peticiones a la impresora se hacen con `http` nativo de Node, no con `fetch`: el servidor web de algunas HP rechaza los POST/PUT de `fetch`.
- Las páginas llegan en JPEG y el servidor las une en un **PDF multipágina** (sin archivos temporales: todo en memoria).
- El PDF se sube por el mismo camino que un archivo elegido a mano (`/api/documents`): misma validación, mismo control de duplicados y el mismo OCR. No hay un segundo OCR ni otra IA.

Rutas de la API (todas requieren sesión):

| Ruta | Para qué |
|---|---|
| `GET /api/scanners` | Escáneres configurados, conexión, estado y capacidades reales |
| `POST /api/scanners/{id}/scan` | Inicia un escaneo (`source`: `Platen`/`Feeder`, `color`: `RGB24`/`Grayscale8`, `dpi`) |
| `GET /api/scans/{id}` | Estado: `scanning`, `done`, `failed`, `cancelled` y páginas recibidas |
| `GET /api/scans/{id}/pdf` | Entrega el PDF una sola vez y lo borra de memoria |
| `POST /api/scans/{id}/cancel` | Cancela y libera la impresora |

## Configuración

1. **Comprueba que la impresora escanea por red con eSCL / AirScan.** Suele figurar como *AirPrint*, *Mopria Scan* o *eSCL* en la ficha del modelo. Para confirmarlo, abre en un navegador de la oficina:
   `http://IP-DE-LA-IMPRESORA/eSCL/ScannerCapabilities`
   Si ves un XML con `ScannerCapabilities`, es compatible. Si sale un error, activa *AirPrint* / *escaneo por red* / *eSCL* en el panel web de la impresora.
2. **Dale una IP fija** a la impresora (reserva DHCP en el router) para que no cambie.
3. En el `.env` del servidor añade:
   ```
   SCANNERS=Oficina=http://192.168.1.50
   ```
   Varios escáneres, separados por comas: `SCANNERS=Oficina=http://192.168.1.50, Almacén=http://192.168.1.60`.
   Si la impresora usa otro puerto o ruta: `Oficina=http://192.168.1.50:8080/eSCL`.
4. Reinicia: `docker compose up -d web` (o `Iniciar.ps1`).

## Uso

1. **Subir albarán** o **Subir factura de proveedor** → **Escanear documento**.
2. Elige el escáner (por defecto: alimentador si hay, escala de grises, 300 ppp: lo mejor para el OCR).
3. **Escanear y procesar**. Se ve cuántas páginas van llegando; se puede cancelar.
4. Al terminar se muestra la vista previa y el documento se envía solo al lector. Aparecerá en **Pendientes de revisar** para confirmar los datos.

Si falla el envío (por ejemplo, documento ya registrado), **Reintentar envío** reutiliza el mismo escaneo sin volver a escanear.

## Seguridad

- Solo se contacta con las direcciones de `SCANNERS`. El navegador elige un escáner por su número, nunca por dirección (sin SSRF). Si la impresora responde con una dirección de otro equipo, se rechaza; no se siguen redirecciones.
- Hace falta sesión iniciada; iniciar o cancelar exige además el origen de la aplicación (protección CSRF). Cada escaneo solo lo ve quien lo inició.
- Un escáner atiende un trabajo a la vez (también se comprueba que la impresora esté libre antes de empezar).
- No se ejecuta ningún programa del sistema. Máximo 20 páginas y 20 MB por escaneo (los mismos límites que la subida). El PDF se borra de la memoria al entregarse o a los 10 minutos.

## Limitaciones

- **Solo impresoras con eSCL/AirScan o HP LEDM por red.** Escáneres USB o solo WIA/TWAIN no están cubiertos (habría que añadir un agente local con NAPS2; no se ha hecho para no duplicar el sistema mientras haya impresora de red).
- **Sin descubrimiento automático**: el servidor Docker no recibe el multicast de la red (mDNS/Bonjour), por eso la impresora se configura por IP.
- **HTTP en la red local.** Muchas impresoras solo tienen HTTPS con certificado autofirmado, que el servidor rechaza: usa la dirección `http://`.
- **Blanco y negro (1 bit) no se ofrece**, porque las páginas se piden en JPEG; usa escala de grises, que además lee mejor el OCR.
- Por el cristal se escanea una hoja por trabajo; para varias hojas usa el alimentador.
- Los trabajos viven en la memoria del proceso web: si se reinicia el contenedor durante un escaneo, hay que repetirlo.

## Verificación

**Probado con hardware real (13/11/2026): HP Officejet Pro 8600 (CM749A) en `http://192.168.0.101`** — cristal, escala de grises, 200 y 300 ppp: PDF A4 en ~5-7 s mediante LEDM. Por eSCL esta impresora rechaza los trabajos (409). Pendiente de probar con hardware: alimentador (ADF) con varias hojas y color.

- `npm test` incluye `tests/escl.test.ts`, con un **servidor eSCL y otro HP LEDM simulados** (solo dentro de la prueba): varias páginas por alimentador, cristal, opciones no admitidas, impresora ocupada, respuestas que apuntan a otro equipo y cancelación. También lee las capacidades reales guardadas de la HP 8600 (`tests/fixtures/`).
