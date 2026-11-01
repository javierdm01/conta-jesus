# Prueba de los documentos nuevos · 27/10/2026

Origen: tres fotografías nuevas de `C:\Users\javie\Descargas\FACTURAS PRUEBA`. Comparación visual independiente y ejecución del OCR local dentro del contenedor Linux, con los archivos originales. Las expectativas de prueba no se pasan al extractor. No se registran compras ni se confirman recepciones reales.

| Foto | Documento | Número y fecha recuperados | Artículos / cantidad | Base / IVA / total |
|---|---|---|---|---|
| 9466 | Oferta de venta INRA | 6108608 · 22/10/2026 | 1 / 4 ud | 34,56 / 7,26 / 41,82 € |
| 9467 | Albarán Sonepar sin descuentos ni importes | 413361976 · 26/10/2026 | 4 / 6 ud | Ausentes en la foto: se dejan pendientes |
| 9468 | Albarán Splitmania | 27-69173 · 01/09/2026 | 2 / 8 ud | 38,00 / 7,98 / 45,98 € |

## Comparación de artículos

- **INRA:** referencia 543603; MINI REPART.5 2400MHz EASYF 3D 8,5/7,5dB; cantidad 4; tarifa 15,710; descuentos consecutivos 45 % y 0 %; importe redondeado 34,56. Emisor y CIF B13555594 recuperados. TELEVES se conserva en la descripción; no queda separado en el campo de marca. Se muestra una advertencia de oferta/presupuesto: este documento no acredita una entrega.
- **Sonepar:** 11513 × 2, 948530 × 2, 11502 × 1 y 948684 × 1. Referencias de fabricante 8122, 8911 BT, 8107 y 8907 BT, con marca NIESSEN. Las tarifas impresas son 21,92, 11,73, 8,93 y 11,79; no se utilizan como coste neto porque esta versión no imprime descuentos ni importes. Se propone recepción sin coste, pendiente de completar. El CIF del cliente no se asigna al proveedor.
- **Splitmania:** 25950X45X1, soporte 500 × 450 × 1,5 mm, 4 × 8,00 = 32,00; KEM1BT0000, KEMPO AG-35 PACK 4 UNID AMORTIGUADOR, cantidad facturada 4 × 1,50 = 6,00. No se multiplica automáticamente la cantidad por el tamaño del pack descrito. CIF B45390671 y correo del proveedor recuperados.

El Sonepar 9467 es otra representación del **mismo albarán** fotografiado anteriormente en las imágenes 9453 y 9454. No son tres entregas. No se han creado existencias reales durante la prueba. La detección de archivos idénticos por hash no equivale a reconocer automáticamente dos fotografías distintas del mismo papel.

## Cambios comprobados

- Diferenciar textura de papel y trama intensa de monitor; suavizado fuerte reservado al segundo caso.
- Recortar y corregir perspectiva antes de limpiar reglas, evitando procesar el teclado y el fondo como una tabla.
- Variantes de grises y blanco/negro, lectura por coordenadas, separación de barras pegadas a importes y descuentos consecutivos.
- Conservar dimensiones en las descripciones y releer referencias ambiguas O/0.
- Releer el resumen fiscal por separado y aceptarlo únicamente cuando base e impuesto suman el total impreso.
- Conservar artículos de un albarán con tarifa pero sin importes sin convertir una tarifa en coste neto.
- Emisor legal próximo al CIF; referencias auxiliares y marca vinculadas al artículo correspondiente.

55 pruebas unitarias y TypeScript correctos. La prueba HTTP de revisión, proveedor, cinco conceptos económicos, tres lotes físicos, ajuste negativo y valoración sin duplicados también pasa en una empresa temporal. Imagen Docker construida y web/worker actualizados.

`tests/smoke-new-ocr.mjs` superado con las tres fotos: inicio de sesión, subida HTTP real, cola del worker, propuesta almacenada, apertura de revisión, número, fecha, referencias, cantidades, importes disponibles y formulario a 390 px sin desbordamiento. No se confirma ninguna de estas recepciones. Salida en `data/ocr-sonepar/prueba-app.log`, propuestas en `verificacion-nuevos-app.json` y capturas `movil-9466.png`, `movil-9467.png`, `movil-9468.png`.

Regresión de la factura Splitmania anterior: diagnóstico de solo lectura dentro de Linux con cinco líneas, base 319,00, IVA 66,99 y total 385,99. No se ha vuelto a poner en cola ni modificado el documento confirmado del usuario. Resultado en `data/ocr-sonepar/regresion-final.json`.

Comprobación adicional de la foto antigua de pantalla **9454**, con la versión desplegada: recupera cuatro artículos, referencias de proveedor, cantidades, precios, 50 % de descuento, fecha/número y 44,02 + 9,24 = 53,26. **No es una lectura perfecta:** en la segunda línea propone la referencia de fabricante `6011BT` donde la imagen imprime `8911 BT`; algunas descripciones conservan ruido. Se mantiene como fallo específico pendiente de referencias auxiliares en trama de monitor, separado del ensayo nuevo de la copia en papel. Salida real en `data/ocr-sonepar/pantalla-9454.json`.

Tras retirar la empresa temporal: una empresa, un usuario, un documento real, tres lotes y cero costes, igual que antes de las pruebas. Copia posterior verificada por SHA-256 en `backups/20261027T213845Z`.

## Evidencias reproducibles

- `data/ocr-sonepar/nuevos-lectura-humana.json`: lectura visual esperada.
- `data/ocr-sonepar/verificado-9466.json`, `verificado-9467.json`, `final-9468.json`: texto real y propuesta del extractor.
- `node --import tsx scripts/compare-ocr-samples.ts`: diferencias por campo, conservando el detalle pendiente de la marca de INRA.
- `scripts/check-ocr-photo.ts <original> <salida.json> DELIVERY`: diagnóstico sin escribir en la base.
- `tests/smoke-new-ocr.mjs`: subida real y comprobación del formulario en empresa temporal; requiere el fixture privado de integración. Prueba superada para las tres fotos.

La unidad `ud` es una propuesta cuando no está impresa. Se mantiene la revisión del original antes de confirmar.
