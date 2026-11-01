import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptReconciliationLines } from "../src/lib/receipt-reconciliation";
import type { Doc } from "../src/lib/workspace-types";
const receipt = (id: string, quantity: string): Doc => ({
  id,
  kind: "DELIVERY",
  status: "CONFIRMED",
  originalName: id,
  number: id,
  createdAt: "2026-10-27",
  stockLots: [
    {
      id: `lot-${id}`,
      code: id,
      description: "Cable",
      reference: "REF-1",
      unit: "m",
      received: quantity,
    },
  ],
});
const proposal = {
  reference: "REF-1",
  description: "Cable de factura",
  unit: "m",
  quantity: "5",
  price: "4",
  discount: "10",
  family: "Cableado",
};
test("una línea de factura agregada se reparte entre lotes sin multiplicar las cantidades", () => {
  const lines = receiptReconciliationLines(
    [receipt("A", "3"), receipt("B", "2")],
    [proposal],
  );
  assert.deepEqual(
    lines.map((l) => [l.quantity, l.price, l.receiptNumber]),
    [
      ["3", "4", "A"],
      ["2", "4", "B"],
    ],
  );
});
test("cantidades parciales o precios ambiguos quedan pendientes de asociación manual", () => {
  assert.equal(
    receiptReconciliationLines([receipt("A", "3")], [proposal])[0].price,
    "",
  );
  assert.ok(
    receiptReconciliationLines(
      [receipt("A", "3"), receipt("B", "2")],
      [proposal, { ...proposal, price: "8" }],
    ).every((l) => l.price === ""),
  );
  assert.equal(
    receiptReconciliationLines(
      [receipt("A", "5")],
      [{ ...proposal, unit: "rollo" }],
    )[0].price,
    "",
  );
});
test("los conceptos económicos no se asignan como precio físico de un lote", () => {
  assert.equal(
    receiptReconciliationLines(
      [receipt("A", "5")],
      [{ ...proposal, financial: true }],
    )[0].price,
    "",
  );
});
