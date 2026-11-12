import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSoneparPrices, soneparImportReady } from "../src/lib/sonepar-prices";
const row = { supplierRef: "78283", precio_bruto: 0.39, precio_neto: 0.234, fuente: "busqueda" };
test("Lee precios sin perder referencias ni decimales", () => {
  assert.deepEqual(parseSoneparPrices(JSON.stringify([row])), [row]);
});
test("Rechaza JSON roto, duplicados, negativos, neto mayor, fuente desconocida y campos ausentes", () => {
  for (const input of ["{", "[]", JSON.stringify([row, row]), ...[
    { precio_neto: -1 }, { precio_neto: 2 }, { fuente: "otra" }, { supplierRef: "" },
    { precio_bruto: "0.39" }, { precio_neto: 0.123456 }, { precio_neto: null },
  ].map(change => JSON.stringify([{ ...row, ...change }]))]) assert.throws(() => parseSoneparPrices(input));
});
test("Espera al menos una hora incluso tras reiniciar", () => {
  const date = "2026-11-12T12:00:00Z", start = Date.parse(date);
  assert.equal(soneparImportReady(date, start + 3599999), false);
  assert.equal(soneparImportReady(date, start + 3600000), true);
  assert.throws(() => soneparImportReady("inválida"));
});
