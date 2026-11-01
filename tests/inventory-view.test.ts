import { test } from "node:test";
import assert from "node:assert/strict";
import type { InventoryLot } from "../src/lib/inventory-types";
import {
  csvCell,
  filterInventory,
  inventoryCsv,
  lowStock,
} from "../src/lib/inventory-view";
const lot: InventoryLot = {
  id: "lot-a",
  code: "LT-1234567890ABCD",
  description: "Cable; cobre",
  reference: "CAB-1",
  brand: "Marca",
  model: "Modelo",
  family: "Cable",
  unit: "m",
  received: "20",
  onHand: "10",
  reserved: "8",
  available: "2",
  location: "A1",
  notes: "",
  minimum: "3",
  createdAt: "2026-10-18T10:00:00.000Z",
  valued: true,
  totalValue: "100",
  remainingValue: "50",
  lastMovementId: "movement",
  document: {
    id: "doc",
    number: "ALB-1",
    date: "2026-10-18T00:00:00.000Z",
    supplier: { name: "Proveedor" },
  },
  invoice: null,
  reservations: [],
  movements: [],
  counts: [],
};
const filters = {
  search: "",
  status: "all",
  location: "",
  supplier: "",
  order: "newest",
};
test("mínimos usan material libre: reservas pueden exigir reposición aunque haya existencias", () => {
  assert.equal(lowStock(lot), true);
  assert.equal(lowStock({ ...lot, minimum: "0" }), false);
  assert.equal(filterInventory([lot], { ...filters, status: "low" }).length, 1);
  assert.equal(
    filterInventory([{ ...lot, available: "0" }], {
      ...filters,
      status: "free",
    }).length,
    0,
  );
});
test("filtros combinan proveedor, albarán, ubicación y código QR sin mezclar lotes", () => {
  const other = {
    ...lot,
    id: "lot-b",
    location: "",
    code: "LT-1234567890ABCE",
  };
  assert.deepEqual(
    filterInventory([other, lot], {
      ...filters,
      location: "A1",
      supplier: "Proveedor",
      receiptId: "doc",
    }).map((l) => l.id),
    [lot.id],
  );
  assert.deepEqual(
    filterInventory([other, lot], { ...filters, location: "__empty" }).map(
      (l) => l.id,
    ),
    [other.id],
  );
  assert.deepEqual(
    filterInventory([other, lot], {
      ...filters,
      search: `https://servidor/inventario/${lot.code}`,
    }).map((l) => l.id),
    [lot.id],
  );
  assert.equal(
    filterInventory([lot], { ...filters, supplier: "Otro proveedor" }).length,
    0,
  );
});
test("exportación conserva separadores y comillas, decimales españoles y ausencia de valores desconocidos", () => {
  const csv = inventoryCsv(
    [{ ...lot, description: 'Cable; "cobre"\nrojo', remainingValue: null }],
    true,
  );
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Cable; ""cobre""\nrojo"'));
  assert.ok(csv.includes('"Proveedor"'));
  assert.ok(
    inventoryCsv([{ ...lot, onHand: "1.25" }], true).includes('"1,25"'),
  );
  assert.ok(csv.endsWith(';""'));
});
test("CSV técnico no exporta valores o proveedor aunque se le pasen datos administrativos", () => {
  const csv = inventoryCsv([lot], false);
  assert.equal(csv.includes('"Proveedor"'), false);
  assert.equal(csv.includes('"Valor original EUR"'), false);
  assert.equal(csv.includes('"100"'), false);
});
test("CSV neutraliza fórmulas, incluso con espacios o saltos iniciales", () => {
  for (const text of [
    "=1+1",
    "  +SUM(A1)",
    "\t=1+1",
    "@SUM(A1)",
    "-1+1",
    "\n=1+1",
  ])
    assert.ok(csvCell(text).startsWith("\"'"));
  assert.equal(csvCell('Ref "A"'), '"Ref ""A"""');
});
