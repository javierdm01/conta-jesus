import { test } from "node:test";
import assert from "node:assert/strict";
import {
  portion,
  stockGroupKey,
  quantityForUnit,
  lotIdentifier,
} from "../src/lib/inventory-math";
import { dec } from "../src/lib/money";
test("devoluciones parciales nunca revierten más céntimos que el movimiento original", () => {
  let value = dec("0.04");
  const amounts: string[] = [];
  for (let remaining = 6; remaining > 0; remaining--) {
    const amount = portion(value, "1", remaining, "0.04", "6");
    assert.ok(dec(amount).gte(0));
    value = value.minus(amount);
    assert.ok(value.gte(0));
    amounts.push(amount);
  }
  assert.equal(value.toString(), "0");
  assert.deepEqual(amounts, ["0.01", "0.01", "0.01", "0.01", "0.00", "0.00"]);
});
test("20 artículos idénticos comparten clave de agrupación, respetando unidad y precio", () => {
  const line = {
    reference: "ABC-20",
    description: "Magnetotérmico 16 A",
    unit: "ud",
    price: "5.00",
    discount: "0",
  };
  assert.equal(
    stockGroupKey(line),
    stockGroupKey({ ...line, reference: " abc-20 ", price: "5" }),
  );
  assert.notEqual(
    stockGroupKey(line),
    stockGroupKey({ ...line, unit: "pack" }),
  );
  assert.notEqual(stockGroupKey(line), stockGroupKey({ ...line, price: "6" }));
  assert.notEqual(
    stockGroupKey(line),
    stockGroupKey({ ...line, description: "Magnetotérmico 20 A" }),
  );
});
test("el último consumo absorbe el céntimo pendiente", () => {
  assert.equal(portion("1.00", 1, 3, "1.00", 3), "0.33");
  assert.equal(portion("0.67", 1, 2, "1.00", 3), "0.33");
  assert.equal(portion("0.34", 1, 1, "1.00", 3), "0.34");
  assert.equal(portion("0.01", 1, 2, "0.02", 3), "0.01");
});
test("no se confunden unidades con metros", () => {
  assert.throws(() => quantityForUnit("1.5", "ud"));
  assert.throws(() => quantityForUnit("0", "m"));
  assert.doesNotThrow(() => quantityForUnit("1.5", "m"));
  assert.doesNotThrow(() => quantityForUnit("20", "ud"));
});
test("un QR y un lector USB abren el mismo identificador sin seguir enlaces externos", () => {
  assert.equal(lotIdentifier("lt-aabbcc11223344"), "LT-AABBCC11223344");
  assert.equal(
    lotIdentifier("https://instala.local/inventario/LT-AABBCC11223344"),
    "LT-AABBCC11223344",
  );
  assert.equal(lotIdentifier("javascript:alert(1)"), null);
  assert.equal(
    lotIdentifier("https://externo.local/?q=LT-AABBCC11223344"),
    null,
  );
});
