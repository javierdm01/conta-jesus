import test from "node:test";
import assert from "node:assert/strict";
import { validateSql } from "../src/lib/ai-sql";

const ok = (s: string) => assert.equal(validateSql(s).ok, true, s);
const bad = (s: string) => assert.equal(validateSql(s).ok, false, s);

test("acepta consultas de lectura sobre las vistas ai", () => {
  ok("SELECT name, phone FROM ai.customers ORDER BY name");
  ok("select count(*) as n from ai.jobs where status = 'En proceso'");
  ok("SELECT customer, sum(pending) AS total FROM ai.sales WHERE pending > 0 GROUP BY customer ORDER BY total DESC;");
  ok("WITH x AS (SELECT * FROM ai.stock) SELECT name FROM x WHERE on_hand <= minimum");
  ok("SELECT j.name, c.phone FROM ai.jobs j JOIN ai.customers c ON c.name = j.customer WHERE j.name ILIKE '%baño%'");
  ok("SELECT hours::numeric FROM ai.hours WHERE date >= date_trunc('month', now())");
});

test("rechaza todo lo que no sea una consulta de lectura", () => {
  bad("DELETE FROM ai.customers");
  bad("SELECT 1; DROP TABLE x");
  bad("SELECT * FROM ai.customers -- comentario");
  bad("SELECT * FROM \"Customer\"");
  bad("SELECT * FROM public.\"User\"");
  bad("SELECT * FROM ai.customers, \"User\"");
  bad("SELECT * FROM pg_catalog.pg_tables");
  bad("SELECT set_config('app.company', 'otra', true)");
  bad("SELECT current_setting('app.company')");
  bad("SELECT pg_sleep(10)");
  bad("SELECT * INTO nueva FROM ai.customers");
  bad("SELECT name FROM ai.customers FOR UPDATE");
  bad("SELECT * FROM ai.customers WHERE name = 'a'; SELECT 1");
  bad("SET ROLE postgres");
  bad("SELECT 'x'::regclass");
  bad("SELECT * FROM ai.passwords");
  bad("SELECT * FROM information_schema.tables");
});

test("el texto entre comillas no dispara falsos positivos", () => {
  ok("SELECT name FROM ai.customers WHERE name ILIKE '%delete%'");
});
