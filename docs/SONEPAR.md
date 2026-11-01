# Investigación del conector Sonepar

## Evidencia disponible · 26/10/2026

El usuario ha facilitado una petición observada en el portal: POST a `https://sonepar.es/graphql?orderDocumentsV2`, operación `orderDocumentsV2(accountId: ID!, document: DocumentToExport!)`, con `documentDownloadId` y `createdAt`. La respuesta selecciona `content` y `contentType`. Esto documenta una descarga individual; no documenta el listado ni acredita una API pública con soporte. La referencia de descarga es opaca: no se fabrica a partir del número de factura.

`src/lib/connectors/sonepar.ts` reproduce ese contrato mediante un transporte autenticado que debe proporcionar el llamador. Conserva el identificador de cuenta como texto, valida entradas y distingue errores HTTP/GraphQL, sesión y límites. No contiene cookies, no está expuesto como ruta web y no está conectado a la importación ni al worker. Las pruebas de contrato usan respuestas simuladas; no acreditan una descarga autenticada real.

`credentials: include` usa las credenciales que ya tenga un navegador para ese origen. Un proceso Node no hereda la sesión del navegador ni las cookies de Sonepar al utilizar esa opción. La app del ERP tiene otro origen, por lo que tampoco debe suponerse que un fetch desde ella tendrá acceso por CORS. El mecanismo de sesión sigue pendiente de diseño y comprobación.

## Pendiente para conectar

- Peticiones reales de listado, paginación y filtros para albaranes, facturas y abonos.
- Respuesta de descarga: comprobar si `content` es base64, URL u otro formato. No se decodifica ni se siguen enlaces sin verificar el formato y el destino.
- Sesión autorizada y renovación, sin exponer credenciales en formularios del ERP, repositorio o registros.
- Identidad externa por empresa/cuenta/tipo/ID y SHA-256 del original; importación idempotente sin duplicar recepciones ni costes.
- Relación factura–albaranes, conciliación parcial y tratamiento completo de abonos antes de contabilizarlos automáticamente.
- Prueba autenticada y revisión de originales descargados, con registros de sincronización y recuperación de errores.

## Alternativa oficial y precio

Sonepar publica servicios [System to System](https://sonepar.es/es-es/static/herramientas-system-to-system). Su [página de preguntas frecuentes](https://sonepar.es/system-to-system/) menciona promociones gratuitas de julio a diciembre de 2023 para determinados clientes FENIE/Telematel/Eureka; no permite asegurar precio ni gratuidad actuales para este ERP propio. Consultar disponibilidad, documentación, alta, mantenimiento, coste por documento y posibles intermediarios. No se ha contactado con Sonepar ni contratado ningún servicio.
