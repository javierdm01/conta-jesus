import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOcr } from "../src/lib/ocr";
test("tabla con cabecera conserva referencia y reconoce descuento explícito", () => {
  const r = parseOcr(
    "Factura N.º F-2026\nFecha: 2026-10-18\nReferencia  Descripción  Cantidad  U.M.  Precio  Dto.  Importe\nMAG-16  Magnetotérmico 16 A  20  ud  5,00  10 %  90,00\nBase imponible: 90,00",
  );
  assert.equal(r.number, "F-2026");
  assert.equal(r.date, "2026-10-18");
  assert.equal(r.lines[0].reference, "MAG-16");
  assert.equal(r.lines[0].quantity, "20");
  assert.equal(r.lines[0].discount, "10");
});
test("fila sin columna de descuento solo se reconoce si cantidad por precio coincide", () => {
  assert.equal(parseOcr("Cable H07 100 m 0,50 50,00").lines[0].discount, "0");
  assert.equal(parseOcr("Cable H07 100 m 0,50 45,00").lines.length, 0);
});
test("NIF respeta límites y no selecciona proveedor si aparecen dos emisores posibles", () => {
  const s = [
    { id: "a", name: "A", taxId: "B12345678" },
    { id: "b", name: "B", taxId: "B87654321" },
  ];
  assert.equal(parseOcr("XB123456789", s).supplierId, undefined);
  assert.equal(parseOcr("NIF B-12345678", s).supplierId, "a");
  assert.equal(parseOcr("B12345678 B87654321", s).supplierId, undefined);
});
test("bases ambiguas y líneas incompletas requieren revisión", () => {
  const r = parseOcr(
    "Base imponible: 100,00\nBase imponible: 200,00\nCable 1 m 10,00 0 % 10,00",
  );
  assert.equal(r.net, undefined);
  assert.ok(r.warnings.some((w) => w.includes("varios importes")));
  const missing = parseOcr("Base imponible: 20,00\nCable 1 m 10,00 0 % 10,00");
  assert.ok(missing.warnings.some((w) => w.includes("no suman")));
});
test("tipo factura no permite líneas sin precio aunque mencione un albarán", () => {
  assert.equal(
    parseOcr("Factura de albarán\nCable H07 20 m", [], "PURCHASE").lines.length,
    0,
  );
  assert.equal(
    parseOcr("Entrega\nCable H07 20 m", [], "DELIVERY").lines.length,
    1,
  );
});
test("propuesta OCR con unidades explícitas, cabecera y NIF exacto", () => {
  const r = parseOcr(
    "Almacén PRUEBA B12345678\nFactura Nº F-001\nFecha: 18/10/2026\nCable H07Z1-K 2,5 mm2 100 m 0,50 10 % 45,00\nBase imponible: 45,00\nTotal IVA: 9,45",
    [{ id: "s1", name: "Proveedor", taxId: "B12345678" }],
  );
  assert.equal(r.number, "F-001");
  assert.equal(r.supplierId, "s1");
  assert.equal(r.date, "2026-10-18");
  assert.equal(r.net, "45.00");
  assert.equal(r.lines[0].quantity, "100");
  assert.equal(r.lines[0].unit, "m");
  assert.equal(r.lines[0].family, "Cableado");
  assert.equal(r.lines[0].reference, "");
});
test("no inventa líneas si falta la unidad, el precio o no cuadra el total", () => {
  assert.equal(parseOcr("Cable 100 0,50 10 % 45,00").lines.length, 0);
  assert.equal(parseOcr("Cable H07 100 m 0,50 10 % 50,00").lines.length, 0);
  assert.equal(parseOcr("Factura sin número legible").number, undefined);
});
test("no cambia rollos por metros ni acepta fechas imposibles", () => {
  const r = parseOcr("Cable 2 rollos 25,00 0 % 50,00\nFecha 30/02/2026");
  assert.equal(r.lines[0].unit, "rollo");
  assert.equal(r.lines[0].quantity, "2");
  assert.equal(r.date, undefined);
});
test("un albarán sin precios propone cantidades explícitas sin inventar valoración", () => {
  const r = parseOcr(
    "Albarán Nº A-200\nCable H07Z1 100 m\nMagnetotérmico 16 A 20 ud",
  );
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].quantity, "100");
  assert.equal(r.lines[0].unit, "m");
  assert.equal(r.lines[1].quantity, "20");
  assert.equal(r.lines[1].price, "");
  assert.equal(r.net, undefined);
});
test("proveedor: sin NIF elige el nombre más parecido aunque el OCR falle una letra", () => {
  const s = [
    { id: "a", name: "Suministros Eléctricos Levante S.L.", taxId: "" },
    { id: "b", name: "Frigoríficos del Sur S.A.", taxId: "" },
    { id: "c", name: "Electro Norte S.L.", taxId: "" },
  ];
  const r = parseOcr("Suministros Electricos Levanle SL\nC/ Mayor 1\nFactura Nº 55", s);
  assert.equal(r.supplierId, "a");
  assert.ok(r.warnings.some((w) => w.includes("nombre parecido")));
  assert.equal(parseOcr("Papelería Ruiz\nFactura Nº 1", s).supplierId, undefined);
});
test("fechas con año corto o en letra y número tras la etiqueta", () => {
  assert.equal(parseOcr("Fecha factura: 05-03-26").date, "2026-03-05");
  assert.equal(parseOcr("Fecha: 5 de marzo de 2026").date, "2026-03-05");
  assert.equal(parseOcr("Fecha: 01/03/2026\nVencimiento: 30/03/2026").date, "2026-03-01");
  assert.equal(parseOcr("Nº de factura: 2026/0042").number, "2026/0042");
});
test("totales: IVA derivado del total, tabla Base/%/Cuota y avisos de descuadre", () => {
  const a = parseOcr("Base imponible: 100,00\nTotal factura: 121,00");
  assert.equal(a.tax, "21.00");
  assert.equal(a.taxRate, 21);
  assert.ok(a.warnings.some((w) => w.includes("calculado")));
  const b = parseOcr("Base Imp.  % IVA  Cuota\n1.000,00  21  210,00\nTotal 1.210,00");
  assert.equal(b.net, "1000.00");
  assert.equal(b.tax, "210.00");
  const c = parseOcr("Base imponible: 100,00\nTotal IVA: 21,00\nTotal factura: 150,00");
  assert.ok(c.warnings.some((w) => w.includes("no coincide")));
});
test("unidades con ruido de OCR y referencia al inicio", () => {
  const r = parseOcr("MAG16C Magnetotérmico 16 A 10 uds. 5,00 0 % 50,00");
  assert.equal(r.lines[0].unit, "ud");
  assert.equal(r.lines[0].reference, "MAG16C");
});
