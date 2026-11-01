# Tu primer trabajo, paso a paso

## Preparar tu empresa

Entra con tu correo y contraseña. En **Configuración**, pon el nombre de la empresa y añade tus clientes. Añade los trabajadores e introduce su coste laboral real por hora. Puedes editar clientes, proveedores, trabajadores y datos del trabajo desde sus pantallas. Los cambios de coste horario solo se aplican a los nuevos partes.

Ese coste debe incluir los costes empresariales: no es la tarifa que cobras al cliente. En **Proveedores**, guarda los almacenes donde compras.

## Crear un trabajo

Pulsa **Añadir → Crear trabajo**. Escribe un nombre sencillo, por ejemplo la descripción de la instalación, elige cliente, dirección, servicio, técnico y fecha. Se genera un número de expediente. Abre el trabajo para ver sus documentos, materiales, horas y resultado. El estado se cambia desde **Cambiar estado**.

## Fotografiar una compra

1. Pulsa **Añadir → Fotografiar factura de compra**, o sube un albarán desde el trabajo.
2. Elige cámara o galería/PDF. Usa una imagen nítida con todos los bordes visibles. JPG, PNG, WebP o PDF, hasta 20 MB. Convierte las fotos HEIC a JPG antes de subirlas.
3. Puedes seguir trabajando. En **Facturas**, verás En cola, Leyendo documento o Pendiente de revisión. La bandeja se actualiza sola.
4. Pulsa **Revisar**. Abre el original y usa el texto leído como ayuda. Introduce proveedor, número, fecha, base e impuestos.
5. Añade las líneas: descripción, referencia si está visible, cantidad, unidad, precio unitario y descuento. Si son 100 metros de cable, introduce 100 y unidad **m**, no rollo.
6. Elige el trabajo de cada fila. Para repartir una referencia entre dos trabajos, utiliza dos filas y reparte su cantidad. La suma neta debe coincidir con la base del documento.
7. Marca que has comprobado el original y confirma. Solo entonces aparecerán los costes en los trabajos.

Si el OCR falla, puedes reintentarlo o revisar el original e introducir los datos manualmente. No adivines las partes ilegibles. Un albarán sin precios puede esperar a la factura; no pongas cero si desconoces el coste.

## Albarán y factura del mismo material

Si ya confirmaste un albarán y después llega su factura, selecciona **Albarán al que sustituye** al revisar la factura. Comprueba que sea el mismo proveedor y que incluya el albarán completo. Los costes provisionales del albarán se anularán y se usarán los de la factura, una sola vez.

Esta versión admite sustituir un albarán completo por una factura. No confirmes por separado una factura y su albarán sin vincularlos: sus números distintos no permiten detectar por sí solos que son el mismo material. La conciliación de varios albaranes y las devoluciones se ampliarán en la fase 2.

**Añadir material** sirve para un coste manual sin documento. Si ya se incluyó al confirmar una compra, no vuelvas a añadirlo manualmente. Para el material recibido mediante el nuevo flujo de almacén, utiliza **Registrar uso**: se descuenta la cantidad y se asigna el coste una sola vez. Las compras antiguas imputadas directamente a trabajos no se transforman automáticamente en stock. Consulta [Almacén y etiquetas](ALMACEN_Y_ETIQUETAS.md).

## Registrar horas

Entra en el trabajo y pulsa **Registrar horas**. Elige trabajador, día, horas y actividad. Indica si son facturables. Una hora y media son 1,5 horas. Las horas no facturables también tienen coste para el trabajo. Cada parte conserva el coste por hora con el que se registró, aunque cambie más adelante la tarifa.

## Preparar un presupuesto

Pulsa **Crear presupuesto**. Introduce tus costes estimados, horas, coste horario, desplazamiento, otros costes y margen deseado sobre venta. Verás el precio neto calculado. Los impuestos se añaden después. Un margen del 30 % significa que el beneficio representa el 30 % del precio de venta. No es sumar un 30 % al coste. Guarda el presupuesto y pulsa **Aprobar** si el cliente lo acepta. La aprobación permite comparar las horas previstas con las reales. Solo un presupuesto queda aprobado por trabajo.

## Registrar la venta y los cobros

Puedes subir una factura de cliente para leer el texto y revisar sus datos, o pulsar **Registrar factura de cliente** e introducirlos directamente. Selecciona trabajo, número, fecha, base, impuestos, retención si existe y lo que has cobrado. Puedes registrar varias facturas parciales por trabajo. Esta primera versión registra importes positivos; los abonos y la emisión fiscal quedan pendientes.

Pulsa **Registrar cobro** cuando recibas un pago. Introduce el total acumulado cobrado, no solo el último ingreso. Una factura de 100 € más 21 € de impuestos suma 121 €; su ingreso para el beneficio es 100 €, aunque hayas cobrado los 121 €.

## Entender el resultado

- **Facturado neto:** bases de las facturas de cliente, sin impuestos.
- **Cobrado:** dinero registrado como recibido, con impuestos y descontando retenciones.
- **Costes directos:** materiales confirmados, mano de obra y otros costes del trabajo.
- **Beneficio bruto:** facturado neto menos costes directos.
- **Operativo estimado:** beneficio bruto menos gastos generales asignados a ese trabajo.
- **Margen:** beneficio bruto dividido entre facturado neto. Sin ventas se muestra «—».

En **Beneficios** compara servicios y descarga el CSV. Los indicadores abarcan todos los registros. El resultado global de empresa resta los gastos generales registrados una sola vez; el reparto manual por trabajo sirve para analizarlos y no se vuelve a descontar del global. Registra primero el gasto general y después, si quieres, su parte asignada a cada trabajo. No registres dos veces el mismo gasto como coste directo y gasto general. La compra de una herramienta duradera requiere valorar su tratamiento con tu gestor; no la asignes automáticamente entera a un servicio.

Un trabajo todavía sin facturar puede mostrar un resultado negativo provisional. Comprueba que estén registradas todas las compras y ventas antes de decidir si fue rentable. La aplicación no sustituye la revisión fiscal ni presenta documentación como certificado legal.

## Uso desde el móvil

La barra inferior muestra las secciones y **+ Añadir** abre las acciones principales. El técnico ve solo sus trabajos asignados, direcciones y registros propios. Los datos financieros globales no se envían a su sesión. La aplicación necesita conexión con el servidor local para consultar y guardar: espera al mensaje **Guardado correctamente**. Si se pierde la conexión, los datos no se guardan automáticamente después.

## Cierre trimestral (menú «Trimestres», solo responsable)

1. Elige año y trimestre (por defecto, el último terminado).
2. Revisa IVA repercutido, IVA soportado, IVA a ingresar o compensar y el resultado aproximado. Los avisos señalan albaranes sin factura, documentos sin confirmar y ventas sin archivo.
3. **Descargar paquete (ZIP):** incluye `resumen.csv`, `facturas_recibidas.csv`, `facturas_emitidas.csv`, `gastos_generales.csv`, un `LEEME.txt` y los archivos originales en `recibidas/` y `emitidas/`, nombrados `fecha_empresa_numero`. Los CSV usan `;` y coma decimal para abrirse directamente en Excel.

Criterio: las compras cuentan por la fecha de la **factura** confirmada (no por albaranes ni por el consumo en obra); las ventas, por su fecha; los gastos generales admiten IVA soportado. Son cifras aproximadas para preparar la declaración, no una liquidación oficial. Para que la venta incluya su archivo, regístrala desde la factura de cliente subida.

## Lectura de facturas (OCR)

El proveedor se elige primero por NIF exacto y, si no aparece, por el nombre más parecido (tolera letras mal leídas); en ese caso se avisa con el porcentaje de parecido. Se reconocen fechas con año corto o en letra, número de factura con distintas etiquetas, base/IVA/total (el IVA o la base que falten se calculan solo si cuadran y se avisa) y tablas Base/%/Cuota. Si una página no deja líneas legibles se reintenta con otro modo de lectura. Todo sigue pasando por revisión humana antes de confirmarse.
