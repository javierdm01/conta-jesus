import test from "node:test";
import assert from "node:assert/strict";
import { buildRows, refKey, toCsv, unitNet, type ExportItem, type ExportLine } from "../src/lib/catalog-export";

const item = (o: Partial<ExportItem>): ExportItem => ({ reference: "", supplierRef: "", description: "", brand: "", unit: "ud", supplier: "Sonepar", price: 0, ...o });
const line = (o: Partial<ExportLine>): ExportLine => ({ reference: "", description: "", quantity: 1, unit: "ud", price: null, discount: 0, net: null, documentId: "d1", kind: "PURCHASE", number: "F-1", date: new Date("2026-01-10"), supplier: "Sonepar", ...o });

test("el precio unitario es neto: importe de la línea entre unidades", () => {
  assert.equal(unitNet(line({ quantity: 75, price: 3.28, discount: 70, net: 73.8 })), 0.984);
  assert.equal(unitNet(line({ quantity: 2, price: 10, discount: 50, net: null })), 5);
});

test("asocia por referencia (con o sin ceros y signos) y por ref. de proveedor; el último precio es el más reciente", () => {
  assert.equal(refKey("075201-39"), refKey("75201 39"));
  const rows = buildRows(
    [item({ reference: "75201-39", supplierRef: "17606", description: "Mecanismo SIMON 75", price: 5.61 })],
    [
      line({ reference: "17606", price: 11.22, discount: 52, quantity: 4, net: 21.54, date: new Date("2026-03-01"), documentId: "viejo" }),
      line({ reference: "075201-39", price: 12, discount: 50, quantity: 2, net: 12, date: new Date("2026-09-02"), documentId: "nuevo" }),
      line({ reference: "17606", price: 11, discount: 50, quantity: 1, net: 5.5, kind: "CREDIT", date: new Date("2026-10-01"), documentId: "abono" }),
    ],
  );
  const r = rows[0];
  assert.equal(r.how, "referencia y ref. proveedor");
  assert.equal(r.last?.documentId, "nuevo"); // el abono, aunque sea más reciente, no fija precio
  assert.equal(r.price, 6);
  assert.equal(r.purchases, 2);
  assert.equal(r.documents.length, 3);
});

test("sin referencia asocia por descripción solo si es claramente el mejor; sin compras queda la tarifa", () => {
  const rows = buildRows(
    [
      item({ reference: "A1", description: "Terminal cobre T-10/10", price: 0.46 }),
      item({ reference: "A2", description: "Terminal cobre T-16/10", price: 0.7 }),
      item({ reference: "B1", description: "Cable manguera 3x1,5", price: 1.2 }),
    ],
    [line({ description: "TERMINAL DE COBRE TUBULAR T-10/10", price: 0.6, discount: 35, quantity: 100, net: 39 })],
  );
  assert.equal(rows[0].how, "descripción (revisar)");
  assert.equal(rows[0].price, 0.39);
  assert.equal(rows[1].documents.length, 0);
  assert.equal(rows[1].origin, "Tarifa del catálogo (sin compras)");
  assert.equal(rows[2].price, 1.2);
});

test("el CSV lleva enlace al documento, separador «;» y decimales con coma", () => {
  const rows = buildRows([item({ reference: "X1", description: "Cable; \"3x1,5\"", price: 1 })], [line({ reference: "X1", price: 2, quantity: 10, net: 20, documentId: "abc" })]);
  const csv = toCsv(rows, "http://localhost:3000");
  assert.ok(csv.startsWith("\uFEFFReferencia;"));
  assert.ok(csv.includes('"Cable; ""3x1,5"""'));
  assert.ok(csv.includes("http://localhost:3000/api/documents/abc?inline=1"));
  assert.ok(csv.includes(";2,00;Último precio pagado;"));
});
