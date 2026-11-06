# Plan de continuidad del ERP · revisión del 25 de octubre de 2026

## Artículos y búsqueda · 06/11/2026

Prioridad del usuario: alias, búsqueda general y filtros sencillos, diseño en teléfono/tablet/PC y recomendación de venta con un recargo del 30 % sobre coste. Se incorpora alias persistente, herencia entre recepciones del mismo proveedor/referencia/unidad, búsqueda normalizada por todos los datos del artículo, recomendación dinámica coste × 1,30 y líneas de factura con concepto y precio guardados. Manual en [ARTICULOS_Y_BUSQUEDA.md](ARTICULOS_Y_BUSQUEDA.md). Se mantiene pendiente un catálogo maestro que permita vincular de forma revisable referencias de proveedores diferentes; no se unen por similitud de nombre.

## Interacción simplificada · 29/10/2026

Inicio y Documentos ofrecen una sola entrada por tarea: **Subir albarán** y **Subir factura de proveedor**. El tipo viene elegido; foto/archivo son las decisiones principales. La asignación previa a trabajo y el cambio de tipo quedan desplegables. Tras subir se muestran los pendientes. Las tareas secundarias siguen en **Más acciones**; los accesos repetidos del inicio y de Documentos se han eliminado.

La revisión muestra primero proveedor, fecha/número y artículos. Original/lectura, reserva, ubicación/marca y relectura están disponibles mediante desplegables. Los botones finales dicen **Recibir material**, **Guardar factura** o **Guardar costes**. Se conserva la asociación de varios albaranes, la tarifa provisional y los costes definitivos de factura.

Pendiente de nuevas iteraciones de facilidad de uso: reducir las decisiones de las primeras pantallas de pedidos y trabajos con pruebas reales de uso; recordar únicamente preferencias de presentación; sugerir el siguiente albarán por revisar; separar ofertas de proveedores de facturas y entregas; agrupación explícita de fotos de un documento. No ocultar campos obligatorios ni confirmar automáticamente material o costes.

## Aclaración operativa · albarán provisional y factura definitiva, 27/10/2026

El albarán registra lo recibido aunque falten importes o solo indique una tarifa unitaria. Se conserva esa tarifa como dato provisional; la factura establece el coste definitivo. Se amplía la vinculación de almacén a varios albaranes completos de un proveedor por factura, conservando lotes, identificadores y cantidades y revalorando consumos anteriores. La interfaz distingue coste pendiente, albarán facturado y factura asociada. No se da de alta el mismo material otra vez.

Pendiente para una siguiente ampliación: facturar parcialmente las líneas de un albarán; dividir un albarán entre varias facturas; combinar en una factura material recibido y material nuevo; propuesta de asociación a partir de números de albarán impresos en factura, con revisión; consulta paginada de todos los albaranes pendientes más allá de los 200 documentos recientes; tratamiento de abonos y devoluciones fiscales. La asignación automática de precios agregados se limita a referencia/unidad/cantidad coincidentes y una sola línea candidata.

## Actualización posterior · OCR con documentos reales del 27/10/2026

Contraste de tres fotografías nuevas en [PRUEBA_OCR_2026-10-27.md](PRUEBA_OCR_2026-10-27.md). Se han mejorado perspectiva, tratamiento de papel/pantalla, lectura de columnas, descuentos consecutivos, resúmenes fiscales y albaranes con tarifa sin importes. 55 unitarias correctas. Conservar debajo el diagnóstico inicial como historial.

Siguientes tareas derivadas de estos casos:

1. Separar la marca de INRA automáticamente, conservando la descripción original y sin asumir que su primera palabra siempre es una marca.
2. Implementado en la aclaración operativa posterior: tarifa observada visible como precio provisional, coste pendiente y factura definitiva asociada a varios albaranes completos.
3. Tipo documental explícito para ofertas/presupuestos recibidos: el aviso actual identifica el caso INRA, pero no crea todavía un flujo propio de oferta de proveedor.
4. Agrupar fotos/páginas con vista previa y detectar coincidencias de número, proveedor y fecha antes de confirmar; no confundir agrupación, hash de archivo y recepción ya registrada.
5. Guardar versión del extractor y exactitud por campo sobre el banco de fotos, incluyendo cada referencia y descripción, no solo el total.
6. Añadir recorte de evidencia y corrección visible para cada valor dudoso; medir tiempos con fondos complejos, hojas dobladas, tablas muy largas y varios tipos de IVA.
7. Corregir la referencia auxiliar de fabricante en la foto de pantalla 9454: los datos económicos y códigos de proveedor ya concilian, pero el segundo modelo se lee 6011BT en lugar de 8911 BT. Usar evidencia visual y lecturas independientes; no reemplazarlo por una referencia esperada en el código. La copia nueva en papel sí recupera el modelo correcto.

Este documento distingue lo disponible, la entrega en curso y las ideas posteriores. Una idea de la hoja de ruta no se considera implementada hasta que tenga pruebas y evidencia en `VERIFICACION.md`. Las fases se ordenan por utilidad y dependencias, sin fechas ficticias. El objetivo sigue siendo que un instalador pueda gestionar el trabajo diario con pocos pasos y que los resultados económicos tengan un origen comprobable.

## Prioridad nueva · foto real Sonepar del 27 de octubre

El ensayo de dos fotografías de la misma página de albarán NO supera el OCR actual. Evidencia separada y referencia humana en `data/ocr-sonepar/COMPARACION.md`. Antes de dar por fiable la extracción Sonepar, resolver interferencia de fotos de pantalla, precios con seis decimales, cabeceras BASE IMPON./IMP.%IVA, número sin etiqueta en la misma fila y líneas auxiliares de referencia/marca. Mantener cuatro artículos y total 53,26 sin duplicar las dos capturas. No afirmar que la función de agrupar fotos está implementada. Evaluar estas mejoras contra las facturas previas y comprobar interfaz/base con un documento de prueba aislado antes de confirmar material real.

## Cierre OCR y proveedores del 25 de octubre

Entregado y probado con una factura real: preparación de fotos y reconstrucción de tablas por coordenadas, fecha/número bajo cabeceras, IVA/base/total impresos conciliados, descripciones en varias líneas y segunda lectura de referencias ambiguas. El proceso desplegado se ha comprobado desde el original hasta los campos del navegador. Se admiten tasas y abonos como conceptos económicos sin existencias; reparto proporcional de valor en almacén. Alta de proveedor desde revisión y pedidos, y menú Crear global para proveedores/clientes. Evidencia y límites en `VERIFICACION.md`; 40 unitarias, HTTP/base de datos y navegador.

Siguientes mejoras concretas:

1. Ampliar el banco anonimizado con más proveedores y diseños, medir por separado exactitud de fecha, número, cada importe y cada línea. Incluir fotos inclinadas, varias páginas y resoluciones bajas.
2. Mostrar confianza por campo y resaltar solo valores dudosos; conservar el recorte que originó cada artículo y las correcciones de referencia para revisión visual.
3. Aprender plantillas del proveedor a partir de correcciones confirmadas, con versiones y pruebas, sin sustituir silenciosamente precios por los del catálogo.
4. Permitir asignar un ajuste económico a artículos concretos. Actualmente el reparto de almacén es proporcional y queda explicado; un texto de regalo no acredita por sí solo la correspondencia entre lotes.
5. Extender conciliación fiscal a varias bases, recargo, retención, suplidos y rectificativas completas con importes negativos. No dar esos casos por cerrados por la prueba de una factura al 21 %.
6. Alta contextual de clientes/trabajos desde los formularios que los necesitan, con búsqueda por NIF y detección de duplicados también en servidor.
7. Conservar propuestas y correcciones de OCR en un historial, con versión del extractor, diferencia y usuario. La relectura actual solo se permite antes de confirmar.
8. Reservar la IP en el router o usar un nombre interno estable para evitar modificar enlaces y QR cuando cambia la Wi-Fi.

## Revisión de continuidad tras los cambios del proyecto

Se ha consultado `graphify-out/GRAPH_REPORT.md`, el grafo y las conexiones de pedidos/trimestres, contrastándolas con los archivos actuales. El grafo contiene 534 nodos y 1066 conexiones, no detecta ciclos de importación y localiza los módulos nuevos. Su raíz de extracción apunta a una copia temporal: sirve para navegar por dependencias, pero no acredita pruebas, migraciones ni estado de instalación. CSS y Prisma tienen cobertura incompleta en ese informe. No se rehace código solo por la conectividad de un nodo ni se modifican migraciones ya aplicadas.

| Frente | Estado al retomar | Trabajo de cierre de esta revisión |
|---|---|---|
| OCR y proveedor aproximado | Mejoras del usuario incorporadas; pruebas unitarias correctas | Conservar reconocimiento por nombre, fechas e IVA; mantener revisión humana y probar regresiones |
| Pedidos y entregas parciales | Modelo, API, vinculación de albaranes y pantalla existentes | Comprobar recepción 8/20, dos recepciones concurrentes del resto, cancelación y permisos |
| Perfiles de etiquetas | Almacenamiento local validado y controles existentes | Comprobar guardar, recargar, aplicar y eliminar sin alterar stock |
| Estado OCR y copias | Panel y señal periódica existentes | Corregir arranque de copia antes de PostgreSQL, reintentar fallos y señalarlos en pantalla |
| Trimestres | Aportación del usuario con JSON, CSV, ZIP y pruebas HTTP | Revisar escritorio/móvil, archivos ausentes y nombres coincidentes entre ZIP y CSV |
| Verificación general | 33 unitarias y TypeScript correctos al inicio | Compilar, instalar, probar navegador/API/base y retirar todos los datos de prueba |

Se conserva una copia del código anterior a esta revisión en `data/checkpoints`. Los documentos y la base se protegen con copias del servicio de backup; el archivo de código no las sustituye.

### Nuevas mejoras recomendadas a partir de la revisión

1. **Cierre trimestral reproducible:** guardar una versión del resumen con fecha, usuario, documentos incluidos y huellas de originales; comparar cambios posteriores y diferenciar «preparado» de «presentado por la asesoría».
2. **Completitud documental:** detectar ventas sin original, archivos ausentes, compras pendientes y posibles duplicados entre gastos generales y facturas. Separar avisos informativos de errores que impiden preparar un paquete completo.
3. **Manifiesto del paquete:** nombres únicos y coincidentes con CSV, número de documentos, importes y, en una siguiente entrega, SHA-256 de originales para cotejo. No afirmar descarga completada cuando solo se preparó la respuesta.
4. **Trazabilidad de propuestas OCR:** mostrar origen exacto de cada campo, página y texto de referencia; distinguir NIF exacto, coincidencia aproximada y dato calculado. Medir correcciones por formato antes de ajustar umbrales.
5. **Recuperación operativa:** ensayo automatizado de restauración en una base/volumen aislados, aviso de copia antigua y procedimiento que funcione también desde PowerShell. Un fallo de backup no debe quedar sin reintento durante un día.
6. **Pedidos más útiles:** vencimientos de entrega, recordatorio de material pendiente y aviso de precio distinto al orientativo, sin impedir recibir cambios revisados. Las devoluciones a proveedor no reabren por sí solas un pedido ya recibido.
7. **Pruebas repetibles:** incluir pedidos, perfiles, estado y Trimestres en una batería de navegador; usar empresas separadas, restaurar archivos de prueba temporalmente apartados y comprobar permisos de cada descarga.
8. **Mantenimiento guiado por Graphify:** dividir progresivamente `dashboard.tsx` por secciones, delimitar cálculo y autorización de exportaciones y actualizar el grafo a partir de una copia que excluya secretos, copias y documentos. No introducir una refactorización amplia antes de asegurar las pruebas de los flujos.

Lo anterior amplía las fases ya descritas. La conciliación de varias entregas en una factura, ubicaciones con saldos separados, catálogo maestro y partes de campo siguen siendo desarrollos posteriores; no se confunden con las recepciones parciales de pedidos ya presentes.

### Cierre de la revisión

Los frentes de la tabla se han comprobado por API/PostgreSQL y navegador: pedidos 8/20 con concurrencia, perfiles persistentes, señal OCR/copias, PDF mixto y Trimestres en escritorio/móvil. Se corrigen nombres y archivos ausentes del ZIP, formato del resumen CSV, búsqueda de clases que incluía Graphify y reintentos de backup. La compilación y 33 unitarias pasan. La evidencia y el cierre de instalación se registran en `VERIFICACION.md`; la guía operativa nueva está en `PEDIDOS_Y_TRIMESTRES.md`.

Siguiente prioridad independiente del hardware: conciliación de una factura con varias entregas mediante asignaciones por línea; después ubicaciones y catálogo maestro. Antes de ampliarlos se mantendrán las regresiones actuales. Con nueve secciones conviene también revisar la navegación móvil y agrupar accesos secundarios para conservar tamaños cómodos al tocar.

## 1. Situación y prioridades

| Área | Disponible al comenzar esta continuación | Necesidad siguiente |
|---|---|---|
| Navegación | Layout persistente, precarga y datos compartidos; medición local 398 → 63 ms | Mantener la rapidez al crecer datos y tratar errores de conexión |
| Documentos | Subida privada, cola OCR, revisión humana, recepción y factura posterior | Adaptar formatos reales y cubrir documentos parciales |
| Almacén | Lotes, reservas, consumos, devoluciones, ficha e historial | Recuentos físicos, filtros útiles y exportación |
| Etiquetas | QR/Code 128, copias por lote, medidas de rollo ajustables | Calibrar impresora y facilitar perfiles habituales |
| Trabajos | Clientes, responsables, costes, horas y expediente | Planificación, partes de trabajo y control de materiales pendientes |
| Economía | Presupuestos, ventas, cobros y márgenes con decimales exactos | Cobros trazables por movimiento, previsión de tesorería y revisiones |
| Operación | Docker, base persistente, OCR local y copias con restauración probada | Estado visible, mantenimiento y ensayo periódico de recuperación |

**Orden de trabajo:** integridad de datos → recorrido completo → claridad de uso → rendimiento → automatización. Nunca automatizar una extracción documental que aún no se pueda corregir ni confirmar manualmente.

## 2. Entrega implementada y comprobada: control operativo del almacén

### A. Recuentos físicos con trazabilidad

Desde una ficha, el responsable registra la cantidad contada y un motivo. Guardar un recuento igual también debe dejar evidencia. Los faltantes generan salidas de ajuste y el material recuperado revierte faltantes anteriores del mismo lote, conservando sus céntimos. Se mantienen las cantidades originales del albarán y el código de las etiquetas.

Se compara tanto el saldo como el último movimiento con lo que vio el usuario al abrir el formulario. Si alguien consume, devuelve o reserva entretanto, se rechaza el recuento y se pide actualizar. No permitir un saldo por debajo de las reservas: primero se revisan y liberan las reservas afectadas. Un técnico no realiza ajustes ni accede a valoraciones o al registro administrativo de recuentos.

**Límite deliberado:** un sobrante que exceda los faltantes previos no se mezcla con el lote. Hay que localizar su documento o su código. La entrada inicial de material sin documento y la regularización económica general necesitan un proceso propio. Un faltante se muestra en el historial y reduce la valoración de stock; no se disfraza de consumo de un trabajo ni se considera automáticamente un gasto fiscal.

**Aceptación:** contar 17 → 15 resta dos unidades; recuperar 15 → 17 revierte el mismo valor; una factura posterior revalora también los ajustes; contar sin diferencia deja registro; intentos repetidos, recuentos obsoletos, cantidades fraccionadas de unidades y reservas incompatibles se bloquean sin cambios parciales.

### B. Encontrar y revisar material

Añadir filtros combinables por estado, ubicación y proveedor, orden por antigüedad o descripción, mínimos calculados sobre material libre y lotes sin ubicación. Mantener el trabajo elegido al pasar del listado a la ficha, escanear y registrar uso. Facilitar una actualización manual y mostrar fallos de actualización aunque haya datos anteriores en pantalla.

**Aceptación:** al reservar todo un lote deja de estar libre; un mínimo puede avisar aunque queden unidades reservadas; un filtro devuelve la misma selección en pantalla y en exportación; el contexto del trabajo llega al formulario de salida.

### C. Exportación útil

Exportar los lotes visibles a CSV con código, referencia, unidades, saldo, libre, reservas y ubicación; incluir proveedor y valores solo para el responsable. Exportar las cantidades como columnas separadas, sin sumar metros y unidades. UTF-8 y separador compatible con la configuración española; neutralizar celdas que una hoja de cálculo pueda interpretar como fórmulas. La exportación no modifica material.

### D. Verificación y puesta en marcha

1. Copia previa a migraciones; migración incremental, sin reinstalar la base.
2. Pruebas unitarias de cálculos y exportación; pruebas HTTP contra PostgreSQL con dos roles.
3. Prueba de navegador: abrir lote → contar → ver saldo e historial → filtrar → descargar CSV → seguir usando/etiquetando.
4. Revisar escritorio y móvil, accesibilidad de formularios, mensajes y consola.
5. Comprobar regresiones de compras, horas, ventas y cobros cuando cambie su frontera de datos.
6. Retirar empresa y archivos de prueba, reiniciar servicios con la imagen validada y generar copia final.

## 3. Hoja de ruta ampliada

### Fase siguiente: documentos y compras

| Mejora | Cómo desarrollarla | Criterio de aceptación |
|---|---|---|
| OCR del proveedor habitual | Ejemplos reales anonimizados, extracción de columnas/referencias y pruebas de regresión por formato | Medir aciertos por campo; ninguna cantidad incierta se confirma sola |
| Referencias aprendidas | Asociación revisable proveedor/referencia/artículo, conservando descripción original | Un cambio de referencia o unidad no une artículos incompatibles |
| Recepciones parciales | Pedido con líneas; cantidades pedidas, recibidas, canceladas y pendientes | Recibir 8 de 20 deja 12 pendientes y no duplica entradas al reintentar |
| Varias entregas por factura | Implementado para albaranes completos mediante líneas de factura vinculadas a sus lotes; pendiente la conciliación parcial | Una factura puede cubrir varios albaranes sin alterar dos veces su stock |
| Facturas parciales | Separar recibido, facturado y valor pendiente de cada lote | La parte pendiente sigue visible; no se inventa un coste definitivo |
| Portes y descuentos globales | Reparto configurable y exacto de céntimos entre líneas elegibles | La suma coincide con el documento y el criterio queda registrado |
| Devolución comercial y abonos | Vincular salida física, solicitud al proveedor y abono recibido | Distinguir material devuelto de dinero aún pendiente de recuperar |
| Bandeja de incidencias | Duplicados, importes que no cuadran, OCR fallido y proveedor desconocido | Cada incidencia tiene estado, responsable y siguiente acción |

La conciliación actual permite varios albaranes completos: las líneas de factura apuntan a los lotes recibidos y cada lote conserva su factura de valoración. Antes de admitir facturas parciales de un mismo lote harán falta asignaciones por cantidades e importes que permitan varias facturas sin perder la trazabilidad; conservar vínculos y costes anteriores exige más que añadir un selector.

### Fase de almacén y reposición

- **Catálogo maestro:** unir varios lotes al mismo artículo mediante referencia, marca, modelo y unidad compatibles. El artículo sirve para buscar y reponer; el lote conserva recepción, coste y trazabilidad.
- **Ubicaciones reales:** almacén, estantería, furgoneta y obra, con saldos por ubicación. Una transferencia tiene origen/destino, responsable y confirmación; no crea una compra ni gasto.
- **Material entregado a un técnico:** distinguir carga de furgoneta de consumo en obra. Devolver sobrante conserva el origen. Control de custodia sin atribuir gasto al cargar material.
- **Recuentos por zona:** sesiones con lotes previstos, lectura de etiquetas, conteos repetidos e incidencias. Previsualizar diferencias y confirmar solo líneas sin conflictos.
- **Material inicial:** asistente para existencias anteriores al ERP, origen de valoración y fecha de apertura; sin facturas ficticias. Validar el criterio económico antes de activarlo.
- **Series y garantías:** identificación individual opcional para máquinas/equipos; no imponer números de serie a tornillos, cable o consumibles. Mantener lote compartido cuando corresponda.
- **Bobinas y cortes:** conservar unidad base en metros y registrar cortes/mermas; convertir rollos solo si su longitud es conocida y explícita.
- **Reposición:** mínimos por artículo/ubicación, stock libre, reservas y pedidos abiertos. Propuesta de compra revisable, sin pedidos automáticos al proveedor.
- **Antigüedad y rotación:** material sin movimiento, valor inmovilizado y candidatos a devolución; explicar periodo y datos usados.
- **Caducidades y calibraciones:** aplicables solo a materiales o herramientas que realmente las requieran, con avisos y responsable.
- **Herramientas prestadas:** entrega/devolución, persona, estado y mantenimiento, separadas del material consumible.

### Fase de trabajo en campo

- Agenda de técnicos y trabajos con fecha, duración, prioridad y dirección. Avisar de solapes antes de mover citas.
- Parte sencillo: llegada, actividad, horas, material, fotos, observaciones y trabajo pendiente. Guardado explícito y confirmación clara.
- Material previsto frente a usado: reservas desde presupuesto, faltantes antes de salir y sobrantes al cerrar.
- Checklist por servicio: puesta en marcha, pruebas, documentación y fotos obligatorias configurables. No presentar listas como certificación normativa sin validación específica.
- Firma del cliente y justificante del parte, con historial de versiones y vínculo al trabajo. Diferenciar aceptación del servicio de emisión fiscal.
- Ficha de equipo instalado: cliente, ubicación, marca/modelo/serie, instalación, garantía y visitas anteriores.
- Contratos de mantenimiento: tareas, periodicidad, próximas visitas y renovación; crear propuestas de trabajos revisables.
- Registro de averías recurrentes y soluciones, buscable por modelo, conservando permisos y datos personales.
- Modo con conexión débil: primero lectura y borradores claramente señalados. Solo añadir envío diferido cuando existan cola local, idempotencia, conflictos y protección del dispositivo; no mostrar como guardado lo que solo está en el móvil.

### Fase económica y comercial

- Presupuestos por capítulos con material, mano de obra, subcontrata, portes y contingencia. Versiones, validez, aceptación y comparación previsto/real.
- Coste horario histórico y horas presupuestadas frente a reales; alertas al superar umbrales configurados.
- Cobros y pagos como movimientos independientes con fecha, medio, referencia y reversión, evitando sobrescribir un total sin historial.
- Vencimientos, impagados y previsión de tesorería; separar ingresos, cobros, compras y pagos.
- Rentabilidad por trabajo/cliente/servicio con filtros de fecha y explicación de costes provisionales. Diferenciar beneficio del trabajo de pérdidas generales del almacén.
- Revisión de obras abiertas antiguas, ventas pendientes de registrar y trabajos terminados sin facturar.
- Comparación de proveedores solo entre artículos equivalentes, con cantidad, unidad, descuentos, portes y fecha del precio visibles.
- Exportaciones para asesoría con documentos y movimientos enlazados; mapear formato antes de automatizar integración contable.
- Abonos, rectificaciones y emisión fiscal: proyecto específico sujeto a normativa y documentación oficial vigente, con validación profesional; no convertir el registro interno actual en un emisor fiscal improvisado.

### Fase de fiabilidad, seguridad y operación

- Panel de estado para responsable: cola y antigüedad OCR, documentos fallidos, última copia completada y versión instalada; nunca mostrar claves.
- Prueba periódica de restauración en base y volumen aislados, verificación de archivos y registro del resultado.
- Copia externa cifrada y política de retención; configurar destino y recuperación antes de habilitar borrados automáticos.
- Guía de actualización y reversión: copia previa, migración, comprobación de salud y procedimiento de recuperación. Una migración incompatible no se resuelve arrancando una imagen antigua sobre un esquema nuevo.
- Gestión de usuarios: alta/baja, cambio de rol, recuperación y revocación de sesiones; historial de acciones administrativas.
- Permisos por empresa, asignación y función en cada API y exportación. Casos de prueba de acceso cruzado y cambios de rol durante una sesión.
- Auditoría consultable por fecha/usuario/lote/trabajo, con origen de cada modificación. Correcciones por movimientos compensatorios.
- Protección frente a reintentos y carreras en todas las mutaciones; mensajes que distingan «guardado», «conflicto» y «no se pudo conectar».
- Paginación y búsqueda en servidor cuando el volumen lo requiera; consultar detalles e historial al abrirlos y limitar exportaciones grandes.
- Medir navegación, tamaño de respuestas y consultas con datos representativos; fijar umbrales a partir del equipo local real.
- Revisión accesible: teclado, foco, contraste, etiquetas de formularios, estados de carga y lector de pantalla en recorridos principales.
- Pruebas de actualización sobre una copia anonimizada de la base; conservar evidencia reproducible junto al código.

### Fase opcional de automatización

- Importar CSV de proveedores con vista previa, mapa de columnas, incidencias y detección de duplicados.
- Conexión de correo de compras con carpeta dedicada, permisos mínimos y revisión previa; no enviar correos ni pedidos automáticamente.
- Búsqueda por lenguaje natural que devuelva documentos y cifras comprobables, respetando el rol. Funcionalidad opcional y con coste visible si usa servicios externos.
- Resúmenes de trabajos y propuestas de descripción a partir de datos revisados; sin inventar horas, materiales o actuaciones.
- Avisos de anomalías explicables: precio muy distinto al histórico, consumo inusual o documento parecido. Mostrar muestra y criterio; no decidir con poca evidencia.
- Integraciones de proveedores mediante API oficial o importación autorizada. No simular conexiones activas ni precios en tiempo real.

## 3 bis. Ideas y mejoras recomendadas (propuestas, sin fecha)

Ordenadas por valor para el uso diario y por dependencias. Ninguna cuenta como implementada hasta tener pruebas y evidencia en `VERIFICACION.md`.

### Contabilidad y cierre de trimestre
- **Desglose por tipo de IVA** (4/10/21 %, exento, intracomunitario, inversión del sujeto pasivo) guardado por factura; es la base para cuadrar con los modelos oficiales.
- **Borrador de modelos 303, 111, 115, 130/131 y 390** con las casillas que se puedan calcular, marcado como ayuda y validado con la asesoría. No presentar nada a la Agencia Tributaria desde la aplicación.
- **Cierre de periodo**: bloquear un trimestre revisado para que no cambie sin rastro (reapertura con motivo y auditoría).
- **Comparación entre trimestres y año acumulado**: gráfico de ventas, compras, IVA y resultado; estimación de pagos fraccionados.
- **Gastos sin trabajo**: alta rápida de tickets (gasolina, herramientas, dietas) con foto, OCR y categoría, para que la contabilidad aproximada no dependa de asignar todo a una obra.
- **Categorías de gasto y activos**: separar gasto corriente de inversión (furgoneta, maquinaria) con amortización simple.
- **Pagos a proveedores**: registrar pagos y vencimientos de facturas recibidas para saber cuánto se debe, igual que ya se sabe lo pendiente de cobro.
- **Conciliación bancaria**: importar el extracto (CSV/Norma 43) y sugerir qué cobro o pago corresponde a cada movimiento, siempre con confirmación.
- **Facturas rectificativas y abonos** con numeración por serie, dentro del proyecto fiscal específico ya descrito.
- **Envío al asesor**: enlace temporal de descarga con caducidad o envío del ZIP a una dirección configurada, nunca automático sin confirmar.

### OCR y documentos
- **Corpus de pruebas real**: documentos anonimizados por proveedor con la salida esperada y un informe de aciertos por campo.
- **Perfiles por proveedor**: plantillas aprendidas (columnas, etiquetas propias) aplicadas antes de las reglas generales.
- **Aprendizaje de correcciones**: guardar cada corrección humana (descripción, unidad, referencia) y reutilizarla para el mismo proveedor; revisable y reversible.
- **Preprocesado de imagen**: enderezado de perspectiva, eliminación de sombras y recorte automático para fotos hechas con el móvil.
- **Comparador visual**: original junto a los campos, con el recuadro del dato leído y un semáforo de confianza por campo.
- **Duplicados aproximados** (mismo proveedor y número, o importe y fecha cercanos) además del hash exacto actual.
- **Subida desde el móvil con cámara** y varias páginas en un documento; buzón de correo dedicado con revisión previa.
- **Tickets y facturas simplificadas** como tipo de documento propio.

### Uso diario
- **Panel de pendientes**: una lista única de lo que requiere acción (documentos por revisar, albaranes sin factura, cobros vencidos, material sin precio, fin de trimestre próximo).
- **Avisos de calendario fiscal** con los plazos del trimestre y recordatorio de preparar el paquete.
- **Búsqueda global** por proveedor, número, importe o referencia, con filtros por fechas.
- **Plantillas de presupuesto** por servicio y PDF con logotipo y condiciones para enviar al cliente.
- **Facturación recurrente** de contratos de mantenimiento.
- **Modo oscuro y tamaño de letra** para uso en obra; atajos de teclado en escritorio.
- **PWA completa** con caché de lectura y borradores locales señalados.

### Seguridad y operación
- **Recuperación de contraseña y doble factor** para el responsable; alta/baja de usuarios y revocación de sesiones.
- **Copia externa cifrada** (disco USB o nube propia) con prueba de restauración periódica y aviso si falla.
- **Panel de salud ampliado**: espacio en disco, tamaño de la base, tiempo medio de OCR y antigüedad de la cola.
- **Actualizaciones guiadas**: un script que hace copia, migra, comprueba salud y deja documentada la vuelta atrás.
- **Auditoría consultable** con filtros y exportación, incluido quién descargó un paquete de trimestre.
- **Retención de documentos** acorde a los plazos legales de conservación, con aviso antes de cualquier borrado.

### Calidad y mantenimiento
- **Pruebas de navegador** para Trimestres y revisión de OCR en la batería existente, y ejecución automática al cambiar el código.
- **Dividir `dashboard.tsx`** (más de 2.600 líneas) en módulos por sección; el grafo de código (`graphify-out`) lo muestra como el nodo que concentra la interfaz.
- **Datos de demostración opcionales**, separados de los reales, para formar a nuevos usuarios.
- **Medición de rendimiento** con datos representativos (miles de lotes y documentos) antes de añadir paginación en servidor.

### Integraciones (solo con API oficial o importación autorizada)
- **Importación de tarifas de proveedores** en CSV con vista previa e histórico de precios; alerta cuando una compra se aparta mucho del precio habitual.
- **Facturación electrónica**: seguir la normativa vigente como proyecto aparte con validación profesional.
- **Exportación a programas contables** una vez conocido el formato que usa la asesoría.

## 4. Diseño de etiquetas y escaneo: siguientes pasos concretos

1. Identificar modelo de impresora, ancho útil, resolución, controlador y tipo de separación del rollo.
2. Imprimir una etiqueta de prueba con regla/calibración y comprobar márgenes, escala al 100 % y lectura con móvil y lector habitual.
3. Guardar perfiles con nombre y medidas; seleccionar perfil antes de preparar una tanda.
4. Añadir plantillas de caja, unidad y ubicación, sin duplicar códigos de lote por cambiar el diseño.
5. Registrar tandas preparadas/reimpresas si aporta utilidad; abrir el diálogo no demuestra impresión física.
6. Estudiar impresión directa ZPL/TSPL o puente local solo tras identificar el hardware. Mantener alternativa del navegador.
7. Para escanear desde otro dispositivo, configurar una dirección estable y accesible del servidor y HTTPS. Probar autenticación, acceso y cámara desde ese dispositivo; `localhost` no apunta al mini PC desde un móvil.

## 5. Reglas de datos que deben guiar todas las fases

- Identificador de lote inmutable; nuevas compras crean lotes nuevos aunque exista artículo maestro común.
- Cantidades y dinero con decimales exactos; unidades explícitas y conversiones revisadas.
- Documento original conservado; OCR como propuesta, confirmación humana y vínculo a líneas/movimientos.
- No borrar operaciones confirmadas para corregir saldos; compensar, justificar y auditar.
- Inventario físico, valoración, consumo de obra y documento fiscal son conceptos distintos, relacionados mediante operaciones explícitas.
- Los datos pendientes de precio no equivalen a coste cero; rentabilidad provisional visible.
- Cada cambio debe poder explicarse por usuario, momento, motivo y origen. Las exportaciones respetan los mismos permisos que las pantallas.

## 6. Cierre de cada entrega y definición de terminado

Una entrega está terminada cuando el recorrido principal funciona en navegador contra la base real de pruebas, los permisos y errores se comprueban en API, la migración es incremental, los importes y existencias concilian, no quedan registros ficticios, la versión validada está instalada y la documentación refleja las limitaciones reales. La impresora, formatos del proveedor y acceso desde móviles se validan con sus condiciones reales antes de declararlos comprobados.

**Después de esta entrega:** validar el formato real del proveedor y la impresora; después abordar pedidos/recepciones parciales y conciliación por líneas; luego ubicaciones y reposición. El orden puede cambiar por uso real, pero se mantendrán las dependencias de datos descritas.

### Resultado de esta continuación

Recuentos, recuperación de faltantes, filtros, mínimos sobre material libre y CSV implementados. Veinte pruebas unitarias, TypeScript y compilación de producción correctos. Las pruebas HTTP con PostgreSQL comprueban conflictos, permisos, valoración y devoluciones; las pruebas de navegador comprueban recuentos, CSV, conexión, contexto del trabajo, escritorio/móvil y etiquetas legibles. Se repitieron los recorridos económicos y OCR anteriores. Véase `VERIFICACION.md` para evidencia y límites.

### Entrega del 19 de octubre de 2026: OCR, proveedor y cierre trimestral

Implementado: elección del proveedor por NIF o por nombre más parecido (`src/lib/supplier-match.ts`), lectura ampliada de fechas, número, base/IVA/total y tablas de IVA, reintento de Tesseract con otros modos de página, IVA en gastos generales (migración `20261019090000_overhead_tax`), pantalla «Trimestres» con API `/api/quarters` (JSON, CSV y ZIP en streaming con las facturas originales). Pruebas: 33 unitarias, regresión `test:integration` y `test:quarters` contra PostgreSQL, ZIP validado con `zipfile`. Pendiente: ver abajo.

**Queda por completar de esta entrega:** (1) medir aciertos por campo con albaranes y facturas reales del proveedor habitual y añadir sus casos anonimizados a `tests/ocr.test.ts`; (2) revisar «Trimestres» en navegador, móvil y teclado; (3) desglose por tipo de IVA (4/10/21 %) y por modelo con la asesoría; (4) generar una copia manual previa antes de futuras migraciones (corregir la ruta del script en Windows).

---

## Registro de la iteración anterior

## Objetivo de esta iteración

Navegación fluida entre secciones, mejor presentación y un recorrido operativo desde el albarán hasta el material identificado, etiquetado y consumido en un trabajo. Impresión orientada a etiquetas en rollo, con tamaño configurable.

## Trabajo actual y cómo terminarlo

### 1. Verificar la navegación

Implementado: panel en un layout compartido de Next.js, datos iniciales desde servidor, enlaces con precarga, datos compartidos mediante SWR y carga diferida de gráficas, almacén, revisión y lector de cámara. El texto completo del OCR se consulta al abrir la revisión; la cola dispone de una consulta ligera.

Cerrado: medición antes/después, conservación del panel, recuento de solicitudes y actualización de datos tras guardar comprobados. Se mantienen los permisos por empresa y no se almacena información financiera en localStorage.

Aceptación: cambios de sección sin vaciar el panel ni volver a solicitar todo el estado en cada clic; datos actualizados después de guardar; sesión y permisos vigentes en cada API.

### 2. Completar el recorrido del albarán

Implementado: recepción de artículos revisados en almacén, agrupación conservadora de líneas iguales, códigos por lote, ubicación, marca/modelo y albaranes con precios pendientes. Una compra posterior genera otro lote.

Cerrado: recorrido desde la interfaz y extracción real comprobados; las líneas iguales suman unidades bajo el mismo identificador y los artículos, unidades o costes diferentes permanecen separados.

Aceptación: un pedido de 20 unidades iguales genera un lote de 20 unidades con un código, con enlace al documento original y sin imputar automáticamente su coste completo a un trabajo.

### 3. Validar movimientos y costes

Implementado: reservas, liberación de reservas, consumo por trabajo, devolución de sobrantes, devolución al proveedor, historial y valoración posterior con factura. Las operaciones usan transacciones y claves de petición para impedir duplicaciones.

Cerrado: pruebas HTTP con PostgreSQL de cantidades, costes, devoluciones, concurrencia, permisos y factura posterior correctas. Los beneficios permanecen marcados como provisionales mientras existan consumos sin precio.

Aceptación: no hay existencias negativas ni consumo de reservas ajenas; cada salida genera su coste una sola vez; una devolución resta el coste correspondiente; la factura conserva códigos y cantidades y actualiza la valoración, sin otra entrada.

### 4. Verificar impresión en rollo

Implementado: selección de varios lotes, número de copias por lote, QR, Code 128 o ambos, ancho/alto en milímetros, ubicación y proveedor opcionales. Las copias del mismo lote conservan el código. Preparar e imprimir no modifica existencias.

Cerrado por software: vista previa, varias copias del mismo identificador, decodificación de los SVG, medidas de impresión y legibilidad comprobados. La impresión física y calibración final quedan pendientes de la impresora y el rollo reales.

Aceptación: se pueden preparar una, cinco o veinte etiquetas de un lote de veinte; todas abren o identifican el mismo lote; el diálogo del sistema permite elegir la impresora.

### 5. Presentación, regresiones y entrega

Cerrado: pantallas de almacén, ficha, revisión e impresión revisadas en escritorio y móvil; composición de etiquetas corregida; navegación anterior, formularios y resultado económico de referencia comprobados. Se conserva una copia previa a la migración y se han retirado los registros de prueba y actualizado los manuales.

## Orden recomendado después de esta iteración

1. **OCR específico del proveedor.** Trabajar con albaranes reales representativos, preparar casos de prueba anonimizados y mapear columnas/referencias sin inferir cantidades o unidades inciertas. Mantener revisión humana y medir errores por campo.
2. **Pedidos y recepciones parciales.** Separar lo pedido, lo recibido y lo pendiente. Relacionar varias recepciones con un pedido y varias líneas de factura con sus recepciones, conservando conciliación por cantidades y coste.
3. **Recuentos y ajustes.** Permitir registrar inventario físico, diferencias, pérdidas y roturas con motivo, fecha y usuario. Crear movimientos de ajuste; no sobrescribir el historial ni el saldo sin trazabilidad.
4. **Ubicaciones y transferencias.** Modelar almacén, estanterías, furgonetas y material en obra. Una transferencia conserva lote y valoración y modifica saldos por ubicación, sin crear compras o gastos.
5. **Catálogo de artículos y reposición.** Vincular de forma revisable varios lotes a un artículo maestro. Definir mínimos por artículo y calcular necesidades teniendo en cuenta stock libre, reservas y pedidos pendientes. No sumar metros con rollos ni comparar modelos no equivalentes.
6. **Perfiles e impresión directa.** Identificar modelo, resolución, lenguaje y conexión de la impresora. Guardar perfiles de tamaño y estudiar un puente local para ZPL/TSPL; mantener la impresión del navegador como alternativa. No afirmar que un trabajo se ha impreso físicamente solo porque se abrió el diálogo.
7. **Operación diaria.** Mejorar búsqueda por obra/proveedor/fecha, exportación del inventario, avisos de mínimos y un resumen de material pendiente de precio o de devolución. Añadir filtros y paginación según crezca el volumen real.

## Evidencia recogida durante el cierre

- Prueba local comparable de cinco cambios de sección: mediana inicial 398 ms, mediana final tras la optimización 63 ms. Peticiones completas de estado durante esos cambios: cinco antes, cero después. El contenedor del panel se mantuvo en los cinco cambios posteriores.
- Catorce pruebas unitarias de cálculos, OCR, agrupación de artículos y unidades: correctas.
- Pruebas HTTP de almacén: recepción, un lote para veinte unidades iguales, reservas, uso/devoluciones, peticiones repetidas, concurrencia, permisos y factura posterior correctos.
- Navegador: preparación de siete etiquetas de un mismo lote; QR y Code 128 decodificados; medidas calculadas de 62 × 40 mm; registro de salida y devolución; escritorio y móvil sin desbordamiento horizontal de la página.
- Ajustes de composición de etiqueta y edición de copias revalidados en navegador. Recorrido de recepción sin precios verificado desde la interfaz, incluido el lote de siete unidades y sus cuatro etiquetas.
- La prueba física de papel, escala y calibración queda a realizar con la impresora y el rollo del usuario; la vista previa y la generación/lectura de códigos se han comprobado por software.

## Límites que deben mantenerse visibles

- El código identifica el lote, no una unidad individual ni un número de serie del fabricante.
- Los códigos QR con enlace necesitan una dirección de servidor accesible desde el dispositivo que los abre; localhost no identifica el servidor desde otro móvil.
- La conciliación actual cubre uno o varios albaranes completos por factura. La facturación parcial de un mismo albarán sigue pendiente.
- Los albaranes antiguos imputados directamente a trabajos no se convierten automáticamente en stock, para evitar alterar gastos o duplicar material.
- El OCR propone datos y no confirma por sí solo una recepción.
