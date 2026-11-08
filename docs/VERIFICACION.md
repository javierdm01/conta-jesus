# Alcance y comprobaciones

## Albaranes provisionales y factura definitiva · 27/10/2026

El albarán puede recibirse sin importes o conservando tarifas unitarias provisionales. La opción **Coste pendiente de factura** guarda esos precios en las líneas originales con neto pendiente y mantiene el valor del lote desconocido. La factura puede seleccionar varios albaranes completos del mismo proveedor. Sus líneas se vinculan a los lotes existentes; no se crean existencias ni códigos nuevos. Se conserva la compatibilidad con la vinculación anterior de un albarán.

58 pruebas unitarias y TypeScript correctos; Docker reconstruido y desplegado. `tests/inventory-integration.ts` supera OCR real, reservas, consumos, devoluciones, concurrencia, recuentos, factura posterior, permisos, pedidos parciales y PDF mixto. El nuevo `tests/receipt-invoice-checks.ts` comprueba dos albaranes de 3 + 2 unidades: tarifa provisional 9,99 conservada sin valor de almacén; factura definitiva de 5 × 4 = 20; dos unidades utilizadas antes de la factura se valoran en 8, las tres restantes en 12, sin duplicar lotes ni costes. Se rechazan cantidades que no cubren la recepción, lotes ajenos a la selección, documentos ausentes y doble facturación.

La propuesta de precio para una línea agregada exige referencia, unidad y suma de cantidades coincidentes y un único candidato; casos ambiguos requieren revisión. La facturación parcial de un mismo albarán sigue pendiente. El manual actualizado explica la selección de albaranes y los precios provisionales.

## Ampliación OCR con tres fotografías nuevas · 27/10/2026, revisión posterior

Resultados y límites actuales en [la comparación detallada](PRUEBA_OCR_2026-10-27.md). INRA: un artículo, cuatro unidades, 41,82 €; Splitmania: dos artículos, ocho unidades, 45,98 €; Sonepar en papel: cuatro artículos, seis unidades, número y fecha, recepción pendiente de coste porque no imprime importes/descuentos. Probados directamente con el extractor del contenedor; 55 unitarias y TypeScript correctos. La marca TELEVES sigue integrada en la descripción de INRA. El ensayo inicial fallido que figura debajo se conserva como historial, no como descripción de esta versión.

La foto de pantalla 9453 se ha vuelto a comprobar en Linux: cuatro artículos, descuentos del 50 %, base 44,02, IVA 9,24 y total 53,26. La nueva 9467 corresponde al mismo número 413361976. Las pruebas no confirman material de la empresa real.

Imagen Docker reconstruida y desplegada. Las tres fotografías nuevas superan además subida real → worker → propuesta almacenada → revisión de campos en navegador, con emulación móvil de 390 px. `tests/smoke-new-ocr.mjs` y `data/ocr-sonepar/verificacion-nuevos-app.json`. La factura Splitmania anterior conserva sus cinco líneas y 385,99 € en una regresión de solo lectura. Se retiran los registros de la empresa temporal al finalizar.

## Prueba Sonepar con dos fotos de pantalla · 27/10/2026

Prueba NO superada por el OCR actual. Ambas fotos corresponden a la misma página 1/1 del albarán 413361976 del 26/10/2026; no son dos páginas y no se han sumado dos veces. Referencia visual revisada: cuatro artículos, seis unidades propuestas, 50 % de descuento en cada línea, netos 21,92 + 11,73 + 4,47 + 5,90 = 44,02; IVA 9,24; total 53,26.

Ejecución real mediante `scripts/check-ocr-photo.ts` con tipo DELIVERY: una foto produce cero líneas/texto no legible; la otra agota una ejecución Tesseract. Una variante suavizada reconoce fecha y total, sin artículos. Otras variantes de limpieza y recorte no proporcionan una extracción completa fiable. La trama de la pantalla interfiere en la lectura; quedan por comprobar parser de precios con seis decimales, cabeceras abreviadas y referencias auxiliares. No se ha sustituido el resultado automático por la lectura humana ni modificado stock/contabilidad.

Diagnóstico, salidas OCR y referencia humana separados en `data/ocr-sonepar/COMPARACION.md` y `lectura-humana.json`. La agrupación de las dos imágenes se ha hecho para esta prueba; no implica que la aplicación ya admita agrupar o detectar automáticamente fotos duplicadas. El diagnóstico ahora permite indicar PURCHASE o DELIVERY como cuarto argumento. Esta incidencia sigue abierta aunque las pruebas previas de la factura Splitmania fueran correctas.

## Factura fotografiada y alta contextual de proveedor · 25/10/2026

Se ha contrastado la imagen original subida con el resultado guardado. Antes: 634 caracteres, ninguna línea y sin número, fecha, base o IVA propuestos. La lectura desplegada ahora prepara la imagen localmente (orientación EXIF, iluminación, inclinación y reglas de tablas), reconstruye filas por coordenadas TSV y relee referencias de baja confianza mediante recortes. Los originales no se modifican ni salen a servicios externos. La preparación sigue las recomendaciones de [Tesseract sobre calidad y tablas](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

Comparación de esta factura real, después de volver a procesarla en el worker Docker:

| Campo impreso | Resultado comprobado |
|---|---|
| Proveedor | SPLITMANIA TOLEDO S.L - TOLEDO; CIF y teléfono recuperados para el alta |
| Factura | 28-95151; no se confunde con el albarán 27-69503 |
| Fecha | 28/09/2026 |
| Base | 319,00 € |
| IVA | 66,99 €; 21 % |
| Total | 385,99 €; el resumen impreso conciliado prevalece sobre anotaciones manuscritas |
| Material físico | Equipo 1 × 319,00; soporte 1 × 8,00; amortiguador 1 × 1,50 |
| Conceptos económicos | Tasa 0,57 × 0,00; regalo −1 × 9,50 |
| Referencias y descripciones | Cinco filas comparadas; continuaciones PRO/AMORTIGUADOR conservadas; KEM1BT0000 releída sin confundir O/0 |

La tabla no imprime unidad de medida. Se propone `ud` con advertencia explícita, sin convertir medidas del nombre en unidades facturadas. La tasa y el regalo se proponen como conceptos económicos: se conservan en las líneas del documento, sin generar lotes ni etiquetas. Si se recibe en almacén, su importe se reparte proporcionalmente entre los lotes, conservando los precios originales de factura y los céntimos de la base. No se infiere que el regalo corresponde a un lote concreto.

Verificación:

- 40 pruebas unitarias y TypeScript correctos; construcción optimizada Docker completada y web/worker actualizados.
- `tests/ocr-review-integration.ts`: empresa aislada; proveedor por API, cinco líneas económicas/documentales y tres lotes físicos; consumo con coste total 319; imputación directa con abono; valoración del albarán sin duplicar existencias; volver a leer un documento confirmado devuelve 409. Registros y archivo de prueba eliminados al terminar.
- `tests/smoke-ocr-review.mjs`: alta real de un proveedor de prueba dentro de la revisión sin perder una base editada; proveedor seleccionado y confirmación de cinco conceptos HTTP 200. Después, cuenta del responsable y factura real: original visible, todos los campos y las cinco líneas iguales a la comparación, escritorio y emulación móvil sin desbordamiento. No se confirma la compra real.
- Resultado final: una empresa, un usuario, un documento real en REVIEW, cero lotes y cero costes. Se conserva la salida anterior en `data/ocr-debug/document-before-20261025.json`; capturas en `data/screenshots/ocr-factura-desktop.png` y `ocr-factura-movil.png`.

La revisión permite crear y seleccionar un proveedor con los datos propuestos, consultar foto/texto, ver el total y la diferencia de bases y volver a leer OCR. El alta contextual también está en pedidos; el menú Crear ofrece proveedores y clientes desde cualquier sección. La IP actual de la red se ha actualizado en la configuración privada y documento de acceso; localhost sigue autorizado.

Esta evidencia corresponde a la foto comprobada. Otros diseños, fotos borrosas, retenciones, varias bases de IVA o abonos completos requieren casos adicionales; la revisión del original sigue disponible y no se confirma contabilidad automáticamente.

## Acceso móvil por red local: puerto 3000

Incidencia del 19 de octubre de 2026: se intentaba acceder por `192.168.1.153:3001`, reservado a desarrollo. Docker publicaba únicamente `127.0.0.1:3000` y autenticación/operaciones solo admitían el origen de localhost. Se configura la URL principal LAN `http://192.168.1.153:3000`, publicación del puerto en las interfaces y una lista explícita compartida `APP_TRUSTED_ORIGINS` que conserva también `http://localhost:3000`. No se cambian credenciales, secreto de sesión ni datos de empresa. Se añade la dirección móvil al documento privado de acceso.

Verificado contra la versión Docker reconstruida y arrancada: 36 pruebas unitarias, TypeScript y compilación de producción correctos. `node --env-file=.env tests/smoke-lan-login.mjs` prueba ambos orígenes en Chromium con emulación móvil: formulario de acceso HTTP 200, panel visible, recarga autenticada, `/api/state` HTTP 200 y comprobación del filtro de mutaciones mediante una acción inexistente (404, sin guardar datos). Un origen ajeno devuelve 403 en autenticación y operaciones. Cookies HttpOnly/SameSite=Lax, sin desbordamiento horizontal ni errores JavaScript. No se ha probado desde el dispositivo físico del usuario ni se ha cambiado el cortafuegos de Windows.

Si cambia la IP del ordenador, hay que actualizar la configuración de acceso y los QR que incorporen la URL anterior. El puerto 3001 continúa reservado al desarrollo.

## Incidencia de acceso: dos servidores en localhost

Comprobación del 19 de octubre: las credenciales de `data/ACCESO_LOCAL.txt` coinciden con la configuración y devuelven HTTP 200 en Docker por IPv4. Un proceso Next.js del mismo proyecto respondía por IPv6 en el mismo puerto con HTTP 500. Se resolvió el conflicto y se reserva el puerto 3001 para `npm run dev`. Prueba posterior con Chromium sin forzar resolución DNS: inicio normal en `http://localhost:3000` usando el documento, apertura del panel y sesión conservada al recargar, correctos. No se restableció la contraseña ni se alteraron datos de empresa.

## Revisión de continuidad del 19 de octubre de 2026

Se ha usado Graphify como mapa de dependencias y contrastado cada frente con el código actual y pruebas ejecutadas. Se conservan las aportaciones del usuario en OCR, coincidencia de proveedor, gastos con IVA y Trimestres. El estado del grafo no se toma como evidencia de funcionamiento.

Correcciones realizadas:

- Tailwind fallaba con `Invalid code point 2929695` al recorrer los archivos generados de Graphify. Se limita su búsqueda a `src` y se excluye `graphify-out` de Docker. Compilación de producción correcta y compilación local de estilos comprobada con el grafo presente. Las fuentes explícitas se ajustan a la [documentación de Tailwind](https://tailwindcss.com/docs/detecting-classes-in-source-files).
- El ZIP trimestral emplea identificadores en sus nombres y los mismos nombres en el CSV. Se comprueba la colisión de nombres de proveedores que se vuelven iguales al sanearlos.
- La descarga comprueba existencia, lectura y tamaño de originales antes de transmitir. Un original ausente devuelve 409 y la pantalla lo muestra. La prueba aparta únicamente un archivo propio de prueba y lo restaura en `finally`.
- «Resumen CSV» contiene una sola tabla, con una marca UTF-8; los listados separados están dentro del ZIP. La preparación del paquete queda auditada sin afirmar que terminó la descarga.
- Backup espera a PostgreSQL y, si falla, registra el intento y reintenta en 300 segundos. Prueba aislada en contenedor con `/backups` en tmpfs correcta. El fallo posterior a una copia se distingue en el panel.
- Nuevo comando de PowerShell `scripts/backup-now.ps1` para solicitar una copia nueva y comprobar sus sumas, evitando el problema previo con rutas de montaje de Windows.

Verificación de los flujos que habían quedado pendientes:

- 33 pruebas unitarias y TypeScript correctos; compilación optimizada Docker y auditoría de dependencias sin vulnerabilidades reportadas en la construcción.
- Pedidos por HTTP/PostgreSQL: recibir 8 de 20 deja 12; dos recepciones concurrentes de 12 producen una confirmación y un 409, sin exceso. Cierre de pendientes, referencia/unidad, permisos de técnico y estado del OCR comprobados.
- PDF mixto real generado para la prueba: primera página con texto nativo y segunda con imagen JPEG escaneada. Se leen ambas en orden, con líneas de 100 m y 20 ud y base de 150,00.
- Navegador: crear pedido de 20, subir/leer/revisar albarán de 8, vincularlo al pedido y cancelar sus 12 pendientes; perfil de etiqueta guardado, recargado, aplicado y eliminado; señal OCR y copia mostradas en Configuración.
- Trimestres en escritorio y móvil: periodo vacío y con facturas, descarga ZIP y error visible de comprobación. Sin errores JavaScript ni desbordamiento horizontal; capturas revisadas.
- Etiquetas: siete copias, QR y Code 128 decodificados, medidas de 62 × 40 mm; salida y devolución repetidas correctamente en navegador. Se actualiza la prueba al nombre actual del botón «Escanear código».
- Regresión de compras, sustitución, horas, presupuesto, ventas, cobros, permisos y PDF repetida: beneficio de referencia 650 €; registros transitorios retirados.

La impresión física, formatos reales del proveedor y validación con asesoría siguen fuera de estas pruebas sintéticas. Pedidos parciales no equivalen a conciliación parcial de facturas: esta última sigue pendiente.

Cierre de instalación: imagen final construida e instalada; no había migraciones pendientes. La prueba con la cuenta habitual recorre nueve secciones y escritorio/móvil sin errores JavaScript. El ensayo trimestral se repite tras corregir el CSV y confirma una sola tabla UTF-8, colisiones de nombres y ausencia de originales. Datos de prueba retirados: permanecen un usuario y una empresa; cero trabajos, documentos, lotes, movimientos, recuentos o pedidos ficticios. Copia final solicitada con `powershell -File scripts/backup-now.ps1`: `20261019T084026Z`, con `database.dump: OK` y `documents.tar.gz: OK` en la comprobación independiente. Base saludable y servicios web, worker y backup activos.

## Entrega del 19 de octubre de 2026: OCR, proveedor y cierre trimestral

**Completado y comprobado**
- Elección del proveedor por NIF exacto o, si no hay, por nombre más parecido con aviso del porcentaje y candidatos (`src/lib/supplier-match.ts`).
- Lectura ampliada: fechas con año corto o en letra (sin tomar vencimientos), número de factura con varias etiquetas, base/IVA/total, tablas Base/%/Cuota, IVA o base calculados solo si cuadran, aviso si base + IVA no coincide con el total, unidades con ruido de OCR y referencia al inicio de la descripción.
- Worker: si una página no deja líneas reconocibles se reintenta Tesseract con los modos de página 6 y 4 y se conserva el mejor texto.
- IVA soportado en gastos generales (migración incremental `20261019090000_overhead_tax`, sin reinstalar la base).
- Pantalla «Trimestres» y API `/api/quarters` (JSON, CSV y ZIP en streaming con las facturas originales). Solo el responsable; el técnico recibe 403.
- Pruebas: 33 unitarias (`npm test`, incluye OCR, proveedor aproximado y ZIP), `tsc` sin errores, compilación de producción, `test:integration` repetido en Docker (OCR de imagen y PDF) y `test:quarters` contra PostgreSQL (totales, IVA, avisos, permisos, CSV y ZIP). ZIP verificado con `zipfile` de Python (CRC correctos). Imagen reconstruida y servicios reiniciados.

**Pendiente o sin comprobar**
- Medir aciertos por campo con albaranes y facturas reales del proveedor habitual; hoy las pruebas usan textos y una imagen sintéticos.
- La pantalla «Trimestres» no se ha revisado en navegador (escritorio y móvil) ni con teclado/lector de pantalla.
- La copia previa a la migración no se generó manualmente (el script falló por una ruta de Windows); se aplicó una sola columna aditiva y existe copia automática del mismo día.
- Cifras aproximadas: sin desglose por tipo de IVA, recargo de equivalencia, prorrata ni modelos oficiales (303, 111, 130/131, 390). Validar con la asesoría.
- Las ventas solo entran con archivo si se registraron desde una factura de cliente subida.

## Continuación: recuentos y control diario del almacén

Recorrido verificado: ficha de lote → formulario de recuento → API autenticada → transacción Serializable en PostgreSQL → movimientos/valoración → saldo e historial devueltos al usuario. Se añade `StockCount` mediante la migración incremental `20261018220000_stock_counts`, conservando los lotes y documentos anteriores.

- Veinte pruebas unitarias correctas, incluidas reservas y mínimos de material libre, filtros combinados, CSV con separadores/decimales y neutralización de fórmulas, y reparto de céntimos.
- TypeScript y compilación optimizada de Next.js en Docker correctos; migración aplicada sin reinstalar la base.
- Pruebas HTTP: faltante 17 → 15, recuperación 15 → 17 y registro sin diferencia; un recuento no añade costes a una obra.
- El técnico recibe 403 al intentar contar y no recibe el registro administrativo de recuentos ni valores. Cantidades fraccionadas en unidades se rechazan. Saldo por debajo de reservas, recuperación excesiva, petición repetida y formulario obsoleto se bloquean sin cambios parciales.
- Recuento a cero y dos recuperaciones simultáneas: una se confirma y otra recibe 409. La recuperación posterior completa el saldo correctamente.
- Albarán sin precios: el faltante permanece sin importe hasta recibir factura; después se valora y su recuperación revierte el mismo coste. También se comprueba la revaloración de ajustes previamente valorados.
- Corregido un caso de redondeo de devoluciones: seis devoluciones de una unidad sobre un consumo total de cuatro céntimos nunca generan importes negativos ni devuelven más valor que el original. Comprobado contra la API y la base, además de la prueba unitaria.
- Regresión anterior repetida: compras y sustitución de albarán, horas, presupuesto, ventas, cobros, roles y PDF con OCR correctos; beneficio de referencia 650 €.
- Navegador de etiquetas: siete copias, QR/Code 128 decodificados, medidas de 62 × 40 mm y uso/devolución correctos en escritorio y móvil.
- Navegador de control diario: recuento 17 → 15 → 17, registro sin diferencia, trabajo preseleccionado conservado al entrar en ficha, mínimo sobre material libre, combinación ubicación/proveedor/estado, ordenación y CSV que contiene únicamente el lote filtrado. Fallo 503 simulado: mensaje visible, datos anteriores conservados y recuperación al actualizar. Sin errores JavaScript ni desbordamiento horizontal; capturas revisadas en escritorio y móvil.
- Cierre: acceso con la cuenta habitual y siete secciones comprobados; escritorio y móvil sin errores JavaScript. Empresa y documentos de prueba retirados. Recuento final en PostgreSQL: un usuario, una empresa y cero trabajos, documentos, lotes, movimientos o recuentos ficticios. Servicios web/worker activos, base saludable y copia final completada `20261018T210546Z`; copia previa a migración `20261018T210025Z`.

Los recuentos permiten recuperar faltantes del mismo lote; no son una entrada libre de material ni un asiento fiscal. La impresión física y la extracción adaptada al proveedor habitual siguen necesitando validación con el hardware y documentos reales. El plan ampliado detalla estas dependencias y las fases posteriores.

## Segunda iteración: navegación, almacén y etiquetas

Se incorpora el layout persistente de Next.js, precarga de rutas, estado compartido con SWR y carga diferida de módulos. La prueba local comparable de cinco cambios de sección pasó de una mediana de 398 ms a 63 ms; las peticiones completas de estado durante esos cambios pasaron de cinco a cero, conservando el panel en los cinco casos.

El almacén incluye lotes con código único, agrupación de artículos iguales de una recepción, ubicaciones, ficha, reservas, consumo por trabajo, devoluciones, valoración de albaranes sin precio con factura posterior, búsqueda, escaneo y preparación de etiquetas en rollo con QR, Code 128 o ambos. Se puede escoger el número de etiquetas por lote y modificarlo en la vista previa. Las etiquetas no modifican existencias.

Validación realizada:

- Catorce pruebas unitarias de cálculos, OCR, unidades, agrupación e identificadores: correctas.
- Prueba HTTP real con PostgreSQL y OCR de imágenes: veinte unidades iguales generan un único lote; recibir material no genera coste del trabajo hasta consumirlo.
- Reservas, consumos, sobrantes, intentos repetidos, salidas concurrentes y permisos: correctos, sin sobreventa ni doble coste.
- La factura del albarán mantiene cantidades y códigos; tres unidades usadas pasan de 15 a 18 € al actualizar su precio de 5 a 6 €, sin otra entrada.
- Albarán sin precio: salida física con aviso de coste provisional, valoración posterior y devolución con importe correcto.
- En navegador: almacén, ficha, consumo/devolución y escritorio/móvil sin desbordamiento de la página.
- Siete copias del mismo identificador, edición de copias en vista previa, QR y Code 128 generados y decodificados, medidas calculadas de 62 × 40 mm. Composición de etiqueta revisada visualmente tras ajustar el texto. No se ha realizado una prueba física con la impresora del usuario.
- Recorrido de recepción comprobado en la interfaz: subida, cola/OCR, revisión sin precios, recepción de siete unidades y preparación de cuatro etiquetas del lote.
- Pruebas anteriores de compras, horas, presupuestos, ventas, cobros y PDF repetidas correctamente; el beneficio de referencia sigue siendo 650 €.
- Cierre de instalación: acceso y seis secciones comprobados en escritorio y móvil sin errores JavaScript. Registros de prueba retirados; permanece una empresa con su usuario, sin trabajos, documentos ni movimientos ficticios. Servicios activos y copia final completada: `20261018T205223Z`.

Consulta [el plan de continuación](PLAN_DE_CONTINUACION.md) y [el manual de almacén](ALMACEN_Y_ETIQUETAS.md) para límites y siguientes pasos. La conciliación parcial, los recuentos/ajustes, las transferencias y la impresión directa ZPL/TSPL siguen pendientes.

Este archivo se completa con los resultados de ejecución. Las pruebas usan registros expresamente identificados como prueba y una empresa separada; no se instalan ejemplos como información real del negocio.

## Resultados del 18 de octubre de 2026

- Nueve pruebas automatizadas de cálculos, entradas y propuestas OCR: correctas.
- TypeScript y compilación optimizada Next.js 16.4.2: correctos.
- Prueba completa HTTP con PostgreSQL 16 y Tesseract local spa+eng: correcta. Alta de cliente/proveedor/trabajo → imagen → OCR → revisión → sustitución de albarán → horas → presupuesto → factura de cliente → cobro.
- Resultado contrastado: 1.850 € netos de venta, 1.200 € de costes, 650 € de beneficio y 35,1 % de margen. El cobro bruto de 2.238,50 € no modifica el beneficio.
- Seguridad: sesión obligatoria, origen no autorizado rechazado, HTML disfrazado de imagen rechazado, archivo repetido rechazado, confirmación repetida rechazada, suma de líneas incoherente rechazada, técnico sin acceso a trabajos ajenos ni información financiera global.
- Navegador Chromium en 1440 px y 390 px: inicio, expediente, formulario de horas, menú Añadir y gráficos correctos, sin errores JavaScript ni desbordamiento horizontal de la página. Las tablas anchas permiten desplazamiento interno.
- `npm audit`: cero vulnerabilidades conocidas tras actualizar Sharp y dependencias transitivas. Esto describe el resultado del análisis en la fecha indicada.
- Imagen Docker construida y Compose arrancado: PostgreSQL saludable, migraciones aplicadas, web y worker activos.
- Flujo HTTP repetido dentro de Docker, incluido PDF real con Poppler y Tesseract spa+eng: correcto. La edición de tarifa laboral no cambia el coste de horas anteriores.
- Instalación principal abierta en Chromium: inicio de sesión y seis secciones correctos, escritorio y móvil, sin errores JavaScript. Contiene una empresa y su responsable, cero trabajos y cero documentos de prueba.
- Copia automática generada; SHA-256 de volcado y documentos comprobados. Restauración mediante `scripts/restore.sh` en una base y un volumen independientes: correcta, con la cuenta inicial recuperada y las tablas disponibles. Se retiraron la base y el volumen temporales después de verificarla.

Las capturas de prueba se guardan en `data/screenshots` y muestran claramente una empresa y registros de prueba. Los registros y archivos transitorios se eliminan al finalizar la prueba de integración.

## Implementado

Inicio, acceso local con Better Auth, roles, clientes, proveedores, trabajadores y coste horario, trabajos y estados, documentos privados, OCR en cola persistente, revisión y reparto por filas, sustitución completa de un albarán, costes manuales, horas y coste histórico, presupuesto y aprobación, registro de facturas de venta y cobro acumulado, rentabilidad de trabajo/servicio, gastos generales, CSV y registro de cambios. Diseño adaptable, manifiesto PWA y aviso sin conexión. Docker Compose y scripts de copia/restauración.

## Pendiente y límites

OCR entrega texto y propone cabeceras reconocidas, proveedor por NIF y líneas con cantidad, unidad, precio, descuento e importe explícitos que concilien. No cubre todos los formatos tabulares de proveedores. Se corrige orientación EXIF y contraste; no perspectiva. El usuario debe comprobar las propuestas, completar lo que falta y confirmar los datos. Hay almacén por lotes, reservas, consumos y devoluciones físicas en la segunda iteración. Siguen pendientes pedidos, recepciones parciales, abonos fiscales, conciliación parcial, comparación de proveedores, importación CSV/Excel/IMAP, alertas periódicas y contratos operativos. El esquema prepara parte de fase 2 sin mostrar pantallas ficticias. No hay inteligencia externa obligatoria.

La primera versión no implementa anulación general de registros confirmados, recuperación de contraseña, emisión de PDF de presupuestos/facturas ni filtros por periodos. La cobertura OCR se ampliará con formatos reales de la empresa y los flujos de corrección se completarán en siguientes iteraciones. No usar para una migración definitiva de datos sin revisar estas limitaciones.

## Pruebas reproducibles

`npm test`: fórmulas de margen, redondeo, unidades/cantidades, costes, ausencia de ingresos, impuestos, fechas y entradas inválidas. `npm run typecheck`: TypeScript. `npm run build`: compilación optimizada. `npm run test:integration`: HTTP real con PostgreSQL, OCR de una imagen de prueba, confirmación, sustitución de albarán, horas, venta, cobro y comprobación de roles; requiere servidor y worker.

## Revisión visual de documentos, imagen tipo escáner y eliminación de subidas (1–2 de noviembre de 2026)

Resultados ejecutados (Docker, PostgreSQL y OCR reales; datos de prueba retirados al terminar):

- `npm run typecheck` sin errores y `npm test`: 78/78 (incluye `ocr-words`, `ocr-evidence`, `evidence-boxes`, `scan-page`, `document-delete` y `uuid`). Compilación de producción dentro de la imagen Docker correcta; migraciones aplicadas.
- Integración en el contenedor: `test:integration` (con PDF real), `test:inventory` (pedidos, PDF mixto, varias entregas por factura), `test:quarters`, `test:pages`, `test:delete` y `tests/users-integration.ts`: todas correctas.
- Navegador: `test:review-visual` (recuadros etiquetados, foco campo↔recuadro, documento sin páginas, eliminar y volver a subir) y `test:tablet` (960×540, 1024×600 y 1280×800: sin desplazamiento horizontal, barra lateral ≤ 64 px, visor ≈ 45 %, controles ≥ 44 px).
- OCR, imagen escaneada frente a original sobre cuatro muestras (tres con lectura humana de referencia): sin mejora en las ya limpias y un dato peor (fecha de la oferta 9466) cuando no se detecta papel. Por eso el worker lee la imagen original cuando la escaneada es `fallback`; la escaneada solo se muestra. **No medido todavía con fotos torcidas o con sombras.**
- Correcciones halladas al probar: `crypto.randomUUID` no existe con `http://IP` (ahora `src/lib/uuid.ts`, con prueba) y el diseño de tablet no cubría 1280×800 (límite de altura 820 px).
- Pendiente: medir el OCR con fotos reales difíciles y valores de referencia.
# Clientes · 07/11/2026

En una empresa de prueba aislada se comprobó desde navegador la creación y edición de cliente, la búsqueda por nombre sin tildes y teléfono, la persistencia tras recargar y su selección y asociación al crear un trabajo. Se verificaron anchos de 390, 768 y 1440 px sin desbordamiento horizontal. Los datos de prueba se eliminaron. TypeScript y 85 pruebas automáticas completaron correctamente. No se ha probado en dispositivos físicos. El nuevo flujo de facturación y presupuestos con cliente directo sigue pendiente.

