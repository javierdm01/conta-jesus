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

test("una referencia mal asignada en la factura no arrastra la línea de otro artículo", () => {
  // En la factura, las referencias de proveedor de cuatro filas estaban desplazadas una fila: «543503» quedó en la línea del conector.
  const rows = buildRows(
    [item({ reference: "543503", supplierRef: "111222", description: "Mini repartidor 5 2400MHz Easyf 2D 4,3/4dB", price: 0 })],
    [
      line({ reference: "543503", description: "CONECT.-P- 35-150/6-50", quantity: 8, price: 3.5, net: 28 }),
      line({ reference: "5226", description: "MINI-REPART 5 2400MHZ EASYF 2D 4,3/4DB", quantity: 6, price: 5.21, net: 31.26 }),
    ],
  );
  assert.equal(rows[0].how, "descripción (revisar)");
  assert.equal(rows[0].last?.quantity, 6);
  assert.equal(rows[0].price, 5.21);
  assert.ok(rows[0].notes.some((n) => n.includes("referencia mal asignada")));
});

test("coinciden código de proveedor y de fabricante: vale aunque la descripción use otras palabras", () => {
  const rows = buildRows(
    [item({ reference: "75251-39", supplierRef: "17613", description: "Mecanismo de cruce SIMON 75", price: 11.92 })],
    [line({ reference: "17613", altRefs: ["75251-39"], description: "CRUZAMIENTO 10 AX 250V~ CON SISTEMA DE EMBORNAMIENTO", quantity: 7, price: 23.84, discount: 52, net: 80.1 })],
  );
  assert.equal(rows[0].how, "referencia y ref. proveedor");
  assert.equal(rows[0].purchases, 1);
});
test("las referencias releídas de la fila mandan sobre la guardada (que puede estar en la fila de al lado)", () => {
  const rows = buildRows(
    [item({ reference: "543503", supplierRef: "111222", description: "Mini repartidor 5 2400MHz Easyf 2D 4,3/4dB" })],
    [line({ reference: "111222", altRefs: ["543503"], description: "MINI-REPART 5 2400MHZ EASYF 2D 4,3/4DB", quantity: 6, price: 5.21, net: 31.26 })],
  );
  assert.equal(rows[0].price, 5.21);
});

import { soneparSearchUrl, variation } from "../src/lib/catalog-links";
import { parseSoneparJson } from "../src/lib/catalog-sonepar";
test("precio actual de Sonepar: variación sobre lo pagado y enlace de búsqueda por referencia", () => {
  assert.equal(variation(2.41, 2.6), 7.9);
  assert.equal(variation(2.41, 2.0), -17);
  assert.equal(variation(0, 2), null);
  assert.equal(variation(2, null), null);
  assert.equal(soneparSearchUrl({ supplier: "Sonepar", supplierRef: "29267", reference: "82010-30" }), "https://sonepar.es/catalog/es-es/search/29267");
  assert.equal(soneparSearchUrl({ supplier: "Sonepar", supplierRef: "", reference: "GENC1S23109NGP" }), "https://sonepar.es/catalog/es-es/search/GENC1S23109NGP");
  assert.equal(soneparSearchUrl({ supplier: "Otro", supplierRef: "1", reference: "2" }), "");
});
test("el JSON de Sonepar aporta el precio actual (último mostrado: neto por unidad) con su fecha", () => {
  const json = JSON.stringify({
    fecha_extraccion: "2026-11-07",
    productos: [
      { nombre: "SIMON-Tecla 82", referencia_sonepar: "29267", referencia_fabricante: "82010-30", precios_mostrados: ["4,81 €", "2,41 €", "2,41 €"], unidad_precio: "por Unid." },
      { nombre: "SIMON-Sin precio", referencia_sonepar: "1", referencia_fabricante: "X", precios_mostrados: [] },
    ],
  });
  const r = parseSoneparJson(json);
  assert.equal(r.items[0].currentPrice, "2.41");
  assert.equal(r.items[0].currentPriceAt, "2026-11-07");
  assert.equal(r.items[1].currentPrice, undefined);
});
