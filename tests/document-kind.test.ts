import test from "node:test";
import assert from "node:assert/strict";
import { detectKind, documentRefs } from "../src/lib/document-kind";

const invoice = `SONEPAR CIUDAD REAL\nFACTURA   **E S D U P L I C A D O**\nF02000R-107136   Cliente: 63000398\nDESCRIPCIÓN CANTIDAD PRECIO\nAlbarán nº 413323642 de fecha 27/08/26\n17597 INTERRUPTOR 13,00 9,34\nABONO A02000R-6297 de otra cosa`;
const credit = `SONEPAR\nFACTURA ABONO\nA02000R-30424\nDESCRIPCIÓN CANTIDAD\n1141837 PULSADOR -1,00\nABONO ALB. 413163104 FECHA 08/10/2025 PED. 1743 ITEM 5 FRA. F02000R-\n122115 15/10/2025`;

test("detecta factura, abono y albarán por la cabecera", () => {
  assert.equal(detectKind(invoice), "PURCHASE"); // «ABONO» en las líneas no cuenta
  assert.equal(detectKind(credit), "CREDIT");
  assert.equal(detectKind("ABONO CONTADO\n1812 04/09/2026\nARTÍCULO DESCRIPCIÓN\n..."), "CREDIT");
  assert.equal(detectKind("ALBARÁN 12345\nDESCRIPCIÓN\n..."), "DELIVERY");
  assert.equal(detectKind("sin nada"), "PURCHASE");
});

test("extrae albaranes y facturas citados", () => {
  assert.deepEqual(documentRefs(invoice), { albaranes: ["413323642"], facturas: [] });
  const r = documentRefs("ABONO ALB. 413163104 FECHA 08/10/2025 PED. 1743 ITEM 5 FRA. F02000R-122115 15/10/2025");
  assert.deepEqual(r, { albaranes: ["413163104"], facturas: ["F02000R-122115"] });
});
