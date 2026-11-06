import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvidence } from "../src/lib/ocr-evidence";
import type { Word } from "../src/lib/ocr-words";

const row = (y: number, ...cells: [string, number][]): Word[] =>
  cells.map(([t, x]) => ({ t, x, y, w: 0.06, h: 0.02, c: 95 }));
const page1: Word[] = [
  ...row(0.05, ["Factura", 0.05], ["Nº", 0.12], ["F-001", 0.18]),
  ...row(0.1, ["Fecha", 0.05], ["18/10/2026", 0.12]),
  ...row(0.3, ["Cable", 0.05], ["3x2,5", 0.12], ["2", 0.5], ["15,50", 0.6], ["31,00", 0.8]),
  ...row(0.8, ["Base", 0.5], ["imponible", 0.56], ["31,00", 0.8]),
  ...row(0.84, ["IVA", 0.5], ["21%", 0.56], ["6,51", 0.8]),
];
const suggestion = {
  number: "F-001",
  date: "2026-10-18",
  net: "31.00",
  tax: "6.51",
  total: "37.51",
  lines: [
    { description: "Cable 3x2,5", reference: "", quantity: "2", unit: "ud", price: "15.50", discount: "0", family: "" },
  ],
};

test("número y fecha se localizan sin aproximación", () => {
  const e = buildEvidence(suggestion, [{ page: 1, words: page1 }]);
  assert.deepEqual(e.number?.box.slice(0, 2), [0.18, 0.05]);
  assert.equal(e.number?.approx, false);
  assert.equal(e.date?.page, 1);
});

test("importes con coma y miles se reconocen", () => {
  const words = row(0.9, ["Total", 0.5], ["1.234,56", 0.8]);
  const e = buildEvidence({ ...suggestion, total: "1234.56", lines: [] }, [{ page: 1, words }]);
  assert.equal(e.total?.box[0], 0.8);
});

test("el mismo importe repetido elige el de su etiqueta", () => {
  const e = buildEvidence(suggestion, [{ page: 1, words: page1 }]);
  assert.equal(e.net?.box[1], 0.8, "la base está en la fila de 'Base imponible'");
  assert.equal(e.net?.approx, false);
  assert.equal(e.lines[0].price?.box[0], 0.6, "el precio no se asigna a la base");
});

test("sin etiqueta y varios candidatos el recuadro es aproximado", () => {
  const words = [...row(0.2, ["31,00", 0.2]), ...row(0.6, ["31,00", 0.2])];
  const e = buildEvidence({ ...suggestion, lines: [] }, [{ page: 1, words }]);
  assert.equal(e.net?.approx, true);
});

test("valor ausente → null sin lanzar", () => {
  const e = buildEvidence({ ...suggestion, number: "XYZ-999", lines: [] }, [{ page: 1, words: page1 }]);
  assert.equal(e.number, null);
});

test("con varias páginas la evidencia indica la página correcta", () => {
  const second = row(0.9, ["Total", 0.5], ["37,51", 0.8]);
  const e = buildEvidence({ ...suggestion, lines: [] }, [
    { page: 1, words: page1 },
    { page: 2, words: second },
  ]);
  assert.equal(e.total?.page, 2);
});

test("línea: cantidad, precio y descripción", () => {
  const e = buildEvidence(suggestion, [{ page: 1, words: page1 }]);
  assert.equal(e.lines[0].quantity?.box[0], 0.5);
  assert.equal(e.lines[0].description?.approx, false);
});
