# Revisión visual de documentos, imagen tipo escáner y borrado de subidas · Fase 1

Fecha: 2026-11-01 · Estado: pendiente de revisión · Fases 2 y 3 fuera de este documento (ver «Hoja de ruta»).

## Objetivo

El responsable sube facturas y albaranes (PDF, fotos del móvil o la tablet) casi siempre de los mismos proveedores. Hoy el OCR falla en cabecera, líneas de tabla, fotos y PDF escaneados, y al revisar no se ve de dónde sale cada dato. Esta fase:

1. Convierte cada página en una imagen «tipo escáner» sobre la que trabajar.
2. Guarda las coordenadas de cada palabra leída.
3. Muestra el original junto al formulario con recuadros de colores y etiqueta por dato.
4. Adapta la interfaz a una tablet pequeña en horizontal.
5. Permite eliminar subidas que no se hayan confirmado.

**Éxito:** al abrir una revisión se ve la página al lado del formulario; cada campo con valor localizable tiene su recuadro etiquetado; en 960×540 y 1280×800 se puede revisar y confirmar sin desplazar la página entera; una subida sin confirmar se elimina y puede volver a subirse; el OCR no empeora en los documentos de prueba.

**Fuera de alcance:** plantillas por proveedor, aprendizaje de correcciones, anulación de documentos confirmados, cambios en la contabilidad o el stock.

## Decisiones tomadas

- Enfoque «coordenadas por palabra + plantillas con zonas». Esta fase construye la parte de coordenadas; la plantilla (fase 2) se apoya en ella.
- El original es inmutable. La imagen escaneada es un derivado aparte.
- Las coordenadas se guardan como fracciones 0–1 de la página escaneada.
- Los documentos confirmados no se eliminan en esta fase.
- La plantilla se creará desde la revisión (fase 2), sin editor aparte.

## Datos

Tabla nueva `DocumentPage`:

| Campo | Tipo | Nota |
|---|---|---|
| id | cuid | |
| documentId | FK Document, `onDelete: Cascade` | |
| page | int | desde 1; único con documentId |
| scanFilename | string | ruta relativa a `DOCUMENT_DIR`, p. ej. `scans/<docId>-p1.jpg` |
| width, height | int | píxeles de la imagen escaneada |
| words | Json | `[{t, x, y, w, h, c}]`: texto, recuadro 0–1, confianza 0–100 |
| scanQuality | string | `ok` o `fallback` (no se pudo recortar/enderezar) |

`Document.suggestion` gana `evidence`:

```
evidence: {
  number|date|net|tax|total|supplier: {page, box:[x,y,w,h], approx: boolean} | null,
  lines: [{description?: Ev, quantity?: Ev, unit?: Ev, price?: Ev, discount?: Ev}]
}
```

Migración incremental; los documentos ya existentes siguen funcionando sin páginas (la revisión cae al comportamiento actual con el original en un enlace).

## Imagen tipo escáner

- Se amplía `scripts/prepare-ocr.py` con un modo `--scan` que, para cada página: detecta el contorno del papel y corrige la perspectiva (ya existe `page_on_dark_background`), endereza (ya existe), iguala el fondo y quita sombras, y devuelve una imagen en gris de hasta 2500 px por el lado largo, JPEG calidad 85.
- Si el recorte no es fiable (no hay cuadrilátero claro o ocupa casi toda la foto), se usa la página sin recortar y `scanQuality = fallback`, con aviso en la revisión.
- El worker (`worker/index.ts`) genera la imagen escaneada de cada página, ejecuta el OCR sobre ella con la lógica actual de variantes de `worker/ocr-image.ts`, y guarda las palabras.
- PDF con texto nativo: se renderiza la página para mostrarla y las palabras salen de `pdftotext -bbox-layout`, normalizadas al tamaño de la imagen renderizada. PDF escaneado o imagen: palabras del TSV de Tesseract.
- Los archivos escaneados viven en `DOCUMENT_DIR/scans/` y se incluyen en las copias de seguridad (ya cubren todo `documents`).

## Evidencia (recuadros)

- Módulo nuevo `src/lib/ocr-evidence.ts`, sin dependencias de base de datos: dada la sugerencia y las palabras, devuelve `evidence`.
- Para cada valor, normaliza (importes: quita separadores; fechas: formatos habituales; número: sin espacios) y busca secuencias de palabras que coincidan. Con varias coincidencias elige la más cercana a su etiqueta («Nº», «Fecha», «Base», «IVA», «Total»); si sigue habiendo ambigüedad, marca `approx: true`.
- Líneas: se localizan por la fila (misma franja vertical) que contiene la cantidad y el precio leídos, y dentro de ella cada celda por coincidencia.
- No hay coincidencia → `null`; la interfaz muestra el campo sin recuadro.

## API

- `GET /api/documents/[id]/pages` → `{pages: [{page, width, height, scanQuality, words?}]}`. Mismos permisos que la descarga del original (responsable; técnico solo sus subidas de trabajos accesibles).
- `GET /api/documents/[id]/pages/[n]/image` → imagen escaneada, `Cache-Control: no-store`, `nosniff`.
- `DELETE` de documentos como operación POST `/api/operations/document-delete` con `{id}`, para reutilizar la comprobación de origen existente.

## Interfaz de revisión

- Componente nuevo `src/components/inventory/document-viewer.tsx`: imagen con zoom (rueda, botones +/−, pellizco) y arrastre, capa SVG de recuadros sobre las mismas coordenadas, leyenda y interruptor «Ver recuadros».
- Colores por tipo de dato, siempre acompañados de etiqueta de texto: Nº documento, Fecha, Proveedor, Base, IVA, Total; en líneas: Descripción, Cantidad, Precio. Recuadros `approx` con borde discontinuo.
- Enfocar un campo del formulario resalta su recuadro y centra la imagen; tocar un recuadro enfoca su campo.
- `document-review.tsx` sustituye el desplegable «Ver documento original» por este visor en una columna junto al formulario. Sin páginas guardadas se mantiene el enlace al original.
- Varias páginas: selector de página.

## Tablet pequeña en horizontal

Referencia: de 960×540 a 1280×800.

- Condición: `(orientation: landscape) and (max-height: 700px)` o ancho entre 760 y 1180 px.
- Barra lateral a columna de iconos de 64 px, barra superior de 52 px, padding de contenido reducido.
- Diálogos y revisión a casi pantalla completa; revisión en dos columnas (imagen 45 %, formulario 55 %) con desplazamiento independiente.
- Controles táctiles de al menos 44 px.
- Se corrige el hueco actual entre los saltos de 1150 y 760 px de `globals.css`.

## Eliminar subidas

- Operación `document-delete` (solo POST con origen comprobado).
- Elegible si `confirmedAt` es nulo y no existen líneas, costes ni lotes asociados. Estado `PROCESSING` con arrendamiento vigente: se rechaza («se está leyendo, espera a que termine»).
- Permisos: responsable cualquiera de su empresa; técnico solo las suyas (`uploaderId`), de un trabajo que le pertenece y sin confirmar. Otra empresa → 404.
- Transacción: borrar páginas y documento y crear la entrada de auditoría; después, borrar del disco el original y los escaneados (un fallo de borrado de archivo no revierte la transacción, solo se registra).
- Confirmado o con dependencias: error 409 que indica qué depende del documento.
- Interfaz: botón «Eliminar» por documento y selección múltiple, ambos con confirmación; tras borrar se puede volver a subir el mismo archivo (el hash deja de bloquear).

## Pruebas

- Unitarias: `ocr-evidence` (normalización, desempate por etiqueta, `approx`, líneas), conversión de coordenadas, validación de permisos de borrado.
- Integración (con PostgreSQL): borrar sin confirmar; rechazo de confirmado, en lectura, de otra empresa, de técnico ajeno; desaparición de archivos; nueva subida del mismo archivo.
- Navegador: revisión con recuadros y foco cruzado campo↔recuadro; capturas a 960×540, 1024×600, 1280×800 y escritorio.
- No regresión de OCR: ejecutar `tests/ocr*.test.ts` y `tests/smoke-ocr-review.mjs` y comparar la lectura sobre los documentos de `data/ocr-sonepar` con y sin imagen escaneada; si la escaneada empeora un caso, se conserva la lectura de la mejor variante.

## Riesgos

- El recorte de papel puede fallar en fotos con fondo claro o desordenado: mitigado por el `fallback` y por conservar la lógica de variantes.
- La localización valor→recuadro es heurística: por eso existe `approx` y el campo sigue siendo editable sin recuadro.
- Las páginas guardadas aumentan el espacio en disco (~300–800 KB por página): visible en el panel de estado y cubierto por las copias.

## Hoja de ruta

- **Fase 2 · Plantillas:** «Recordar para este proveedor» al dibujar un recuadro; zonas por proveedor y tipo en estas mismas coordenadas, ancladas (cabecera arriba, totales al pie, tabla por columnas); relectura por zona con ajustes propios; respaldo al análisis genérico.
- **Fase 3 · Mejora continua:** aprender de las correcciones y medir aciertos por campo.
