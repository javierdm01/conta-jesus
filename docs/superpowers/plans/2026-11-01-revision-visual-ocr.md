# Revisión visual de documentos · Plan de implementación (fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar una imagen «tipo escáner» y las coordenadas de cada palabra de los documentos, mostrar el original junto al formulario con recuadros etiquetados, adaptar la interfaz a tablet pequeña en horizontal y permitir eliminar subidas sin confirmar.

**Architecture:** El worker genera por página una imagen escaneada (OpenCV) en `DOCUMENT_DIR/scans/`, ejecuta el OCR actual sobre ella y guarda palabras con recuadros normalizados (0–1) en `DocumentPage`. Un módulo puro (`ocr-evidence`) empareja los valores de la sugerencia con esas palabras y escribe `suggestion.evidence`. Un visor React dibuja los recuadros; el borrado es una operación servidor con reglas puras de elegibilidad.

**Tech Stack:** Next.js 16 / React 19, Prisma 6 + PostgreSQL, sharp, Python 3 + OpenCV (`scripts/prepare-ocr.py`), Tesseract/poppler, `tsx --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-revision-visual-ocr-design.md`

**Nota de entorno:** la carpeta no es un repositorio git. Cada tarea termina con un *punto de control* (`npm test` y `npm run typecheck` en verde) en lugar de un commit. Las pruebas de integración y de navegador necesitan la pila Docker en marcha (`Iniciar.ps1`) y se ejecutan con los comandos de `README.md`.

## Global Constraints

- Coordenadas: fracciones 0–1 de la imagen escaneada de cada página; recuadro = `[x, y, w, h]`.
- Imagen escaneada: gris, hasta **2500 px** por el lado largo, JPEG calidad **85**, en `DOCUMENT_DIR/scans/<documentId>-p<n>.jpg`. El original no se modifica nunca.
- `DocumentPage.scanQuality` ∈ `ok` | `fallback`.
- Tablet: condición `(orientation: landscape) and (max-height: 700px)` o ancho entre 760 y 1180 px; barra lateral **64 px**, barra superior **52 px**, controles táctiles **≥ 44 px**, revisión en dos columnas **45 % / 55 %**; referencias 960×540, 1024×600, 1280×800.
- Eliminar: solo documentos sin confirmar y sin líneas, costes ni lotes; `PROCESSING` con arrendamiento vigente se rechaza; confirmado o con dependencias → **409**; otra empresa → **404**; técnico solo sus subidas sin confirmar de un trabajo accesible.
- El campo siempre sigue siendo editable aunque no tenga recuadro; los recuadros dudosos llevan `approx: true` y borde discontinuo; cada recuadro lleva etiqueta de texto además de color.
- Mensajes de interfaz en español; el código sigue el estilo del repositorio (TypeScript estricto, zod en servidor, `AppError`).

## Review Focus

1. Foto sin contorno de papel claro (fondo claro o desordenado) → `scanQuality = "fallback"`, página sin recortar y OCR igualmente ejecutado (Task 4).
2. Documentos anteriores a este cambio, sin `DocumentPage` → la revisión no falla y ofrece el enlace al original (Task 9).
3. El mismo importe aparece en base, total y línea → el recuadro no se asigna a ciegas: `approx: true` o el de la etiqueta más cercana (Task 2).
4. Borrado con doble clic, durante la lectura del worker, o con el archivo ya ausente del disco; re-subida del mismo archivo después (Task 7).
5. PDF de varias páginas → la evidencia apunta a la página correcta y el fallo de una imagen escaneada ausente muestra un mensaje en el visor, no una pantalla rota (Tasks 2, 5, 8).

---

### Task 1: Palabras normalizadas (TSV de Tesseract y bbox de pdftotext)

**Files:**
- Create: `src/lib/ocr-words.ts`
- Test: `tests/ocr-words.test.ts`

**Interfaces:**
- Produces: `type Word = {t: string; x: number; y: number; w: number; h: number; c: number}` (fracciones 0–1; `c` confianza 0–100); `wordsFromTsv(tsv: string, width: number, height: number): Word[]`; `wordsFromPdfBbox(xhtml: string): Word[]`.

- [ ] **Step 1: Write the failing tests** en `tests/ocr-words.test.ts`:
  - `wordsFromTsv convierte píxeles a fracciones`: TSV de una palabra nivel 5 `left=100 top=50 width=200 height=40 conf=90 text="Total"` en imagen 1000×500 → `[{t:"Total", x:0.1, y:0.1, w:0.2, h:0.08, c:90}]`.
  - `wordsFromTsv descarta confianza < 15, texto vacío y niveles distintos de 5` (reutiliza el criterio de `layoutWords`).
  - `wordsFromPdfBbox normaliza por el tamaño de página`: `<page width="600" height="800"><word xMin="60" yMin="80" xMax="120" yMax="96">IVA</word></page>` → `x:0.1, y:0.1, w:0.1, h:0.02, c:100`; entidades `&amp;` decodificadas.
- [ ] **Step 2:** `npx tsx --test tests/ocr-words.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `wordsFromTsv` apoyándose en `layoutWords` de `src/lib/ocr-layout.ts`, y `wordsFromPdfBbox` con una expresión regular sobre `<page …>` y `<word …>` (sin dependencia XML). Redondear a 5 decimales.
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5: Punto de control:** `npm test && npm run typecheck`.

### Task 2: Emparejar valores con palabras (evidencia)

**Files:**
- Create: `src/lib/ocr-evidence.ts`
- Test: `tests/ocr-evidence.test.ts`

**Interfaces:**
- Consumes: `Word` (Task 1), `OcrSuggestion` de `src/lib/ocr.ts`.
- Produces: `type Box = [number, number, number, number]`; `type Ev = {page: number; box: Box; approx: boolean}`; `type LineEv = Partial<Record<"description"|"quantity"|"unit"|"price"|"discount", Ev | null>>`; `type Evidence = {number?: Ev|null; date?: Ev|null; net?: Ev|null; tax?: Ev|null; total?: Ev|null; supplier?: Ev|null; lines: LineEv[]}`; `type PageWords = {page: number; words: Word[]}`; `buildEvidence(s: Pick<OcrSuggestion, "number"|"date"|"net"|"tax"|"total"|"supplier"|"lines">, pages: PageWords[]): Evidence`.

- [ ] **Step 1: Write the failing tests.** Fixture: una página con filas de palabras (helper `row(y, ...[text,x])`) que representa «Factura Nº F-001», «Fecha 18/10/2026», una línea «Cable 3x2,5 | 2 | 15,50 | 31,00», «Base imponible 31,00», «IVA 21% 6,51», «Total 37,51». Aserciones:
  - `number` → recuadro de la palabra «F-001», `approx:false`; `date: "2026-10-18"` casa con «18/10/2026».
  - Importes: `"31.00"` casa con «31,00» y con «1.234,56» ↔ `"1234.56"`.
  - **Mismo importe repetido** (base = línea = «31,00»): `net` elige el más cercano a «Base imponible» y `lines[0].price`/`quantity` no se asignan a esa palabra de la base; si dos candidatos empatan en distancia, `approx:true`.
  - Valor ausente en las palabras → `null` (no lanza).
  - **Varias páginas:** el total solo existe en la página 2 → `total.page === 2`.
  - Línea: `description` devuelve la unión de las palabras de la fila que coinciden (`approx:true` si solo coincide parte), `quantity`, `price` y `discount` el recuadro de su celda.
- [ ] **Step 2:** `npx tsx --test tests/ocr-evidence.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Normalizadores: importes (quitar `€`, espacios y separadores de miles, coma→punto), fechas (`YYYY-MM-DD` ↔ `DD/MM/YYYY`, `DD-MM-YY`), número (solo alfanumérico en minúsculas). Candidatos = palabras cuyo valor normalizado coincide (o secuencias de palabras contiguas de la misma fila para valores con espacios). Elegir el candidato con menor distancia a una palabra-etiqueta del campo (`número|nº|factura|albarán`, `fecha`, `base`, `iva|cuota`, `total`) situada en su fila o en la anterior y a su izquierda; sin etiqueta o empate → primero en orden de lectura con `approx:true`. Líneas: localizar la fila por la coincidencia de cantidad y precio; las celdas se buscan solo dentro de esa fila (tolerancia vertical 0.6 × altura mediana). `supplier`: secuencia de las dos primeras palabras de `supplier.name`, `approx:true`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Punto de control.**

### Task 3: Lista de recuadros para el visor

**Files:**
- Create: `src/lib/evidence-boxes.ts`
- Test: `tests/evidence-boxes.test.ts`

**Interfaces:**
- Consumes: `Evidence` (Task 2).
- Produces: `type FieldKind = "number"|"date"|"supplier"|"net"|"tax"|"total"|"description"|"quantity"|"unit"|"price"|"discount"`; `type ViewerBox = {id: string; kind: FieldKind; label: string; page: number; box: Box; approx: boolean}`; `boxesFromEvidence(e: Evidence | undefined): ViewerBox[]`; `FIELD_LABEL: Record<FieldKind, string>` (etiquetas en español: «Nº documento», «Fecha», «Proveedor», «Base», «IVA», «Total», «Descripción», «Cantidad», «Unidad», «Precio», «Dto.»).

- [ ] **Step 1: Write the failing tests:** ids estables `number` y `line-0-price`; se omiten los `null`/ausentes; `boxesFromEvidence(undefined)` → `[]`; la etiqueta de cada recuadro sale de `FIELD_LABEL`.
- [ ] **Step 2:** `npx tsx --test tests/evidence-boxes.test.ts` → FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5: Punto de control.**

### Task 4: Imagen tipo escáner (OpenCV)

**Files:**
- Modify: `scripts/prepare-ocr.py` (nuevo modo `--scan`)
- Create: `worker/scan-page.ts`
- Test: `tests/scan-page.test.ts`

**Interfaces:**
- Produces: `scanPage(input: string, output: string, run: Run): Promise<{width: number; height: number; quality: "ok" | "fallback"}>` donde `Run = (command: string, args: string[]) => Promise<string>` (el mismo tipo que usa `worker/ocr-image.ts`). `output` es un `.jpg`.
- CLI: `python scripts/prepare-ocr.py --scan <entrada> <salida.jpg>` imprime `{"width":…, "height":…, "quality":"ok"|"fallback"}`; el modo actual (sin `--scan`) no cambia.

- [ ] **Step 1: Write the failing tests** (`tests/scan-page.test.ts`; se omiten con `t.skip` si `python -c "import cv2"` falla). Con `sharp` generar: (a) una página blanca con texto negro girada 3° sobre fondo oscuro con una sombra en gradiente → `quality === "ok"`, lado largo ≤ 2500, y la mediana de luminosidad de los píxeles de fondo ≥ 235 (sombra eliminada); (b) una imagen sin contorno de papel (fondo claro uniforme con texto) → `quality === "fallback"`, y el archivo se genera igualmente.
- [ ] **Step 2:** `npx tsx --test tests/scan-page.test.ts` → FAIL.
- [ ] **Step 3: Implement.** En el script: reutilizar `page_on_dark_background` y la nivelación/enderezado de `prepare_photo`; si `page_on_dark_background` devuelve la misma forma (no hubo recorte), calidad `fallback`. Reducir a 2500 px de lado largo, guardar JPEG calidad 85. `scanPage` invoca el script con `process.env.PYTHON_PATH ?? (win32 ? "python" : "python3")` y parsea el JSON.
- [ ] **Step 4:** PASS. **Step 5: Punto de control.**

### Task 5: Modelo de datos y almacenamiento de páginas

**Files:**
- Modify: `prisma/schema.prisma` (modelo `DocumentPage`, relación `pages DocumentPage[]` en `Document`)
- Create: `prisma/migrations/20261101120000_document_pages/migration.sql`
- Modify: `worker/index.ts`, `worker/ocr-image.ts`

**Interfaces:**
- Consumes: `scanPage` (Task 4), `wordsFromTsv`/`wordsFromPdfBbox` (Task 1), `buildEvidence` (Task 2).
- Produces: tabla `DocumentPage(id, documentId→Document ON DELETE CASCADE, page, scanFilename, width, height, words Json, scanQuality, UNIQUE(documentId,page))`; `suggestion.evidence` (tipo `Evidence`) en cada documento procesado. `ocrImage` mantiene su firma (la imagen que recibe pasa a ser la escaneada).

- [ ] **Step 1:** añadir modelo y migración SQL (`CREATE TABLE`, índice único `(documentId, page)`, FK con `ON DELETE CASCADE`); `npx prisma generate`.
- [ ] **Step 2:** en `worker/index.ts`, para cada página: (imágenes) normalizar orientación con `sharp(...).rotate()` a un PNG temporal; (PDF) la rasterización existente; luego `scanPage` → `DOCUMENT_DIR/scans/<id>-p<n>.jpg`; ejecutar `ocrImage` sobre ese archivo; obtener palabras: PDF con texto nativo → `pdftotext -bbox-layout -f n -l n` + `wordsFromPdfBbox`; resto → un `tesseract <scan> stdout -l spa+eng --psm 3 tsv` adicional + `wordsFromTsv` con el tamaño devuelto por `scanPage`.
- [ ] **Step 3:** al terminar, en la misma actualización que fija `REVIEW`, `deleteMany` + `createMany` de `DocumentPage` y `suggestion = {...parseOcr(...), evidence: buildEvidence(...)}`, protegido por el `lockToken` existente. Si falla `scanPage`, continuar sin páginas y añadir un aviso en `suggestion.warnings` (nunca dejar el documento en `FAILED` por esto).
- [ ] **Step 4: Verificación:** `npx prisma migrate deploy` contra la base de desarrollo, `npm run typecheck`, y con la pila arrancada subir una imagen de prueba y comprobar `SELECT page, "scanQuality", jsonb_array_length(words) FROM "DocumentPage"` → una fila con palabras > 0 y archivo existente en `scans/`.
- [ ] **Step 5: Punto de control:** `npm test && npm run typecheck`.

### Task 6: API de páginas

**Files:**
- Create: `src/app/api/documents/[id]/pages/route.ts`, `src/app/api/documents/[id]/pages/[n]/image/route.ts`
- Create: `src/lib/document-access.ts`
- Test: `tests/pages-integration.ts` (+ script `test:pages` en `package.json`)

**Interfaces:**
- Produces: `documentForUser(u: Actor, id: string): Promise<Document>` (misma regla que la descarga del original en `src/app/api/documents/[id]/route.ts`: responsable de su empresa; técnico solo `uploaderId === u.id` con `accessibleJob`; si no, `AppError 404/403`); `GET .../pages` → `{pages: {page, width, height, scanQuality}[]}` (con `?words=1` incluye `words`); `GET .../pages/[n]/image` → JPEG con `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.

- [ ] **Step 1: Write the failing integration test** siguiendo el patrón de `tests/integration.ts` (empresa y usuarios de prueba, `upload`, `waitOcr`): tras el OCR, `GET /pages` devuelve ≥ 1 página con `scanQuality`; la imagen responde 200 `image/jpeg`; un usuario de **otra empresa** recibe 404; un técnico ajeno recibe 403/404; borrar el archivo del disco y pedir la imagen devuelve 404 con mensaje, no 500.
- [ ] **Step 2:** `npm run test:pages` → FAIL. **Step 3:** implementar rutas con `documentForUser` y refactorizar la ruta del original para usarla. **Step 4:** PASS (con la pila en marcha). **Step 5: Punto de control.**

### Task 7: Eliminar subidas (servidor)

**Files:**
- Create: `src/lib/document-delete.ts`
- Modify: `src/lib/operations.ts` (acción `document-delete`, antes de los demás prefijos y **sin** `admin()`)
- Test: `tests/document-delete.test.ts`, `tests/document-delete-integration.ts` (+ script `test:delete`)

**Interfaces:**
- Produces: `type DeleteFacts = {status: string; kind: string; confirmedAt: Date | null; lockedUntil: Date | null; lines: number; costs: number; stockLots: number; valuedLots: number; replacedBy: boolean}`; `deleteBlocker(f: DeleteFacts, now?: Date): string | null` (mensaje en español o `null` si es eliminable); `deleteDocuments(u: Actor, input: unknown): Promise<{deleted: string[]; blocked: {id: string; reason: string}[]}>` con `input = {ids: string[]}` (1–50 ids, zod).

- [ ] **Step 1: Write the failing unit tests** de `deleteBlocker`: `REVIEW` sin dependencias → `null`; `FAILED` y `QUEUED` → `null`; foto `ARCHIVED` (`kind: "PHOTO"`) → `null`; `CONFIRMED` → mensaje; `lines`/`costs`/`stockLots`/`valuedLots` > 0 → mensaje que nombra la dependencia; `replacedBy` → mensaje; `PROCESSING` con `lockedUntil` futuro → mensaje «se está leyendo»; `PROCESSING` con `lockedUntil` pasado → `null`.
- [ ] **Step 2:** `npx tsx --test tests/document-delete.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `deleteDocuments`: cargar documentos con recuentos (`_count`) de su empresa; si falta alguno → `AppError(…, 404)` antes de borrar nada; técnico: exigir `uploaderId === u.id` y `accessibleJob`; los bloqueados se devuelven en `blocked` (si el único id está bloqueado, lanzar `AppError(reason, 409)`); transacción `Serializable` que re-comprueba `deleteBlocker`, borra el documento (las páginas caen por `CASCADE`) y crea `Audit` («Eliminar documento»); **después** borrar del disco el original y los `scans/` (un fallo se registra con `console.error` y no revierte; archivo ya ausente no es error).
- [ ] **Step 4: Write the failing integration test** (`tests/document-delete-integration.ts`, patrón de `tests/integration.ts`): sube y elimina un documento en `REVIEW` → 200, registro y archivos desaparecen; **volver a subir el mismo archivo** → 201 (el hash ya no bloquea); doble petición simultánea → una elimina y la otra recibe 404 sin 500; un documento confirmado → 409 con motivo; técnico ajeno → 404/403; otra empresa → 404; borrar con el archivo ya ausente del disco → 200.
- [ ] **Step 5:** `npx tsx --test tests/document-delete.test.ts` PASS; `npm run test:delete` PASS con la pila arrancada. **Step 6: Punto de control.**

### Task 8: Visor con recuadros

**Files:**
- Create: `src/components/inventory/document-viewer.tsx`, `src/components/inventory/evidence-style.ts`

**Interfaces:**
- Consumes: `ViewerBox`, `FieldKind`, `FIELD_LABEL` (Task 3); API de páginas (Task 6).
- Produces: `FIELD_COLOR: Record<FieldKind, string>` (colores distintos por tipo con contraste suficiente sobre blanco); `default export function DocumentViewer(props: {documentId: string; boxes: ViewerBox[]; activeId?: string; onSelect?: (id: string) => void}): JSX.Element`.

- [ ] **Step 1:** el visor carga `/api/documents/{id}/pages`, muestra la imagen de la página activa con zoom (botones +/−, rueda, pellizco) y arrastre; selector de página si hay varias; capa SVG con un `<rect>` y una etiqueta de texto por recuadro de esa página (`approx` → `stroke-dasharray`); interruptor «Ver recuadros» y leyenda con las etiquetas presentes; al cambiar `activeId` resalta el recuadro y centra la vista en él; tocar un recuadro llama a `onSelect(id)`.
- [ ] **Step 2:** estados: cargando; sin páginas → mensaje «No hay imagen preparada» y enlace al original; imagen ausente (404) → mensaje en el visor sin romper el resto de la pantalla.
- [ ] **Step 3: Verificación:** `npm run typecheck`; comprobación visual en Task 10.
- [ ] **Step 4: Punto de control.**

### Task 9: Integrar el visor en la revisión

**Files:**
- Modify: `src/components/inventory/document-review.tsx` (sustituir `<details className="simple-options review-original">` por el visor), `src/lib/workspace-types.ts` (`suggestion.evidence?: Evidence`)

**Interfaces:**
- Consumes: `DocumentViewer` (Task 8), `boxesFromEvidence` (Task 3).

- [ ] **Step 1:** estado `activeId`; `onFocus` en los campos de número, fecha, proveedor, base, IVA, total y en las celdas de cada línea (ids `number`, `date`, …, `line-{i}-price`) y `onSelect` que enfoca el input correspondiente (`ref`/`querySelector` por `name` o `data-field`).
- [ ] **Step 2:** conservar «Abrir original», el texto OCR y los avisos de `suggestion.warnings` en un bloque plegable bajo el visor; documentos **sin páginas** (anteriores al cambio) o sin `evidence` deben abrir la revisión sin error, mostrando el mensaje y el enlace al original del visor.
- [ ] **Step 3: Verificación de navegador** (`tests/review-visual-browser.mjs`, patrón de `tests/inventory-browser.mjs`): subir una imagen de prueba, abrir la revisión, comprobar que el visor muestra la imagen y ≥ 1 recuadro con etiqueta, que enfocar «Fecha» resalta su recuadro y que tocar un recuadro enfoca el campo; abrir la revisión de un documento sin páginas y comprobar que no hay errores de consola.
- [ ] **Step 4: Punto de control.**

### Task 10: Diseño para tablet pequeña en horizontal

**Files:**
- Modify: `src/app/globals.css` (nuevo bloque al final, sin tocar los saltos existentes salvo para corregir el hueco 760–1180 px)
- Test: `tests/tablet-layout-browser.mjs`

- [ ] **Step 1: Write the failing browser test:** a 960×540, 1024×600 y 1280×800 (landscape), con sesión iniciada: `document.documentElement.scrollWidth <= innerWidth` (sin desplazamiento horizontal) en inicio, facturas, inventario y la revisión; la barra lateral mide ≤ 64 px y la superior ≤ 52 px; en la revisión el visor y el formulario están en columnas contiguas (`visor.right <= formulario.left`) con anchos aproximados 45 %/55 %; todo botón e input visible de la revisión mide ≥ 44 px de alto; guardar capturas en `data/screenshots/tablet-<ancho>x<alto>-<pantalla>.png`.
- [ ] **Step 2:** ejecutarlo → FAIL (la barra lateral mide 205 px).
- [ ] **Step 3: Implement.** Bloque `@media (orientation: landscape) and (max-height: 700px), (min-width: 760px) and (max-width: 1180px)`: barra lateral de iconos (ocultar texto, 64 px), `.main` con `margin-left:64px`, `.topbar` de 52 px, paddings reducidos, diálogos casi a pantalla completa, `.review-grid` a `minmax(0,45fr) minmax(0,55fr)` con `overflow:auto` independiente y altura `calc(100dvh - …)`, controles con `min-height:44px`. Comprobar escritorio (≥ 1280 px y altura > 700 px) sin cambios visibles.
- [ ] **Step 4:** el test → PASS; revisar las capturas. **Step 5: Punto de control.**

### Task 11: Botones de eliminar en la bandeja

**Files:**
- Modify: `src/components/dashboard.tsx` (función `docsTable` y su fila; operación vía `request("/api/operations/document-delete", {ids})`)

- [ ] **Step 1:** botón «Eliminar» por documento (visible si su estado no es `CONFIRMED`; desactivado en `PROCESSING` con tooltip «Se está leyendo»), casillas de selección múltiple y barra «Eliminar seleccionados (n)»; ambos piden confirmación con el nombre del archivo y avisan de que se borra el original; deshabilitar mientras la petición está en curso (evita el doble clic).
- [ ] **Step 2:** tras responder, recargar con `load()`; mostrar `toast` con «Eliminado» o, si hay `blocked`, el motivo de cada uno; error de red/servidor → mensaje en pantalla.
- [ ] **Step 3: Verificación de navegador** (ampliar `tests/review-visual-browser.mjs`): subir, eliminar con confirmación, comprobar que desaparece de la bandeja y que el mismo archivo se puede subir de nuevo.
- [ ] **Step 4: Punto de control.**

### Task 12: No regresión del OCR, documentación y cierre

**Files:**
- Modify: `docs/VERIFICACION.md`, `docs/USUARIO.md`, `docs/ARQUITECTURA.md`, `README.md`

- [ ] **Step 1:** leer la cabecera de `scripts/compare-ocr-samples.ts` y ejecutarlo sobre `data/ocr-sonepar` **con y sin** la imagen escaneada (la ejecución «sin» usa el original como hasta ahora); registrar aciertos por campo. Si la escaneada empeora algún documento, hacer que el worker conserve la mejor lectura (comparar `score` de ambas) antes de cerrar la tarea.
- [ ] **Step 2:** ejecutar todo: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:pages`, `npm run test:delete`, `npm run test:integration`, y los scripts de navegador de las Tasks 9–11. Anotar resultados reales en `VERIFICACION.md`, incluidos los que no se pudieron ejecutar.
- [ ] **Step 3:** documentar en `USUARIO.md` cómo leer los recuadros (color + etiqueta, borde discontinuo = aproximado) y cómo eliminar subidas y por qué un documento confirmado no se elimina; en `ARQUITECTURA.md` el flujo de páginas y coordenadas; en `README.md` los nuevos scripts de prueba.
- [ ] **Step 4:** aplicar la migración en el servidor con `bash scripts/update.sh` y comprobar el estado (`docker compose ps`).
