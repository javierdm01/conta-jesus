import test from "node:test";
import assert from "node:assert/strict";
import { parseSoneparPdf } from "../src/lib/sonepar";
import { documentRefs } from "../src/lib/document-kind";

const A = `SONEPAR CIUDAD REAL
FACTURA        **E S D U P L I C A D O**
F02000R-107136            Cliente: 63000398
                                   Página 1 de 2
02/09/2026                NIF: 70348621Q
DESCRIPCIÓN     CANTIDAD   PRECIO
Sonepar Spain S.A.U. Inscrita en el Registro Mercantil con fecha 03/02/2020 en tomo 40055
Importe Bruto:   1.092,08
BASE IMPONIBLE        %IVA               TOTAL IVA
                                             TOTAL FACTURA
       1.092,08     21,00                   229,34
                                                    1.321,42 EUR`;
const B = `SONEPAR CIUDAD REAL
FACTURA S/PDO ENV.POR: SUS MEDIOS
PDO.: 1811
263001064 02/09/2026 LISTA: 79428256
ALB.: 263013759
COD.ARTÍCULO DESCRIPCIÓN CANTIDAD
Sonepar Spain S.A.U. fecha 03/02/2020
BASE IMPON.  %IVA  IMP.%IVA  %R.E.  IMP.%R.EQ.
283,32  21,00  59,50  TOTAL FACTURA
342,82  EUR`;
const C = `SONEPAR
FACTURA ABONO
A02000R-30424   Cliente: 63000398
15/12/2025   NIF: 70348621Q
DESCRIPCIÓN
BASE IMPONIBLE  %IVA  TOTAL IVA
TOTAL FACTURA
-6,59  21,00  -1,38
-7,97 EUR`;

test("factura con maquetación F02000R", () => {
  const { lines, ...head } = parseSoneparPdf(A)!;
  assert.deepEqual(head, { number: "F02000R-107136", date: "2026-09-02", net: "1092.08", tax: "229.34", total: "1321.42", consistent: true });
  assert.deepEqual(lines, []);
});
test("factura con maquetación S/PDO", () => {
  const r = parseSoneparPdf(B)!;
  assert.equal(r.number, "263001064");
  assert.equal(r.date, "2026-09-02");
  assert.equal(r.net, "283.32");
  assert.equal(r.consistent, true);
});
test("el abono sale en positivo y con el número A02000R", () => {
  const r = parseSoneparPdf(C)!;
  assert.deepEqual([r.number, r.date, r.net, r.tax, r.total], ["A02000R-30424", "2025-12-15", "6.59", "1.38", "7.97"]);
});
test("no es de Sonepar o los importes no cuadran", () => {
  assert.equal(parseSoneparPdf("Otra empresa"), null);
  assert.equal(parseSoneparPdf(A.replace("1.321,42", "1.400,00"))!.consistent, false);
});
test("facturas abonadas aunque el número venga partido", () => {
  assert.deepEqual(documentRefs("ABONO ALB. 413320811 FECHA 24/08/2026 PED. 1805 ITEM 65 FRA.  Ref.Prov: 0658  Marca: TUPERSA\nF02000R-106877 31/08/2026").facturas, ["F02000R-106877"]);
  assert.deepEqual(documentRefs("ABONO ALB. 413163104 FECHA 08/10/2025 PED. 1743 ITEM 5 FRA. F02000R- Ref.Prov: N2204.51 BL Marca: NIESSEN\n122115 15/10/2025").facturas, ["F02000R-122115"]);
  assert.deepEqual(documentRefs("ABONO ALB. 263013758 FECHA 02/09/2026 ITEM 5 FRA. F02000C-31140 02/09/2026").facturas, ["F02000C-31140"]);
});

test("líneas con descuento, abono con signo y tasa RAEE", () => {
  const T = `SONEPAR
FACTURA
F02000R-1  Cliente: 1
01/02/2026  NIF: 1
DESCRIPCIÓN  CANTIDAD  PRECIO  %DESCUENTO  IMPORTE
17597                    INTERRUPTOR UNIPOLAR 10 AX 250V~ CON SISTEMA DE EM                      13,00              9,340000          52,00                 58,28
                                  Ref.Prov: 75101-39                        Marca: SIMON
PORTES-PROVEEDOR  PORTES DE ENVIO    1,00   0,000010   0,00
COSTE RAEE R.D. 208/2005   0,110000   0,66
TOTAL COSTE RAEE R.D. 208/2005:  0,66
BASE IMPONIBLE  %IVA  TOTAL IVA
TOTAL FACTURA
58,94  21,00  12,38
71,32 EUR`;
  const r = parseSoneparPdf(T)!;
  assert.equal(r.lines.length, 3);
  assert.deepEqual(r.lines[0], { code: "17597", description: "INTERRUPTOR UNIPOLAR 10 AX 250V~ CON SISTEMA DE EM", reference: "75101-39", brand: "SIMON", quantity: "13", price: "9.34", discount: "52", net: "58.28" });
  assert.equal(r.lines[2].quantity, "6"); // 0,66 / 0,11
  assert.equal(r.lines.reduce((a, l) => a + Number(l.net), 0).toFixed(2), "58.94");
  const neg = parseSoneparPdf(T.replace("13,00              9,340000          52,00                 58,28", "-13,00   9,340000   52,00   -58,28"))!;
  assert.equal(neg.lines[0].net, "-58.28");
});
