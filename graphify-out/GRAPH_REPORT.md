# Graph Report - PRUEBA CONTABILIDAD JESUS  (2026-11-09)

## Corpus Check
- 262 files · ~126,868 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 6, .example 1, .toml 1)

## Summary
- 1448 nodes · 3650 edges · 109 communities (85 shown, 24 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2abbc70a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dec
- 20261018154635_initial/migration.sql
- Tu primer trabajo, paso a paso
- Plan de continuidad del ERP · revisión del 25 de octubre de 2026
- dashboard.tsx
- dependencies
- quarters.ts
- workspace.tsx
- compilerOptions
- validation.ts
- ref_node_assert
- integration.ts
- Alcance y comprobaciones
- currentUser
- workspace-types.ts
- @playwright/test
- Button
- components.json
- supplier-match.ts
- invoice-detail.tsx
- Instala · arquitectura y primera fase
- Instalación y operación
- ocr-cells.ts
- sharp
- quarters-integration.ts
- scripts
- label-preview.tsx
- next
- package.json
- prepare-ocr.py
- backup.sh
- devDependencies
- connectors/sonepar.ts
- restore.sh
- purchase-orders.tsx
- docs-harness.ts
- README.md
- Albaranes, material y etiquetas
- Pedidos, perfiles y preparación trimestral
- Investigación del conector Sonepar
- backup-retry-env.sh
- AppError
- Prueba de los documentos nuevos · 27/10/2026
- Instala · gestión para instaladores
- analytics-home.tsx
- overrides
- get-ip.sh script
- voice.ts
- ocr-image.ts
- document-delete.ts
- document-review.tsx
- index.ts
- money.ts
- ocr-words.ts
- "StockMovement"
- invoice-attachments-browser.mjs
- ocr-evidence.ts
- ref_node_test
- tax-calendar.tsx
- expenses.tsx
- analytics/route.ts
- accounts/route.ts
- quote-builder.tsx
- access.ts
- "Document"
- "Sale"
- db.ts
- catalog-csv.ts
- evidence-boxes.ts
- 20261018230000_purchase_orders_and_health/migration.sql
- document-kind.ts
- voice-dialog.tsx
- voice-usage.tsx
- lib/sonepar.ts
- 3 bis. Ideas y mejoras recomendadas (propuestas, sin fecha)
- 3. Hoja de ruta ampliada
- 20261109100000_catalog_templates/migration.sql
- Artículos, alias y precio recomendado · 06/11/2026
- Trabajo actual y cómo terminarlo
- ocr-evidence.test.ts
- quarters.tsx
- 2. Entrega implementada y comprobada: control operativo del almacén
- job-archive-browser.mjs
- labels-fast-browser.mjs
- products-browser.mjs
- 6. Cierre de cada entrega y definición de terminado
- Revisión de continuidad tras los cambios del proyecto
- "Cost"
- 20261111100000_voice_log/migration.sql
- deploy.sh
- update.sh

## God Nodes (most connected - your core abstractions)
1. `dec()` - 85 edges
2. `Button()` - 58 edges
3. `currentUser()` - 52 edges
4. `cents()` - 51 edges
5. `AppError` - 50 edges
6. `Dashboard()` - 47 edges
7. `apiError()` - 47 edges
8. `sum()` - 39 edges
9. `admin()` - 38 edges
10. `Dialog()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Global Constraints` --references--> `AppError`  [INFERRED]
  docs/superpowers/plans/2026-11-01-revision-visual-ocr.md → src/lib/access.ts
- `Tercera iteración: reconocimiento y cierre trimestral` --references--> `parseOcr()`  [INFERRED]
  docs/ARQUITECTURA.md → src/lib/ocr.ts
- `Revisión visual de documentos, imagen tipo escáner y eliminación de subidas (1–2 de noviembre de 2026)` --references--> `uuid()`  [INFERRED]
  docs/VERIFICACION.md → src/lib/uuid.ts
- `Imagen tipo escáner` --references--> `page_on_dark_background()`  [INFERRED]
  docs/superpowers/specs/2026-11-01-revision-visual-ocr-design.md → scripts/prepare-ocr.py
- `Task 2: Emparejar valores con palabras (evidencia)` --references--> `number()`  [INFERRED]
  docs/superpowers/plans/2026-11-01-revision-visual-ocr.md → src/components/dashboard.tsx

## Import Cycles
- None detected.

## Communities (109 total, 24 thin omitted)

### Community 0 - "dec"
Cohesion: 0.15
Nodes (27): main(), allocateDocumentValue(), allocate(), audit(), inventoryOperation(), inventoryState(), DecimalMin(), portion() (+19 more)

### Community 1 - "20261018154635_initial/migration.sql"
Cohesion: 0.12
Nodes (32): "Account", Account_userId_idx, "Audit", Audit_companyId_createdAt_idx, "CatalogProduct", "Company", "Customer", "Equipment" (+24 more)

### Community 2 - "Tu primer trabajo, paso a paso"
Cohesion: 0.14
Nodes (14): Albarán y factura del mismo material, Cierre trimestral (menú «Trimestres», solo responsable), Crear un trabajo, Eliminar subidas, Entender el resultado, Fotografiar una compra, Lectura de facturas (OCR), Preparar tu empresa (+6 more)

### Community 3 - "Plan de continuidad del ERP · revisión del 25 de octubre de 2026"
Cohesion: 0.11
Nodes (19): 1. Situación y prioridades, 4. Diseño de etiquetas y escaneo: siguientes pasos concretos, 5. Reglas de datos que deben guiar todas las fases, Aclaración operativa · albarán provisional y factura definitiva, 27/10/2026, Actualización posterior · OCR con documentos reales del 27/10/2026, Analíticas de inicio · 08/11/2026, Artículos y búsqueda · 06/11/2026, Cierre OCR y proveedores del 25 de octubre (+11 more)

### Community 4 - "dashboard.tsx"
Cohesion: 0.08
Nodes (52): Task 9: Integrar el visor en la revisión, AnalyticsHome, BulkUpload, Catalog, ContactsHub, CreditReview, Dashboard(), docStatus (+44 more)

### Community 5 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, better-auth, bullmq, bwip-js, class-variance-authority, clsx, decimal.js, ioredis (+17 more)

### Community 6 - "quarters.ts"
Cohesion: 0.10
Nodes (33): dynamic, GET(), runtime, lotIdentifier(), InventoryData, InventoryLot, Serialized, csvCell() (+25 more)

### Community 7 - "workspace.tsx"
Cohesion: 0.24
Nodes (17): CountForm(), CountForm, date(), EditLot(), euro(), Fact(), InventoryWorkspace(), MovementForm() (+9 more)

### Community 8 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 9 - "validation.ts"
Cohesion: 0.11
Nodes (18): date, documentQuantity, expenseCategories, hours, id, line, margin, money (+10 more)

### Community 10 - "ref_node_assert"
Cohesion: 0.05
Nodes (39): password, secret, dirs, errors, f, root, f, root (+31 more)

### Community 11 - "integration.ts"
Cohesion: 0.22
Nodes (12): contexts, db, files, image(), login(), main(), pdfFixture(), post() (+4 more)

### Community 12 - "Alcance y comprobaciones"
Cohesion: 0.12
Nodes (16): Acceso móvil por red local: puerto 3000, Albaranes provisionales y factura definitiva · 27/10/2026, Alcance y comprobaciones, Ampliación OCR con tres fotografías nuevas · 27/10/2026, revisión posterior, Continuación: recuentos y control diario del almacén, Entrega del 19 de octubre de 2026: OCR, proveedor y cierre trimestral, Factura fotografiada y alta contextual de proveedor · 25/10/2026, Implementado (+8 more)

### Community 13 - "currentUser"
Cohesion: 0.12
Nodes (28): GET(), POST(), runtime, dynamic, GET(), POST(), dynamic, GET() (+20 more)

### Community 14 - "workspace-types.ts"
Cohesion: 0.13
Nodes (20): react, dynamic, WorkspaceLayout(), eur(), inv(), InvLine, InvoicePage(), net() (+12 more)

### Community 15 - "@playwright/test"
Cohesion: 0.09
Nodes (25): better-auth, @playwright/test, @prisma/client, db, db, db, cleanup(), contexts (+17 more)

### Community 16 - "Button"
Cohesion: 0.12
Nodes (25): lucide-react, Login(), BulkUpload(), Item, Catalog(), eur(), fetcher(), Item (+17 more)

### Community 17 - "components.json"
Cohesion: 0.15
Nodes (12): aliases, components, ui, utils, rsc, $schema, style, tailwind (+4 more)

### Community 18 - "supplier-match.ts"
Cohesion: 0.27
Nodes (11): coverage(), distance(), GENERIC, idOf(), LEGAL, matchSupplier(), normalizeName(), SupplierCandidate (+3 more)

### Community 19 - "invoice-detail.tsx"
Cohesion: 0.16
Nodes (28): Card(), eur(), eur2(), HomeWidgets(), initials(), MONTHS, Ranking(), Attachment (+20 more)

### Community 20 - "Instala · arquitectura y primera fase"
Cohesion: 0.20
Nodes (10): Estructura, Fases posteriores, Flujo documental y contable, Instala · arquitectura y primera fase, Modelo de datos, Operación, Pantallas y recorrido, Páginas escaneadas y coordenadas (revisión visual) (+2 more)

### Community 21 - "Instalación y operación"
Cohesion: 0.25
Nodes (8): Acceso desde móvil en la red, Alta de técnicos y usuarios, Copias automáticas, Desarrollo en Windows, Instalación recomendada: mini PC Linux, Instalación y operación, Restauración, Seguridad y límites operativos

### Community 22 - "ocr-cells.ts"
Cohesion: 0.31
Nodes (11): ocrCellCandidates(), OcrNumericCandidate, reconcileOcrCells(), reconcileOcrTable(), norm(), readTableCells(), Run, Box (+3 more)

### Community 23 - "sharp"
Cohesion: 0.18
Nodes (8): sharp, f, root, decode(), f, root, f, root

### Community 24 - "quarters-integration.ts"
Cohesion: 0.36
Nodes (6): db, files, login(), main(), post(), suffix

### Community 25 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, bootstrap, build, db:migrate, dev, reset-password, start, test (+9 more)

### Community 26 - "label-preview.tsx"
Cohesion: 0.42
Nodes (6): Label, LabelPreview(), PrinterProfile, printerProfiles(), printerSettings, settings

### Community 27 - "next"
Cohesion: 0.12
Nodes (6): config, next, metadata, viewport, Tile, Tile

### Community 28 - "package.json"
Cohesion: 0.08
Nodes (24): name, private, version, class-variance-authority, clsx, ioredis, pdfkit, prisma (+16 more)

### Community 29 - "prepare-ocr.py"
Cohesion: 0.06
Nodes (27): Task 4: Imagen tipo escáner (OpenCV), API, Datos, Decisiones tomadas, Eliminar subidas, Evidencia (recuadros), Hoja de ruta, Imagen tipo escáner (+19 more)

### Community 30 - "backup.sh"
Cohesion: 0.83
Nodes (3): backup_once(), prune_old(), backup.sh script

### Community 31 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, @playwright/test, prisma, tailwindcss, @tailwindcss/postcss, tsx, @types/node, @types/pdfkit (+4 more)

### Community 32 - "connectors/sonepar.ts"
Cohesion: 0.31
Nodes (7): downloadSoneparDocument(), SONEPAR_DOCUMENT_URL, SoneparConnectorError, SoneparDocumentContent, SoneparDocumentReference, soneparDocumentRequest(), SoneparTransport

### Community 35 - "purchase-orders.tsx"
Cohesion: 0.26
Nodes (10): Loading(), names, OrderForm(), PurchaseOrders(), today(), AppSkeleton(), Bar(), ListSkeleton() (+2 more)

### Community 39 - "docs-harness.ts"
Cohesion: 0.17
Nodes (26): cleanup(), companies, company(), contexts, db, docDir(), files, image() (+18 more)

### Community 40 - "README.md"
Cohesion: 0.17
Nodes (6): 1. Copiar el proyecto (desde Windows), 2. Desplegar, 3. Operación, 4. Llevar los datos actuales (opcional), Despliegue en el servidor, Clientes · 07/11/2026

### Community 41 - "Albaranes, material y etiquetas"
Cohesion: 0.25
Nodes (8): Albaranes, material y etiquetas, Cuando llega la factura, Documentos anteriores, Navegación, Preparar las pegatinas de tu rollo, Recibir un pedido, Recuento físico y faltantes, Saber qué queda

### Community 42 - "Pedidos, perfiles y preparación trimestral"
Cohesion: 0.33
Nodes (5): Estado de la instalación, Pedidos, perfiles y preparación trimestral, Pedidos y entregas, Perfiles de etiquetas, Trimestres y originales

### Community 43 - "Investigación del conector Sonepar"
Cohesion: 0.40
Nodes (4): Alternativa oficial y precio, Evidencia disponible · 26/10/2026, Investigación del conector Sonepar, Pendiente para conectar

### Community 45 - "AppError"
Cohesion: 0.14
Nodes (20): GET(), GET(), GET(), day(), eur(), GET(), runtime, admin() (+12 more)

### Community 46 - "Prueba de los documentos nuevos · 27/10/2026"
Cohesion: 0.50
Nodes (4): Cambios comprobados, Comparación de artículos, Evidencias reproducibles, Prueba de los documentos nuevos · 27/10/2026

### Community 48 - "Instala · gestión para instaladores"
Cohesion: 0.40
Nodes (5): Acceso remoto desde otro dispositivo, Arranque en Linux con Docker, Desarrollo local, Instala · gestión para instaladores, Servidor de producción

### Community 49 - "analytics-home.tsx"
Cohesion: 0.15
Nodes (15): recharts, AnalyticsHome(), Data, date(), euro(), options, Stat(), Detail (+7 more)

### Community 50 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, esbuild

### Community 58 - "voice.ts"
Cohesion: 0.13
Nodes (24): askModel(), costOf(), interpret(), iso(), cap(), CATEGORY, DAYS, hhmm() (+16 more)

### Community 59 - "ocr-image.ts"
Cohesion: 0.17
Nodes (17): main(), layoutRows(), layoutText(), norm(), readFiscalBox(), Run, fillEmptyCells(), norm() (+9 more)

### Community 60 - "document-delete.ts"
Cohesion: 0.16
Nodes (19): Task 6: API de páginas, Task 7: Eliminar subidas (servidor), dynamic, GET(), dynamic, GET(), GET(), accessibleJob() (+11 more)

### Community 61 - "document-review.tsx"
Cohesion: 0.17
Nodes (18): swr, CreditReview(), eur(), fetcher(), Linkable, euro(), Line, StockDocumentReview() (+10 more)

### Community 62 - "index.ts"
Cohesion: 0.16
Nodes (19): bullmq, redisConnection(), wakeOcr(), FAILED_KEEP_DAYS, failedDir(), keepFailed(), pruneFailed(), db (+11 more)

### Community 63 - "money.ts"
Cohesion: 0.20
Nodes (16): decimal.js, zod, Actor, quantityForUnit(), quotePrice(), audit(), belongs(), operate() (+8 more)

### Community 64 - "ocr-words.ts"
Cohesion: 0.16
Nodes (16): Global Constraints, Review Focus, Revisión visual de documentos · Plan de implementación (fase 1), Task 10: Diseño para tablet pequeña en horizontal, Task 11: Botones de eliminar en la bandeja, Task 12: No regresión del OCR, documentación y cierre, Task 1: Palabras normalizadas (TSV de Tesseract y bbox de pdftotext), Task 3: Lista de recuadros para el visor (+8 more)

### Community 65 - ""StockMovement""
Cohesion: 0.20
Nodes (15): "StockLot", StockLot_code_key, StockLot_companyId_createdAt_idx, StockLot_documentId_idx, "StockMovement", StockMovement_companyId_jobId_idx, StockMovement_lotId_createdAt_idx, StockMovement_requestKey_key (+7 more)

### Community 66 - "invoice-attachments-browser.mjs"
Cohesion: 0.12
Nodes (14): h(), Hours(), ds, errors, f, root, dirs, errors (+6 more)

### Community 67 - "ocr-evidence.ts"
Cohesion: 0.23
Nodes (16): alnum(), amount(), buildEvidence(), choose(), cy(), header(), LABEL, LineEv (+8 more)

### Community 68 - "ref_node_test"
Cohesion: 0.24
Nodes (9): documentLineNet(), lineNet(), leadingReference(), numeric(), OcrSuggestion, parseOcr(), unitOf(), receiptReconciliationLines() (+1 more)

### Community 69 - "tax-calendar.tsx"
Cohesion: 0.28
Nodes (13): fmt(), TaxCalendar(), tone(), when(), Deadline, iso(), MONTHS, nextBusinessDay() (+5 more)

### Community 70 - "expenses.tsx"
Cohesion: 0.25
Nodes (12): euro(), ExpenseForm(), Expenses(), fmt(), ICONS, Overhead, post(), quarterOf() (+4 more)

### Community 71 - "analytics/route.ts"
Cohesion: 0.28
Nodes (10): dynamic, GET(), analyticsRange(), Cost, Expense, Hours, madridMidnight(), PeriodKey (+2 more)

### Community 72 - "accounts/route.ts"
Cohesion: 0.32
Nodes (9): GET(), AcctDoc, AcctLine, buildAccounts(), iso(), num(), r2(), supplierDocs() (+1 more)

### Community 73 - "quote-builder.tsx"
Cohesion: 0.35
Nodes (11): eur(), Line, LinesEditor(), linesNet(), lineTotal(), newLine(), CatalogPicker(), eur() (+3 more)

### Community 74 - "access.ts"
Cohesion: 0.29
Nodes (7): GET, POST, appOrigins(), isAppOrigin(), OriginEnvironment, auth, env

### Community 75 - ""Document""
Cohesion: 0.20
Nodes (9): "Document", Document_companyId_hash_key, Document_companyId_kind_supplierId_number_key, Document_status_availableAt_idx, Document_supersedesId_key, "Overhead", "DocumentPage", DocumentPage_documentId_page_key (+1 more)

### Community 76 - ""Sale""
Cohesion: 0.24
Nodes (9): "Sale", Sale_companyId_number_key, Sale_documentId_key, Sale_requestKey_key, "SaleLine", SaleLine_lotId_idx, SaleLine_saleId_idx, "SaleAttachment" (+1 more)

### Community 77 - "db.ts"
Cohesion: 0.22
Nodes (7): bwip-js, qrcode, dynamic, dynamic, LabelsPage(), db, globalDb

### Community 78 - "catalog-csv.ts"
Cohesion: 0.29
Nodes (7): CatalogRow, HEADERS, parseCatalogCsv(), parsePrice(), splitLine(), Product, sample

### Community 79 - "evidence-boxes.ts"
Cohesion: 0.27
Nodes (7): Task 8: Visor con recuadros, FIELD_COLOR, FIELD_LABEL, FieldKind, ViewerBox, Box, Ev

### Community 80 - "20261018230000_purchase_orders_and_health/migration.sql"
Cohesion: 0.33
Nodes (9): "DocumentLine", DocumentLine_orderLineId_idx, "PurchaseOrder", PurchaseOrder_companyId_createdAt_idx, PurchaseOrder_companyId_number_key, PurchaseOrder_requestKey_key, "PurchaseOrderLine", PurchaseOrderLine_orderId_idx (+1 more)

### Community 81 - "document-kind.ts"
Cohesion: 0.39
Nodes (6): db, main(), detectKind(), documentRefs(), header(), unique()

### Community 82 - "voice-dialog.tsx"
Cohesion: 0.29
Nodes (7): LABEL, Line, Phase, plain(), Reply, VoiceDialog(), Proposal

### Community 83 - "voice-usage.tsx"
Cohesion: 0.32
Nodes (7): Data, fetcher(), KIND, Row, Sum, usd(), VoiceUsage()

### Community 84 - "lib/sonepar.ts"
Cohesion: 0.46
Nodes (6): money(), num(), parseSoneparPdf(), SoneparDoc, SoneparLine, soneparLines()

### Community 85 - "3 bis. Ideas y mejoras recomendadas (propuestas, sin fecha)"
Cohesion: 0.29
Nodes (7): 3 bis. Ideas y mejoras recomendadas (propuestas, sin fecha), Calidad y mantenimiento, Contabilidad y cierre de trimestre, Integraciones (solo con API oficial o importación autorizada), OCR y documentos, Seguridad y operación, Uso diario

### Community 86 - "3. Hoja de ruta ampliada"
Cohesion: 0.29
Nodes (7): 3. Hoja de ruta ampliada, Fase de almacén y reposición, Fase de fiabilidad, seguridad y operación, Fase de trabajo en campo, Fase económica y comercial, Fase opcional de automatización, Fase siguiente: documentos y compras

### Community 87 - "20261109100000_catalog_templates/migration.sql"
Cohesion: 0.38
Nodes (5): "CatalogItem", CatalogItem_companyId_reference_idx, "InvoiceTemplate", InvoiceTemplate_companyId_idx, CatalogItem_companyId_supplier_supplierRef_idx

### Community 88 - "Artículos, alias y precio recomendado · 06/11/2026"
Cohesion: 0.33
Nodes (5): Alias, Artículos, alias y precio recomendado · 06/11/2026, Buscar y filtrar, Facturas de cliente, Precio recomendado

### Community 89 - "Trabajo actual y cómo terminarlo"
Cohesion: 0.33
Nodes (6): 1. Verificar la navegación, 2. Completar el recorrido del albarán, 3. Validar movimientos y costes, 4. Verificar impresión en rollo, 5. Presentación, regresiones y entrega, Trabajo actual y cómo terminarlo

### Community 90 - "ocr-evidence.test.ts"
Cohesion: 0.33
Nodes (4): Task 2: Emparejar valores con palabras (evidencia), Word, page1, suggestion

### Community 91 - "quarters.tsx"
Cohesion: 0.67
Nodes (5): Card(), euro(), fmt(), previous(), Quarters()

### Community 92 - "2. Entrega implementada y comprobada: control operativo del almacén"
Cohesion: 0.40
Nodes (5): 2. Entrega implementada y comprobada: control operativo del almacén, A. Recuentos físicos con trazabilidad, B. Encontrar y revisar material, C. Exportación útil, D. Verificación y puesta en marcha

### Community 93 - "job-archive-browser.mjs"
Cohesion: 0.40
Nodes (4): dirs, errors, f, root

### Community 94 - "labels-fast-browser.mjs"
Cohesion: 0.40
Nodes (4): dirs, errors, f, root

### Community 95 - "products-browser.mjs"
Cohesion: 0.40
Nodes (4): dirs, errors, f, root

### Community 96 - "6. Cierre de cada entrega y definición de terminado"
Cohesion: 0.67
Nodes (3): 6. Cierre de cada entrega y definición de terminado, Entrega del 19 de octubre de 2026: OCR, proveedor y cierre trimestral, Resultado de esta continuación

### Community 97 - "Revisión de continuidad tras los cambios del proyecto"
Cohesion: 0.67
Nodes (3): Cierre de la revisión, Nuevas mejoras recomendadas a partir de la revisión, Revisión de continuidad tras los cambios del proyecto

### Community 98 - ""Cost""
Cohesion: 0.67
Nodes (3): "Cost", Cost_requestKey_key, Cost_stockMovementId_key

## Knowledge Gaps
- **12 isolated node(s):** `ioredis`, `prisma`, `react-dom`, `@tailwindcss/postcss`, `@types/node` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 559 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `uuid()` connect `workspace.tsx` to `purchase-orders.tsx`, `dashboard.tsx`, `Alcance y comprobaciones`, `label-preview.tsx`, `document-review.tsx`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **What connects `ioredis`, `prisma`, `react-dom` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dec` be split into smaller, more focused modules?**
  _Cohesion score 0.146218487394958 - nodes in this community are weakly interconnected._
- **Why does `Alcance y comprobaciones` connect `Alcance y comprobaciones` to `README.md`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Should `20261018154635_initial/migration.sql` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Why does `Revisión visual de documentos, imagen tipo escáner y eliminación de subidas (1–2 de noviembre de 2026)` connect `Alcance y comprobaciones` to `workspace.tsx`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Should `Tu primer trabajo, paso a paso` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._