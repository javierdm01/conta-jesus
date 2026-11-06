# Artículos, alias y precio recomendado · 06/11/2026

## Alias

En **Almacén**, abre un artículo, pulsa **Editar** y escribe su **Alias del producto**. El alias se utiliza como nombre visible y como concepto inicial al añadir ese artículo a una factura de cliente. La descripción original del proveedor sigue disponible y también permite buscarlo.

Los lotes con el mismo proveedor, referencia y unidad comparten el alias. Las recepciones nuevas de esa misma referencia lo heredan. Si no hay referencia o proveedor identificable, se guarda únicamente en el lote editado; no se deduce que dos descripciones parecidas sean el mismo producto. Borrar el alias recupera la descripción original como nombre visible.

## Precio recomendado

Regla confirmada por el usuario: **coste unitario × 1,30**, antes de impuestos. Un coste de 10 € propone 13 €. No es una división entre 0,70 ni un margen sobre la venta.

El coste unitario se obtiene del valor de compra del lote dividido entre las unidades recibidas, conservando los ajustes de valoración existentes. La recomendación se redondea a céntimos. Cuando no se conoce el coste, queda pendiente; una tarifa provisional no se convierte automáticamente en coste definitivo. Al llegar la factura y actualizar la valoración, se recalcula la recomendación.

## Buscar y filtrar

El buscador general encuentra artículos por alias, descripción original, referencia, identificador, marca, modelo, familia, ubicación y notas. El responsable también puede buscar por proveedor o albarán. Admite mayúsculas, palabras en distinto orden, ausencia de tildes y referencias con o sin separadores. Los resultados llevan a la ficha del lote e incluyen artículos agotados.

En el almacén se combinan la búsqueda y el estado de existencias. **Más filtros** reúne ubicación, proveedor y orden. **Limpiar filtros** reinicia la búsqueda y los filtros visibles. Al empezar una búsqueda textual se muestran todos los estados; después puede elegirse un estado concreto. El contexto de un albarán conserva su filtro hasta pulsar **Ver todo el almacén**.

Los resultados generales permiten elegir entre toda la empresa, artículos y el resto de registros. La búsqueda de artículos muestra hasta 30 resultados y avisa cuando hay más; añade palabras para afinar. La búsqueda documental mantiene hasta 15 resultados. Las consultas se limitan siempre a la empresa de la sesión y los técnicos no reciben importes recomendados ni costes.

## Facturas de cliente

Desde la ficha, **Añadir a factura** carga el alias, una unidad y su precio recomendado. También se pueden buscar y añadir artículos al registrar una factura de cliente. Revisa el concepto, cantidad, precio, trabajo, impuestos y demás datos antes de guardar.

La base se calcula con las líneas y se valida de nuevo en el servidor. El precio es editable. El concepto, la unidad, la cantidad y el precio quedan guardados en cada línea: cambiar posteriormente el alias no reescribe una factura guardada. Registrar la factura no descuenta stock; el consumo continúa registrándose en el trabajo para conservar la trazabilidad.

Se han preparado controles y composiciones para teléfono, tablet y PC. La edición de alias corresponde al responsable.
