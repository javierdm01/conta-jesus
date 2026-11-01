# Albaranes, material y etiquetas

## Recibir un pedido

1. Desde **Inicio** o **Documentos**, pulsa **Subir albarán**. Elige **Hacer foto** o **Elegir archivo** y después **Subir y leer datos**.
2. Abre **Pendientes de revisar**. Cuando esté listo, pulsa **Revisar**. El destino habitual es **Recibir material en almacén**.
3. Comprueba proveedor, número, fecha, artículos, referencias, cantidades y unidades.
4. Si no trae importes definitivos, marca **Coste pendiente de factura**. Puedes conservar los precios unitarios que aparezcan como datos provisionales, aunque otras líneas no tengan precio. No se utiliza esa tarifa para inventar una base ni un coste cero.
5. Abre **Ubicación y otras opciones** si quieres indicar ubicación, marca, modelo o reservar material para un trabajo. El original y su lectura se pueden desplegar encima de los campos.
6. Pulsa **Recibir material**. El material aparece en **Almacén**.

Se agrupan las líneas que coinciden en referencia, descripción, unidad, precio, descuento y datos de ubicación/marca/modelo. Una compra de 20 artículos iguales genera un lote con un código único para sus 20 unidades. Una compra posterior genera otro lote: así se conserva qué día llegó, de qué albarán procede y a qué coste se compró. No se mezclan automáticamente modelos parecidos ni metros con rollos.

## Preparar las pegatinas de tu rollo

Selecciona uno o varios lotes y pulsa **Preparar etiquetas**. Escribe cuántas quieres de cada uno. Por ejemplo, de un lote con 20 unidades puedes imprimir una etiqueta para la caja, cinco para paquetes o veinte para piezas individuales. Todas apuntan a la misma ficha. Imprimir o reimprimir no aumenta ni descuenta el material.

La vista previa utiliza **impresora de etiquetas en rollo** como opción inicial. Ajusta el ancho y alto en milímetros a tu rollo. Las medidas iniciales 62 × 40 mm son configurables, no una detección de la impresora. Puedes elegir **QR**, **Code 128** o ambos; mostrar ubicación y proveedor; y guardar el tamaño en ese navegador. El navegador abre el diálogo de impresión del sistema. Elige tu impresora, papel, escala 100 % y sin cabeceras/pies. Comprueba primero una etiqueta. La primera versión no se comunica directamente mediante ZPL/TSPL ni detecta el papel de la impresora.

También puedes cambiar las **copias por artículo** directamente en la vista previa. Al recibir un albarán se abre el almacén filtrado por ese documento; **Ver material** permite volver a ese mismo grupo desde Facturas. Desde un trabajo, **Usar material de almacén** lleva a los artículos y preselecciona ese trabajo al registrar una salida.

El QR contiene un enlace a la ficha y el código de barras contiene el identificador. Un lector USB se utiliza como teclado en el buscador. El botón **Escanear** permite leer desde la cámara si el navegador dispone de un contexto seguro y permiso; también puedes introducir el identificador a mano. Para abrir enlaces QR desde móviles, la dirección del servidor debe estar configurada y ser accesible desde dichos móviles; consulta el apartado de red/HTTPS del manual de instalación. La dirección `localhost` solo corresponde al propio dispositivo.

## Saber qué queda

Cada lote muestra cantidad recibida, cantidad en almacén, unidades reservadas y unidades libres. Su ficha incluye ubicación, documento original, marca/modelo, notas e historial. Puedes buscar por código, referencia, descripción, proveedor y ubicación; combinar estado, ubicación y proveedor y ordenar por nombre o antigüedad. El mínimo configurable avisa cuando el **material libre** llega a esa cantidad, descontando las reservas. El mínimo cero desactiva el aviso. **Con existencias** incluye material reservado; **Con material libre** muestra lotes que aún pueden reservarse.

**Exportar visibles CSV** descarga los lotes que cumplen los filtros actuales, independientemente de las casillas de selección para etiquetas. Incluye unidad, cantidades, reservas y ubicación; el responsable también recibe proveedor, documento y valoraciones. Los precios pendientes quedan vacíos, nunca como cero inventado. El archivo utiliza UTF-8, separador de punto y coma y coma decimal. Las celdas susceptibles de interpretarse como fórmulas se exportan como texto.

**Actualizar existencias** permite consultar el saldo actual. También se actualiza al recuperar el foco y periódicamente mientras la pantalla está visible. Si la conexión falla se muestra el error y se conservan los últimos datos recibidos; esos datos pueden estar desactualizados. Las operaciones siempre comprueban las cantidades disponibles en el servidor.

## Recuento físico y faltantes

El responsable puede abrir **Recuento físico** en la ficha, indicar la cantidad realmente contada y explicar el motivo. Se registra fecha, usuario, saldo anterior y saldo contado incluso si no hay diferencias. Los faltantes aparecen como salidas de recuento; recuperar material antes dado por faltante genera movimientos vinculados que revierten su valoración exacta. El código y las cantidades originales del albarán no cambian.

No se permite contar por debajo del material reservado: revisa los trabajos afectados y libera las reservas correspondientes antes de confirmar. Si alguien modifica el material mientras tienes abierto el formulario, el recuento se bloquea; cancela, pulsa **Actualizar existencias** y vuelve a contar. Reintentar la misma solicitud no duplica movimientos.

Solo se pueden recuperar faltantes anteriores del mismo lote. Para material adicional de una compra u otro lote hay que localizar su albarán o identificador; no se mezcla con este código. Los faltantes reducen el valor del almacén y quedan documentados, sin imputarse automáticamente a una obra ni registrarse como gasto fiscal. Si llega después la factura, también se revaloran los ajustes. El técnico no puede realizar recuentos administrativos ni consultar sus valoraciones.

**Reservar** aparta material para un trabajo sin gastarlo ni generar costes. **Registrar uso** descuenta la cantidad y asigna su coste al trabajo; si ese trabajo ya tenía una reserva, la consume primero. No se permite gastar el material reservado para otros trabajos ni generar existencias negativas.

**Devolver sobrante** debe vincularse a una salida anterior: recupera la cantidad en almacén y abona al trabajo la parte de coste correspondiente. No permite devolver más de lo que salió. **Devolver al proveedor**, disponible para el responsable, saca material libre del almacén y deja su historial. El abono fiscal correspondiente se controla aparte; esta acción no inventa un documento del proveedor.

## Cuando llega la factura

Desde **Inicio** o **Documentos**, pulsa **Subir factura de proveedor**. Sube la foto o PDF y abre **Revisar** cuando termine la lectura. Elige **Asociar factura a albaranes recibidos**. Selecciona uno o varios albaranes del mismo proveedor y revisa los precios de la factura. Selecciona todos antes de editar los precios: cambiar la selección reconstruye las líneas propuestas. Cada artículo muestra su albarán de origen. Termina con **Guardar factura**.

Si la factura agrupa un mismo artículo de varios albaranes en una sola línea, el precio se propone para sus lotes únicamente cuando referencia, unidad y suma de cantidades coinciden y hay una sola línea de factura candidata. Si hay precios distintos o cantidades que no cuadran, hay que revisar la asignación; no se repite la cantidad completa de factura en cada albarán.

La vinculación actual cubre íntegramente los albaranes seleccionados, con sus cantidades y unidades recibidas. La facturación parcial de un mismo albarán y las facturas mixtas que añaden material todavía no recibido requieren un flujo adicional. No se puede volver a facturar un lote ya vinculado, ni mezclar proveedores.

La factura conserva códigos y cantidades. Actualiza la valoración de las unidades que quedan y el coste de las ya utilizadas. Si un albarán estaba sin precios, desaparece el aviso de coste pendiente cuando se valora. El precio definitivo no crea otro lote, otra entrada ni un segundo coste. El reparto de céntimos conserva el total hasta la última unidad.

En documentos, el albarán queda **Facturado** con acceso a **Ver factura**; la factura muestra los números de los albaranes asociados. El documento original y sus tarifas provisionales se conservan.

## Documentos anteriores

Los albaranes ya confirmados mediante la imputación directa a trabajos conservan su comportamiento. No se convierten automáticamente a existencias, porque hacerlo podría duplicar material o cambiar costes de trabajos terminados. El flujo nuevo se elige al revisar una nueva recepción. La alternativa **Imputar directamente a trabajos** continúa disponible para compras consumidas directamente sin pasar por almacén.

## Navegación

El panel se conserva en el layout de Next.js al cambiar de sección. Los enlaces precargan rutas; SWR comparte los datos en memoria, actualiza tras guardar y al recuperar el foco. La lectura completa del OCR solo se solicita al revisar un documento. La cola tiene una consulta ligera y las gráficas, el almacén y el lector de cámara se cargan cuando se necesitan. No se guardan facturas ni datos financieros en el almacenamiento local del navegador.
