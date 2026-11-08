import test from "node:test";
import assert from "node:assert/strict";
import { EXPENSE_LABEL, splitVat } from "../src/lib/expenses";

test("separa base e IVA de un ticket con IVA incluido", () => {
  assert.deepEqual(splitVat("60.50", 21), { net: "50.00", tax: "10.50" });
  assert.deepEqual(splitVat("100.00", 21), { net: "82.64", tax: "17.36" });
  assert.deepEqual(splitVat("294.00", 0), { net: "294.00", tax: "0.00" });
  assert.deepEqual(splitVat("", 21), { net: "0.00", tax: "0.00" });
});
test("categorías de gasto", () => {
  assert.equal(EXPENSE_LABEL.AUTONOMO, "Cuota de autónomos");
  assert.equal(EXPENSE_LABEL.COMBUSTIBLE, "Gasolina");
});
