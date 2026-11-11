import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOcr } from "../src/lib/ocr";

// Factura de Sonepar con dos albaranes: la columna de descuento viene vacía en casi todas las filas.
// Antes solo se leía la primera línea (la que sí lleva descuento) y el resto se perdía o se mezclaba.
test("filas sin descuento en una tabla con columna de descuento", () => {
  const s = parseOcr(readFileSync("tests/fixtures/sonepar-albaranes-sin-descuento.txt", "utf8"), [], "PURCHASE");
  assert.deepEqual(
    s.lines.map((l) => [l.reference, l.quantity, l.price, l.discount, (l as { model?: string }).model, l.brand]),
    [
      ["503454", "1.00", "47.1100", "25", "GARRAP", "MORA"],
      ["23662", "6.00", "4.3000", "0", "P-95", "NILED"],
      ["23660", "8.00", "3.5000", "0", "P-50", "NILED"],
      ["111222", "6.00", "5.2100", "0", "543503", "TELEVES"],
      ["47870", "6.00", "3.5500", "0", "5226", "TELEVES"],
    ],
  );
  assert.ok(!s.warnings.some((w) => w.startsWith("Importes sin conciliar")));
  assert.ok(!s.warnings.some((w) => w.includes("no suman la base")));
});
