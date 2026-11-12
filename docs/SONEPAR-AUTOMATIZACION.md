# Intercambio automático de catálogo y precios Sonepar

El servicio Docker `sonepar` comprueba cada minuto la carpeta privada
`data/automation/sonepar` del servidor. No se sirve por HTTP, se excluye de Git
y tiene permisos 700 (archivos 600). En este servidor la ruta absoluta es
`/home/javier/Almacen/conta-jesus/data/automation/sonepar`.
El usuario propietario debe coincidir con el uid 1000 del contenedor.

Para obtener el JSON del CSV histórico sin modificar la base de datos:
`npm run sonepar:export-csv`. Esta exportación auxiliar incluye los artículos sin
precio y no inicia el plazo de importación. La automatización necesita que los
artículos existan primero en el catálogo de la aplicación; no los crea ni restaura
automáticamente desde copias de seguridad.

Tras `bash scripts/deploy.sh`, el primer ciclo genera `catalago_sonepar.json`
(nombre solicitado) con reference, supplierRef, description, brand y supplier
(`Sonepar`), exclusivamente de la empresa seleccionada y proveedor Sonepar.
Si hay varias empresas, configura `SONEPAR_COMPANY_ID` en `.env`.
`estado.json` registra la exportación; no lo edites ni lo borres.

Deja la respuesta como `precios_sonepar.json`, un array como:

```json
[
  {"supplierRef":"92813","precio_bruto":4.68,"precio_neto":2.34,"fuente":"ya_comprado"},
  {"supplierRef":"78283","precio_bruto":0.39,"precio_neto":0.234,"fuente":"busqueda"}
]
```

Escribe primero un archivo temporal en la misma carpeta y renómbralo al nombre
definitivo cuando esté completo. No reemplaces un archivo que está pendiente:
espera a que se archive. Se procesa como pronto 60 minutos después de la
exportación, incluso si el servicio se reinicia. Se admiten respuestas parciales
(los productos omitidos conservan sus datos). La siguiente exportación se genera
tras completar la importación y cumplir 24 horas desde la anterior.

El neto se guarda en `CatalogItem.currentPrice`, la fecha en `currentPriceAt`,
el bruto en `supplierGrossPrice` y la fuente en `supplierPriceSource`.
Ambas fuentes describen el origen de la consulta; no cambian `price`, que conserva
el precio pagado registrado en la app. No cambia existencias ni documentos.
Si hay varios artículos del proveedor con el mismo supplierRef se actualizan todos
en esa empresa. Las referencias se tratan como texto, conservando ceros iniciales.

La importación completa es transaccional: datos negativos, más de cuatro
decimales, referencias duplicadas, ajenas a la exportación o eliminadas, fuentes
desconocidas y netos superiores al bruto rechazan todo el archivo. El bruto y neto
deben expresarse por la misma unidad que el artículo (unidad o metro), sin IVA.
Un recibo por SHA-256 en `SyncTask` evita aplicar dos veces el mismo archivo.
Los originales quedan en `procesados/`; `resultado.json` registra el éxito y
`error.json` el último error (histórico, puede corresponder a un intento anterior).
Los errores se capturan y se reintentan en el siguiente minuto: corrige y sustituye
el archivo inválido mediante un renombrado atómico.

Consulta los registros con `docker compose logs --tail 50 sonepar`.
Para ejecutar un solo ciclo: `docker compose run --rm sonepar node --import tsx scripts/sonepar-automation.ts --once`.
No publiques estos JSON en GitHub. Copia la carpeta de intercambio junto con tus
copias de la base de datos si necesitas conservar sus archivos fuera del servidor.
