import { test } from "node:test";
import assert from "node:assert/strict";
import { soneparStockPlan, soneparNumber } from "../src/lib/sonepar-import";
import type { SoneparDoc } from "../src/lib/sonepar";
const doc: SoneparDoc = { number: "F02000R-1", date: "2026-11-12", net: "10.10", tax: "2.12", total: "12.22", consistent: true,
  lines: [ { code: "00012", reference: "FAB-1", description: "Material", brand: "Marca", quantity: "2", price: "5", discount: "0", net: "10.00" },
    { code: "RAEE", reference: "", description: "COSTE RAEE", brand: "", quantity: "1", price: "0.1", discount: "0", net: "0.10" } ] };
const catalog = [{ supplierRef: "00012", reference: "FAB-1", brand: "Marca", unit: "ud" }];
test("Conserva ceros y excluye tasas de las entradas físicas", () => {
  const result = soneparStockPlan(doc, catalog);
  assert.deepEqual(result.problems, []);
  assert.equal(result.lines[0].supplierRef, "00012");
  assert.equal(result.lines[1].financial, true);
  assert.equal(soneparNumber("F02000R-1"), "F02000R1");
});
test("Unidades desconocidas o importes incoherentes bloquean la confirmación", () => {
  assert.ok(soneparStockPlan(doc, []).problems.some(message => message.includes("Unidad no verificada")));
  assert.ok(soneparStockPlan({ ...doc, net: "99" }, catalog).problems.some(message => message.includes("base")));
  const changed = structuredClone(doc); changed.lines[0].price = "6";
  assert.ok(soneparStockPlan(changed, catalog).problems.some(message => message.includes("no cuadran")));
});
test("No da entrada a cantidades negativas ni infiere unidades para cable", () => {
  const changed = structuredClone(doc); changed.lines[0].quantity = "-2";
  assert.ok(soneparStockPlan(changed, catalog).problems.some(message => message.includes("no positiva")));
});
test("Adapta precisión al esquema solo si conserva el importe exacto de la línea", () => {
  const compatible = structuredClone(doc); compatible.lines[0].price = "5.000001";
  assert.deepEqual(soneparStockPlan(compatible, catalog).problems, []);
  const incompatible = structuredClone(doc); incompatible.lines[0].quantity = "1000"; incompatible.lines[0].price = "0.123456"; incompatible.lines[0].net = "123.46"; incompatible.net = "123.56";
  assert.ok(soneparStockPlan(incompatible, catalog).problems.some(message => message.includes("Precisión")));
});
