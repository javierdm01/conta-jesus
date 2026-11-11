-- Consultas abiertas del asistente: un rol de solo lectura que únicamente ve las vistas del esquema «ai».
-- Cada vista filtra por la empresa y el usuario que consulta (ajustes de sesión app.company / app.admin / app.worker,
-- que fija la aplicación dentro de una transacción de solo lectura). Los técnicos solo ven lo suyo.
CREATE SCHEMA IF NOT EXISTS ai;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_reader') THEN
    CREATE ROLE ai_reader NOLOGIN;
  END IF;
  EXECUTE format('GRANT ai_reader TO %I', current_user);
END $$;

CREATE OR REPLACE VIEW ai.customers AS
SELECT c.id, c.name, c."taxId" AS tax_id, c.phone, c.email, c.address,
       CASE WHEN current_setting('app.admin', true) = '1' THEN c."hourlyRate" END AS hourly_rate
FROM "Customer" c
WHERE c."companyId" = current_setting('app.company', true)
  AND (current_setting('app.admin', true) = '1'
       OR EXISTS (SELECT 1 FROM "Job" j WHERE j."customerId" = c.id AND j."workerId" = current_setting('app.worker', true)));

CREATE OR REPLACE VIEW ai.jobs AS
SELECT j.id, j.number, j.name, c.name AS customer, j.status, j.service, j.address, w.name AS worker,
       j."plannedAt" AS planned_at, j."openedAt" AS opened_at, j."finishedAt" AS finished_at,
       (j."archivedAt" IS NOT NULL) AS archived
FROM "Job" j
JOIN "Customer" c ON c.id = j."customerId"
LEFT JOIN "Worker" w ON w.id = j."workerId"
WHERE j."companyId" = current_setting('app.company', true)
  AND (current_setting('app.admin', true) = '1' OR j."workerId" = current_setting('app.worker', true));

CREATE OR REPLACE VIEW ai.sales AS
SELECT s.id, s.number, c.name AS customer, j.name AS job, s.date, s."dueAt" AS due_at, s.net, s.tax, s.withholding, s.collected,
       (s.net + s.tax - s.withholding) AS total,
       (s.net + s.tax - s.withholding - s.collected) AS pending
FROM "Sale" s
JOIN "Job" j ON j.id = s."jobId"
JOIN "Customer" c ON c.id = j."customerId"
WHERE s."companyId" = current_setting('app.company', true) AND current_setting('app.admin', true) = '1';

CREATE OR REPLACE VIEW ai.quotes AS
SELECT q.id, q.number, q.name, c.name AS customer, j.name AS job, q.date, q.net, q.tax, (q.net + q.tax) AS total, q.approved
FROM "Quote" q
JOIN "Job" j ON j.id = q."jobId"
JOIN "Customer" c ON c.id = j."customerId"
WHERE q."companyId" = current_setting('app.company', true) AND current_setting('app.admin', true) = '1';

CREATE OR REPLACE VIEW ai.stock AS
SELECT l.id, COALESCE(NULLIF(l.alias, ''), l.description) AS name, l.reference, l.brand, l.unit,
       l."onHand" AS on_hand, l.minimum, l.location
FROM "StockLot" l
WHERE l."companyId" = current_setting('app.company', true) AND l."archivedAt" IS NULL;

CREATE OR REPLACE VIEW ai.hours AS
SELECT t.date, w.name AS worker, c.name AS customer, j.name AS job, t.hours, t.billable, t.activity,
       CASE WHEN current_setting('app.admin', true) = '1' THEN t."hourlyCost" END AS hourly_cost
FROM "TimeEntry" t
JOIN "Worker" w ON w.id = t."workerId"
JOIN "Job" j ON j.id = t."jobId"
JOIN "Customer" c ON c.id = j."customerId"
WHERE t."companyId" = current_setting('app.company', true)
  AND (current_setting('app.admin', true) = '1' OR t."workerId" = current_setting('app.worker', true));

CREATE OR REPLACE VIEW ai.suppliers AS
SELECT s.id, s.name, s.phone, s.email, s.contact
FROM "Supplier" s
WHERE s."companyId" = current_setting('app.company', true) AND current_setting('app.admin', true) = '1';

CREATE OR REPLACE VIEW ai.expenses AS
SELECT o.id, o.date, o.description, o.amount, o.tax, o.category
FROM "Overhead" o
WHERE o."companyId" = current_setting('app.company', true) AND current_setting('app.admin', true) = '1';

CREATE OR REPLACE VIEW ai.catalog AS
SELECT i.id, i.reference, i.description, i.brand, i.unit, i.price, i.supplier
FROM "CatalogItem" i
WHERE i."companyId" = current_setting('app.company', true) AND current_setting('app.admin', true) = '1';

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ai_reader;
GRANT USAGE ON SCHEMA ai TO ai_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA ai TO ai_reader;
