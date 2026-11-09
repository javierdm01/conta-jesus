# Graph Report - PRUEBA CONTABILIDAD JESUS  (2026-11-01)

## Corpus Check
- 134 files · ~72,561 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 3, .example 1, .toml 1)

## Summary
- 810 nodes · 1799 edges · 58 communities (39 shown, 19 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- dec
- 20261018154635_initial/migration.sql
- Tu primer trabajo, paso a paso
- Plan de continuidad del ERP · revisión del 25 de octubre de 2026
- dashboard.tsx
- dependencies
- @zxing/browser
- workspace.tsx
- compilerOptions
- validation.ts
- ref_node_fs
- integration.ts
- Alcance y comprobaciones
- access.ts
- workspace-types.ts
- inventory-integration.ts
- (workspace)/layout.tsx
- components.json
- supplier-match.ts
- @prisma/client
- Instala · arquitectura y primera fase
- Instalación y operación
- ocr-cells.ts
- ref_node_assert
- quarters-integration.ts
- scripts
- label-preview.tsx
- next
- package.json
- prepare-ocr.py
- backup.sh
- devDependencies
- sonepar.ts
- restore.sh
- smoke-sonepar-images.mjs
- Albaranes, material y etiquetas
- Pedidos, perfiles y preparación trimestral
- Investigación del conector Sonepar
- backup-retry-env.sh
- smoke-ocr-review.mjs
- Prueba de los documentos nuevos · 27/10/2026
- Instala · gestión para instaladores
- service-chart.tsx
- overrides
- get-ip.sh script

## God Nodes (most connected - your core abstractions)
1. `dec()` - 52 edges
2. `sum()` - 33 edges
3. `Button()` - 31 edges
4. `cents()` - 31 edges
5. `AppError` - 28 edges
6. `currentUser()` - 28 edges
7. `Dashboard()` - 25 edges
8. `apiError()` - 23 edges
9. `parseOcr()` - 23 edges
10. `@playwright/test` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Tercera iteración: reconocimiento y cierre trimestral` --references--> `parseOcr()`  [INFERRED]
  docs/ARQUITECTURA.md → src/lib/ocr.ts
- `Tercera iteración: reconocimiento y cierre trimestral` --references--> `Cost`  [INFERRED]
  docs/ARQUITECTURA.md → src/lib/workspace-types.ts
- `main()` --calls--> `parseOcr()`  [EXTRACTED]
  scripts/check-ocr-photo.ts → src/lib/ocr.ts
- `main()` --calls--> `dec()`  [EXTRACTED]
  scripts/compare-ocr-samples.ts → src/lib/money.ts
- `main()` --calls--> `cents()`  [EXTRACTED]
  tests/ocr-review-integration.ts → src/lib/money.ts

## Import Cycles
- None detected.

## Communities (58 total, 19 thin omitted)

### Community 0 - "dec"
Cohesion: 0.15
Nodes (37): decimal.js, main(), allocateDocumentValue(), allocate(), audit(), inventoryOperation(), inventoryState(), DecimalMin() (+29 more)

### Community 1 - "20261018154635_initial/migration.sql"
Cohesion: 0.06
Nodes (69): "Account", Account_userId_idx, "Audit", Audit_companyId_createdAt_idx, "CatalogProduct", "Company", "Cost", Cost_requestKey_key (+61 more)

### Community 2 - "Tu primer trabajo, paso a paso"
Cohesion: 0.17
Nodes (12): Albarán y factura del mismo material, Cierre trimestral (menú «Trimestres», solo responsable), Crear un trabajo, Entender el resultado, Fotografiar una compra, Lectura de facturas (OCR), Preparar tu empresa, Preparar un presupuesto (+4 more)

### Community 3 - "Plan de continuidad del ERP · revisión del 25 de octubre de 2026"
Cohesion: 0.04
Nodes (45): 1. Situación y prioridades, 1. Verificar la navegación, 2. Completar el recorrido del albarán, 2. Entrega implementada y comprobada: control operativo del almacén, 3 bis. Ideas y mejoras recomendadas (propuestas, sin fecha), 3. Hoja de ruta ampliada, 3. Validar movimientos y costes, 4. Diseño de etiquetas y escaneo: siguientes pasos concretos (+37 more)

### Community 4 - "dashboard.tsx"
Cohesion: 0.16
Nodes (22): Dashboard(), docStatus, Empty(), euro(), Field, fmtDate(), InventoryWorkspace, kindLabel (+14 more)

### Community 5 - "dependencies"
Cohesion: 0.09
Nodes (22): dependencies, better-auth, bwip-js, class-variance-authority, clsx, decimal.js, lucide-react, next (+14 more)

### Community 7 - "workspace.tsx"
Cohesion: 0.08
Nodes (54): lucide-react, react, swr, Login(), CountForm(), euro(), Line, StockDocumentReview() (+46 more)

### Community 8 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 9 - "validation.ts"
Cohesion: 0.11
Nodes (17): date, documentQuantity, hours, id, line, margin, money, name (+9 more)

### Community 10 - "ref_node_fs"
Cohesion: 0.09
Nodes (21): @playwright/test, f, root, root, directories, root, directories, root (+13 more)

### Community 11 - "integration.ts"
Cohesion: 0.22
Nodes (12): contexts, db, files, image(), login(), main(), pdfFixture(), post() (+4 more)

### Community 12 - "Alcance y comprobaciones"
Cohesion: 0.13
Nodes (15): Acceso móvil por red local: puerto 3000, Albaranes provisionales y factura definitiva · 27/10/2026, Alcance y comprobaciones, Ampliación OCR con tres fotografías nuevas · 27/10/2026, revisión posterior, Continuación: recuentos y control diario del almacén, Entrega del 19 de octubre de 2026: OCR, proveedor y cierre trimestral, Factura fotografiada y alta contextual de proveedor · 25/10/2026, Implementado (+7 more)

### Community 13 - "access.ts"
Cohesion: 0.07
Nodes (57): zod, GET, POST, GET(), GET(), GET(), POST(), runtime (+49 more)

### Community 14 - "workspace-types.ts"
Cohesion: 0.17
Nodes (12): changeReceipts(), OcrSuggestion, receiptReconciliationLines(), Customer, Doc, Hours, Job, Metrics (+4 more)

### Community 15 - "inventory-integration.ts"
Cohesion: 0.17
Nodes (15): cleanup(), contexts, db, document(), files, inventory(), login(), main() (+7 more)

### Community 16 - "(workspace)/layout.tsx"
Cohesion: 0.50
Nodes (3): dynamic, WorkspaceLayout(), State

### Community 17 - "components.json"
Cohesion: 0.15
Nodes (12): aliases, components, ui, utils, rsc, $schema, style, tailwind (+4 more)

### Community 18 - "supplier-match.ts"
Cohesion: 0.27
Nodes (11): coverage(), distance(), GENERIC, idOf(), LEGAL, matchSupplier(), normalizeName(), SupplierCandidate (+3 more)

### Community 19 - "@prisma/client"
Cohesion: 0.16
Nodes (9): better-auth, @prisma/client, db, password, secret, db, cleanup(), db (+1 more)

### Community 20 - "Instala · arquitectura y primera fase"
Cohesion: 0.20
Nodes (10): Estructura, Fases posteriores, Flujo documental y contable, Instala · arquitectura y primera fase, Modelo de datos, Operación, Pantallas y recorrido, Segunda iteración: navegación y almacén (+2 more)

### Community 21 - "Instalación y operación"
Cohesion: 0.25
Nodes (8): Acceso desde móvil en la red, Alta de técnicos, Copias automáticas, Desarrollo en Windows, Instalación recomendada: mini PC Linux, Instalación y operación, Restauración, Seguridad y límites operativos

### Community 22 - "ocr-cells.ts"
Cohesion: 0.14
Nodes (24): main(), layoutRows(), layoutText(), layoutWords(), ocrCellCandidates(), OcrNumericCandidate, reconcileOcrCells(), reconcileOcrTable() (+16 more)

### Community 23 - "ref_node_assert"
Cohesion: 0.16
Nodes (9): sharp, f, root, decode(), f, root, Context, f (+1 more)

### Community 24 - "quarters-integration.ts"
Cohesion: 0.36
Nodes (6): db, files, login(), main(), post(), suffix

### Community 25 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, bootstrap, build, db:migrate, dev, start, test, test:integration (+4 more)

### Community 26 - "label-preview.tsx"
Cohesion: 0.42
Nodes (6): Label, LabelPreview(), PrinterProfile, printerProfiles(), printerSettings, settings

### Community 27 - "next"
Cohesion: 0.17
Nodes (5): config, next, metadata, viewport, NavigationStatus()

### Community 28 - "package.json"
Cohesion: 0.09
Nodes (21): name, private, version, bwip-js, class-variance-authority, clsx, prisma, qrcode (+13 more)

### Community 29 - "prepare-ocr.py"
Cohesion: 0.38
Nodes (4): main(), page_on_dark_background(), prepare_photo(), screen_score()

### Community 31 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @playwright/test, prisma, tailwindcss, @tailwindcss/postcss, tsx, @types/node, @types/qrcode (+3 more)

### Community 32 - "sonepar.ts"
Cohesion: 0.31
Nodes (8): downloadSoneparDocument(), SONEPAR_DOCUMENT_URL, SoneparConnectorError, SoneparDocumentContent, SoneparDocumentReference, soneparDocumentRequest(), SoneparTransport, ref

### Community 39 - "smoke-sonepar-images.mjs"
Cohesion: 0.22
Nodes (7): directories, errors, expected, fixture, images, results, root

### Community 41 - "Albaranes, material y etiquetas"
Cohesion: 0.25
Nodes (8): Albaranes, material y etiquetas, Cuando llega la factura, Documentos anteriores, Navegación, Preparar las pegatinas de tu rollo, Recibir un pedido, Recuento físico y faltantes, Saber qué queda

### Community 42 - "Pedidos, perfiles y preparación trimestral"
Cohesion: 0.33
Nodes (5): Estado de la instalación, Pedidos, perfiles y preparación trimestral, Pedidos y entregas, Perfiles de etiquetas, Trimestres y originales

### Community 43 - "Investigación del conector Sonepar"
Cohesion: 0.40
Nodes (4): Alternativa oficial y precio, Evidencia disponible · 26/10/2026, Investigación del conector Sonepar, Pendiente para conectar

### Community 45 - "smoke-ocr-review.mjs"
Cohesion: 0.40
Nodes (3): directories, fixture, root

### Community 46 - "Prueba de los documentos nuevos · 27/10/2026"
Cohesion: 0.50
Nodes (4): Cambios comprobados, Comparación de artículos, Evidencias reproducibles, Prueba de los documentos nuevos · 27/10/2026

### Community 48 - "Instala · gestión para instaladores"
Cohesion: 0.50
Nodes (4): Acceso remoto desde otro dispositivo, Arranque en Linux con Docker, Desarrollo local, Instala · gestión para instaladores

### Community 50 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, esbuild

## Knowledge Gaps
- **10 isolated node(s):** `prisma`, `react-dom`, `@tailwindcss/postcss`, `@types/node`, `@types/qrcode` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 353 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Instala · arquitectura y primera fase` connect `Instala · arquitectura y primera fase` to `README.md`?**
  _High betweenness centrality (0.186) - this node is a cross-community bridge._
- **What connects `prisma`, `react-dom`, `@tailwindcss/postcss` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dec` be split into smaller, more focused modules?**
  _Cohesion score 0.14540816326530612 - nodes in this community are weakly interconnected._
- **Why does `Tercera iteración: reconocimiento y cierre trimestral` connect `Instala · arquitectura y primera fase` to `dec`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Should `20261018154635_initial/migration.sql` be split into smaller, more focused modules?**
  _Cohesion score 0.05701592002961866 - nodes in this community are weakly interconnected._
- **Why does `parseOcr()` connect `dec` to `supplier-match.ts`, `Instala · arquitectura y primera fase`, `ocr-cells.ts`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Should `Plan de continuidad del ERP · revisión del 25 de octubre de 2026` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._