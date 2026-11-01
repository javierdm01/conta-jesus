import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOcr } from "../src/lib/ocr";
import { documentLineNet, sum, cents, lineNet } from "../src/lib/money";
import { allocateDocumentValue } from "../src/lib/document-values";
import { layoutText } from "../src/lib/ocr-layout";

const invoice = `Factura
Proveedor de prueba S.L.
CIF:B12345678
Tel: 900 111 222
001780  28/09/2026  F-95151
CÓDIGO  DESCRIPCIÓN  CANT  PRECIO  DTO1  DTO2  DTO3  IMPORTE
Albarán: A-69503 de 28/09/26
EQ-12  SET SPLIT MURAL
EQ-12  SET SPLIT MURAL ARTIC  1,00  319,00€  0,00  0,00  0,00  319,00 €
PRO
TASA01  TASA R32 RD712/2022  0,57  0,00€  0,00  0,00  0,00  0,00 €
SOP-45  SOPORTE 500 X 450 X 1.5 MM  1,00  8,00€  0,00  0,00  0,00  8,00 €
AMORT01  JUEGO 4 UNID  1,00  1,50€  0,00  0,00  0,00  1,50 €
AMORTIGUADOR
REG-01  REGALO SOPORTE Y AMORTIGUADOR  -1,00  9,50€  0,00  0,00  0,00  -9,50 €
Pagado efectivo 400 euros. Factura total 395
IMP. BRUTO  %  DTO  %  BASE IMPONIBLE  IVA  CUOTA IVA  REC. EQUIV  TOTAL
319,00 €  0,00  0,00 €  0,00  319,00 €  21,00  66,99 €  0,00 €  385,99
TOTAL 385,99 €`;
test("foto tabulada: fecha y factura frente a albarán; cinco conceptos, regalo y total impreso", () => {
  const r = parseOcr(invoice, [], "PURCHASE");
  assert.equal(r.number, "F-95151");
  assert.equal(r.date, "2026-09-28");
  assert.deepEqual([r.net, r.tax, r.total], ["319.00", "66.99", "385.99"]);
  assert.equal(r.lines.length, 5);
  assert.equal(r.lines[0].description, "SET SPLIT MURAL ARTIC PRO");
  assert.equal(r.lines[3].description, "JUEGO 4 UNID AMORTIGUADOR");
  assert.equal(r.lines[1].financial, true);
  assert.equal(r.lines[4].financial, true);
  assert.equal(r.lines[4].quantity, "-1.00");
  assert.equal(
    cents(
      sum(r.lines.map((l) => documentLineNet(l.quantity, l.price, l.discount))),
    ),
    r.net,
  );
  assert.equal(r.supplier?.taxId, "B12345678");
});
test("reparto de conceptos económicos mantiene céntimos, originales y existencias positivas", () => {
  const result = allocateDocumentValue(["319.00", "8.00", "1.50"], "319.00");
  assert.equal(cents(sum(result)), "319.00");
  assert.ok(result.every((v) => Number(v) >= 0));
  assert.deepEqual(allocateDocumentValue(["0.00", "3.00", "0.00"], "2.00"), [
    "0.00",
    "2.00",
    "0.00",
  ]);
  assert.throws(() => allocateDocumentValue(["0"], "1"));
  assert.throws(() => lineNet("-1", "9.50"));
  assert.equal(documentLineNet("-1", "9.50"), "-9.50");
});
test("tabla con unidad explícita conserva metros y descuentos sucesivos", () => {
  const r = parseOcr(
    "Descripción  Cantidad  Unidad  Precio  DTO1  DTO2  Importe\nCable  10 m  2,00  10  5  17,10",
    [],
    "PURCHASE",
  );
  assert.equal(r.lines[0].unit, "m");
  assert.equal(r.lines[0].discount, "14.5");
});
test("TSV vuelve a reunir columnas separadas en bloques y descarta ruido de baja confianza", () => {
  const head =
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const row = (
    block: number,
    left: number,
    top: number,
    text: string,
    confidence = 95,
  ) =>
    `5\t1\t${block}\t1\t1\t1\t${left}\t${top}\t50\t20\t${confidence}\t${text}`;
  const text = layoutText(
    [
      head,
      row(1, 10, 100, "REF01"),
      row(1, 10, 150, "REF02"),
      row(2, 100, 102, "Cable"),
      row(2, 100, 151, "Soporte"),
      row(3, 300, 101, "10,00"),
      row(3, 300, 151, "8,00"),
      row(4, 10, 0, "ruido", 5),
    ].join("\n"),
  );
  assert.deepEqual(text.split("\n"), [
    "REF01  Cable  10,00",
    "REF02  Soporte  8,00",
  ]);
});
