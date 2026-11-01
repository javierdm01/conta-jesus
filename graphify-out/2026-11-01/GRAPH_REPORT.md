# Graph Report - g2  (2026-10-19)

## Corpus Check
- 86 files · ~47,184 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .toml 1, .prisma 1, .css 1)

## Summary
- 534 nodes · 1066 edges · 39 communities (25 shown, 14 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- inventory.ts
- 20261018154635_initial/migration.sql
- Tu primer trabajo, paso a paso
- Plan de continuidad del ERP · revisión del 18 de octubre de 2026
- dashboard.tsx
- quarters.ts
- Button
- workspace.tsx
- "StockMovement"
- validation.ts
- ref_node_path
- integration.ts
- document-review.tsx
- ref_node_fs
- workspace-types.ts
- inventory-integration.ts
- ref_next
- ref_lib
- supplier-match.ts
- ref_node_crypto
- Instala · arquitectura y primera fase
- Instalación y operación
- index.ts
- inventory-browser.mjs
- quarters-integration.ts
- quarters.tsx
- label-profiles.test.ts
- app/layout.tsx
- quarters/route.ts
- backup.sh
- purchase-orders/route.ts
- state/route.ts
- restore.sh

## God Nodes (most connected - your core abstractions)
1. `dec()` - 31 edges
2. `Button()` - 26 edges
3. `Dashboard()` - 21 edges
4. `cents()` - 20 edges
5. `Dialog()` - 17 edges
6. `sum()` - 17 edges
7. `"Company"` - 16 edges
8. `inventoryOperation()` - 16 edges
9. `AppError` - 15 edges
10. `"Job"` - 14 edges

## Surprising Connections (you probably didn't know these)
- `ocrImage()` --calls--> `parseOcr()`  [EXTRACTED]
  worker/index.ts → src/lib/ocr.ts
- `processNext()` --calls--> `parseOcr()`  [EXTRACTED]
  worker/index.ts → src/lib/ocr.ts
- `Cost_stockMovementId_key` --indexes--> `"Cost"`  [EXTRACTED]
  prisma/migrations/20261018170000_stock_lots/migration.sql → prisma/migrations/20261018154635_initial/migration.sql
- `"StockLot"` --references--> `"Company"`  [EXTRACTED]
  prisma/migrations/20261018170000_stock_lots/migration.sql → prisma/migrations/20261018154635_initial/migration.sql
- `"StockMovement"` --references--> `"Company"`  [EXTRACTED]
  prisma/migrations/20261018170000_stock_lots/migration.sql → prisma/migrations/20261018154635_initial/migration.sql

## Import Cycles
- None detected.

## Communities (39 total, 14 thin omitted)

### Community 0 - "inventory.ts"
Cohesion: 0.10
Nodes (47): db, accessibleJob(), Actor, admin(), AppError, checkOrigin(), currentUser(), auth (+39 more)

### Community 1 - "20261018154635_initial/migration.sql"
Cohesion: 0.08
Nodes (53): "Account", Account_userId_idx, "Audit", Audit_companyId_createdAt_idx, "CatalogProduct", "Company", "Cost", Cost_requestKey_key (+45 more)

### Community 2 - "Tu primer trabajo, paso a paso"
Cohesion: 0.06
Nodes (27): Albaranes, material y etiquetas, Cuando llega la factura, Documentos anteriores, Navegación, Preparar las pegatinas de tu rollo, Recibir un pedido, Recuento físico y faltantes, Saber qué queda (+19 more)

### Community 3 - "Plan de continuidad del ERP · revisión del 18 de octubre de 2026"
Cohesion: 0.07
Nodes (30): 1. Situación y prioridades, 1. Verificar la navegación, 2. Completar el recorrido del albarán, 2. Entrega implementada y comprobada: control operativo del almacén, 3. Hoja de ruta ampliada, 3. Validar movimientos y costes, 4. Diseño de etiquetas y escaneo: siguientes pasos concretos, 4. Verificar impresión en rollo (+22 more)

### Community 4 - "dashboard.tsx"
Cohesion: 0.13
Nodes (24): Dashboard(), docStatus, Empty(), euro(), Field, fmtDate(), InventoryWorkspace, kindLabel (+16 more)

### Community 5 - "quarters.ts"
Cohesion: 0.14
Nodes (19): lotIdentifier(), InventoryData, InventoryLot, Serialized, csvCell(), filterInventory(), inventoryCsv(), InventoryFilters (+11 more)

### Community 6 - "Button"
Cohesion: 0.17
Nodes (11): Label, LabelPreview(), Scanner(), start(), names, OrderForm(), PurchaseOrders(), today() (+3 more)

### Community 7 - "workspace.tsx"
Cohesion: 0.23
Nodes (16): CountForm(), CountForm, date(), EditLot(), euro(), Fact(), InventoryWorkspace(), MovementForm() (+8 more)

### Community 8 - ""StockMovement""
Cohesion: 0.18
Nodes (16): Cost_stockMovementId_key, "StockLot", StockLot_code_key, StockLot_companyId_createdAt_idx, StockLot_documentId_idx, "StockMovement", StockMovement_companyId_jobId_idx, StockMovement_lotId_createdAt_idx (+8 more)

### Community 9 - "validation.ts"
Cohesion: 0.11
Nodes (16): date, hours, id, line, margin, money, name, percent (+8 more)

### Community 10 - "ref_node_path"
Cohesion: 0.15
Nodes (7): f, root, root, f, root, directories, root

### Community 11 - "integration.ts"
Cohesion: 0.22
Nodes (12): contexts, db, files, image(), login(), main(), pdfFixture(), post() (+4 more)

### Community 12 - "document-review.tsx"
Cohesion: 0.19
Nodes (6): euro(), Line, StockDocumentReview(), date(), Health, SystemHealth()

### Community 13 - "ref_node_fs"
Cohesion: 0.23
Nodes (7): dynamic, dosDate(), dosTime(), safeName(), ZipEntry, zipStream(), generate()

### Community 14 - "workspace-types.ts"
Cohesion: 0.15
Nodes (12): OcrSuggestion, Cost, Customer, Doc, Hours, Job, Metrics, Quote (+4 more)

### Community 15 - "inventory-integration.ts"
Cohesion: 0.26
Nodes (11): cleanup(), contexts, db, document(), files, inventory(), login(), main() (+3 more)

### Community 18 - "supplier-match.ts"
Cohesion: 0.27
Nodes (11): coverage(), distance(), GENERIC, idOf(), LEGAL, matchSupplier(), normalizeName(), SupplierCandidate (+3 more)

### Community 19 - "ref_node_crypto"
Cohesion: 0.18
Nodes (5): db, password, secret, GET, POST

### Community 20 - "Instala · arquitectura y primera fase"
Cohesion: 0.22
Nodes (8): Estructura, Fases posteriores, Flujo documental y contable, Instala · arquitectura y primera fase, Modelo de datos, Operación, Pantallas y recorrido, Segunda iteración: navegación y almacén

### Community 21 - "Instalación y operación"
Cohesion: 0.22
Nodes (8): Acceso desde móvil en la red, Alta de técnicos, Copias automáticas, Desarrollo en Windows, Instalación recomendada: mini PC Linux, Instalación y operación, Restauración, Seguridad y límites operativos

### Community 22 - "index.ts"
Cohesion: 0.39
Nodes (6): db, heartbeat(), main(), ocrImage(), processNext(), run()

### Community 23 - "inventory-browser.mjs"
Cohesion: 0.22
Nodes (4): runtime, decode(), f, root

### Community 24 - "quarters-integration.ts"
Cohesion: 0.36
Nodes (6): db, files, login(), main(), post(), suffix

### Community 25 - "quarters.tsx"
Cohesion: 0.67
Nodes (5): Card(), euro(), fmt(), previous(), Quarters()

### Community 26 - "label-profiles.test.ts"
Cohesion: 0.47
Nodes (4): PrinterProfile, printerProfiles(), printerSettings, settings

## Knowledge Gaps
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dec()` connect `inventory.ts` to `quarters.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `inventory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09877085162423178 - nodes in this community are weakly interconnected._
- **Why does `Button()` connect `Button` to `quarters.tsx`, `dashboard.tsx`, `document-review.tsx`, `workspace.tsx`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Should `20261018154635_initial/migration.sql` be split into smaller, more focused modules?**
  _Cohesion score 0.07744107744107744 - nodes in this community are weakly interconnected._
- **Why does `Plan de continuidad del ERP · revisión del 18 de octubre de 2026` connect `Plan de continuidad del ERP · revisión del 18 de octubre de 2026` to `Tu primer trabajo, paso a paso`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Should `Tu primer trabajo, paso a paso` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `Plan de continuidad del ERP · revisión del 18 de octubre de 2026` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._