// Solo contra un schema de pruebas vacío, nunca contra producción.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "../src/lib/db";

async function main() {
  if (!process.env.DATABASE_URL?.includes("schema=sonepar_automation_test")) throw Error("Requiere schema de pruebas");
  const directory = await mkdtemp(path.join(tmpdir(), "sonepar-test-"));
  process.env.SONEPAR_EXCHANGE_DIR = directory;
  const { cycle } = await import("../scripts/sonepar-automation");
  const company = await db.company.create({ data: { name: "Prueba Sonepar" } });
  process.env.SONEPAR_COMPANY_ID = company.id;
  const item = await db.catalogItem.create({ data: { companyId: company.id, reference: "J213609", supplierRef: "92813",
    description: "Fusible", brand: "FERRAZ SHAWMUT", supplier: "Sonepar", price: 7 } });
  const file = (name: string) => path.join(directory, name);
  await cycle();
  const catalog = JSON.parse(await readFile(file("catalago_sonepar.json"), "utf8"));
  assert.deepEqual(catalog, [{ reference: "J213609", supplierRef: "92813", description: "Fusible", brand: "FERRAZ SHAWMUT", supplier: "Sonepar" }]);
  const prices = [{ supplierRef: "92813", precio_bruto: 4.68, precio_neto: 2.34, fuente: "ya_comprado" }];
  await writeFile(file("precios_sonepar.json"), JSON.stringify(prices));
  await cycle();
  assert.equal((await db.catalogItem.findUniqueOrThrow({ where: { id: item.id } })).currentPrice, null);
  const state = JSON.parse(await readFile(file("estado.json"), "utf8"));
  await writeFile(file("estado.json"), JSON.stringify({ ...state, exportedAt: new Date(Date.now() - 3600001).toISOString() }));
  // Una referencia válida seguida de otra inexistente debe revertir todo.
  await writeFile(file("precios_sonepar.json"), JSON.stringify([...prices, { ...prices[0], supplierRef: "NO-EXISTE" }]));
  await assert.rejects(cycle, /Referencia no exportada/);
  assert.equal((await db.catalogItem.findUniqueOrThrow({ where: { id: item.id } })).currentPrice, null);
  await writeFile(file("precios_sonepar.json"), JSON.stringify(prices));
  await cycle();
  const result = await db.catalogItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(Number(result.price), 7);
  assert.equal(Number(result.currentPrice), 2.34);
  assert.equal(Number(result.supplierGrossPrice), 4.68);
  assert.equal(result.supplierPriceSource, "ya_comprado");
  await assert.rejects(access(file("precios_sonepar.json")));
  assert.equal(await db.syncTask.count({ where: { companyId: company.id } }), 1);
  await writeFile(file("precios_sonepar.json"), JSON.stringify(prices));
  await cycle();
  assert.equal(await db.syncTask.count({ where: { companyId: company.id } }), 1);
  console.log("OK: exportación, espera, rollback, importación, archivado e idempotencia");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
