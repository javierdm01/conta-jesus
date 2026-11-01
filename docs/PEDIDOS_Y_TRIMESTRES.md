# Pedidos, perfiles y preparación trimestral

## Pedidos y entregas

En **Pedidos**, el responsable registra proveedor, número, fecha y artículos. El precio opcional es orientativo: crear el pedido no mueve existencias, no genera gastos y no envía nada al proveedor.

**Recibir albarán** abre Facturas conservando el pedido seleccionado. Sube el documento, espera su lectura y pulsa Revisar. Comprueba el proveedor, número, fecha y cada artículo; en **Línea de pedido que recibe** elige la línea correspondiente e indica la cantidad realmente recibida. Referencia y unidad deben coincidir. Puedes recibir 8 de 20: quedarán 12 pendientes.

Cada albarán confirmado crea sus lotes; una segunda entrega mantiene otro origen y código aunque complete el mismo pedido. Una entrada de 20 unidades iguales de una sola recepción comparte un identificador para las 20. El enlace del pedido permite volver a sus lotes y documentos.

**Cancelar lo pendiente** exige un motivo y conserva el material ya recibido. No devuelve existencias al proveedor. Una devolución física tampoco reabre automáticamente el pedido. No se permite recibir más de lo pendiente ni recibir contra una línea cancelada. Los técnicos no administran pedidos.

## Perfiles de etiquetas

En la vista previa ajusta medidas, rollo/A4 y QR/Code 128. Escribe un nombre y pulsa **Guardar perfil**. Puedes aplicar, actualizar por nombre y eliminar hasta doce perfiles en ese navegador; también se conserva qué datos se muestran. Recargar y seleccionar el perfil recupera sus ajustes.

Los perfiles no detectan la impresora ni demuestran una impresión física. Comprueba papel, escala al 100 %, márgenes y lectura con tu hardware antes de imprimir una tanda. Preparar o guardar un perfil no cambia existencias.

## Trimestres y originales

La pantalla muestra un resumen aproximado de los documentos confirmados y ventas del trimestre seleccionado. Revisa los avisos de documentos pendientes, albaranes sin factura y ventas sin archivo. Los resultados requieren revisión de la asesoría y no son una liquidación oficial.

**Resumen CSV** descarga una tabla de conceptos e importes. **Descargar paquete (ZIP)** incluye ese resumen, listados separados de recibidas, emitidas y gastos, un LEEME y los originales disponibles. Los nombres incorporan identificadores para evitar colisiones; el CSV señala el nombre exacto del original incluido.

Antes de descargar el paquete se comprueba que los originales referenciados existen, son legibles y no están vacíos. Si falta un archivo, aparece un error y no se inicia una descarga que parezca completa. Revisa el almacenamiento o restaura una copia. Las ventas sin documento adjunto se avisan y permanecen en los importes, sin inventar un archivo.

Se registra quién preparó el paquete y de qué trimestre. Preparar la respuesta no acredita que la descarga haya acabado ni que se haya presentado una declaración.

## Estado de la instalación

En **Configuración → Estado del sistema** se consultan conexión a la base, señal del procesador OCR, cola, errores y copia de seguridad. «Sin señal reciente» requiere comprobar el worker; no es una prueba definitiva de que esté detenido. Una copia comprobada por sumas tampoco sustituye su ensayo de restauración ni una copia externa.
