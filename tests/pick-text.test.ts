import test from "node:test";
import assert from "node:assert/strict";
import { fieldValue, pickRows } from "../src/lib/pick-text";

const w = (t: string, x: number, y: number) => ({ t, x, y, w: 0.05, h: 0.02, c: 90 });
test("agrupa por filas las palabras del recuadro y descarta las de fuera", () => {
  const words = [w("MINI", 0.1, 0.5), w("REPART", 0.17, 0.5), w("CABLE", 0.1, 0.55), w("fuera", 0.8, 0.5)];
  assert.deepEqual(pickRows(words, [0.05, 0.45, 0.4, 0.2]), ["MINI REPART", "CABLE"]);
});
test("normaliza números, fechas y referencias", () => {
  assert.equal(fieldValue("price", "15,710 €"), "15,710".replace(",", "."));
  assert.equal(fieldValue("net", "1.234,56"), "1234.56");
  assert.equal(fieldValue("net", "1,234.56"), "1234.56");
  assert.equal(fieldValue("quantity", "-1,00"), "-1.00");
  assert.equal(fieldValue("date", "22/10/26"), "2026-10-22");
  assert.equal(fieldValue("reference", "54 3603"), "543603");
  assert.equal(fieldValue("net", "abc"), "");
});
