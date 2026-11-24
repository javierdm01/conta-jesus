import test from "node:test";
import assert from "node:assert/strict";
import { parseOcr } from "../src/lib/ocr";

// Oferta de venta de INRA (Grupo Unase) tal y como la lee el OCR de línea: sin huecos entre columnas.
const text = [
  "SUMINISTROS Y TRANSPORTES INRA, S.L.",
  "CIF: B13555594",
  "JESUS DIAZ DUEÑAS",
  "OFERTA DE VENTA REFERENCIA CLIENTE FECHA",
  "6109793 00 01389 20/11/2026",
  "Código Marca Descripción T. RAEE(*) Cantidad Precio Dto Dto Importe",
  "NBH8-1N-10C4 CHINT INTERRUPTOR AUT.NBH8 1P+N 1M 10A C-4,5KA 0,00 1,00 5,845 0,00 0,00 5,85",
  "MUTE 100T NOVOVENT Extractor doméstico MUTE 100T 0,50 1,00 29,072 0,00 0,00 29,07",
  "Portes: 0,00 % Dto. P.P.: 0,00 Importe P.P.: 0,00 Importe RAEE: 0,50",
  "Base imponible % IVA Importe IVA % R.E. Importe R.E.",
  "35,42 21,00 7,44 0,00 0,00",
  "TOTAL OFERTA VENTA 42,86 eur",
].join("\n");

test("INRA: referencia, marca y descripción separadas, y la tasa RAEE como línea propia", () => {
  const s = parseOcr(text, [{ id: "s1", name: "Inra", taxId: "B13555594" }], "PURCHASE");
  assert.equal(s.supplierId, "s1");
  assert.equal(s.number, "6109793");
  assert.equal(s.net, "35.42");
  const [a, b, raee] = s.lines;
  assert.deepEqual([a.reference, a.brand, a.description], ["NBH8-1N-10C4", "CHINT", "INTERRUPTOR AUT.NBH8 1P+N 1M 10A C-4,5KA"]);
  assert.deepEqual([b.reference, b.brand, b.description], ["MUTE 100T", "NOVOVENT", "Extractor doméstico MUTE 100T"]);
  assert.equal(raee.financial, true);
  assert.equal(raee.price, "0.50");
  assert.ok(!s.warnings.some((w) => w.startsWith("Las líneas reconocidas no suman")));
});

// Las dos ofertas reales (tests/fixtures/inra/*.pdf), tal y como las deja el OCR del worker (lectura de línea + lectura celda a celda).
import { readFileSync } from "node:fs";
const suppliers = [{ id: "s1", name: "Suministros INRA", taxId: "B13555594" }];
const real = (name: string) => parseOcr(readFileSync(new URL(`./fixtures/inra/${name}.ocr.txt`, import.meta.url), "utf8"), suppliers, "PURCHASE");
const view = (s: ReturnType<typeof parseOcr>) => s.lines.map((l) => [l.reference, l.brand, l.description, l.quantity, l.price, l.discount, !!l.financial]);

test("INRA 6109793: todos los campos, con la tasa RAEE aparte", () => {
  const s = real("documento-2");
  assert.deepEqual([s.supplierId, s.supplier?.taxId, s.number, s.date], ["s1", "B13555594", "6109793", "2026-11-20"]);
  assert.deepEqual([s.net, s.tax, s.total, s.taxRate], ["35.42", "7.44", "42.86", 21]);
  assert.deepEqual(view(s), [
    ["NBH8-1N-10C4", "CHINT", "INTERRUPTOR AUT.NBH8 1P+N 1M 10A C-4,5kA", "1", "5.845", "0", false],
    ["MUTE 100T", "NOVOVENT", "Extractor doméstico MUTE 100T", "1", "29.072", "0", false],
    ["", undefined, "Tasa RAEE", "1", "0.50", "0", true],
  ]);
});

test("INRA 6109840: código, marca, descripción, cantidad, precio y dto de las cinco líneas", () => {
  const s = real("documento-3");
  assert.deepEqual([s.supplierId, s.number, s.date], ["s1", "6109840", "2026-11-23"]);
  assert.deepEqual([s.net, s.tax, s.total, s.taxRate], ["55.92", "11.74", "67.66", 21]);
  assert.deepEqual(view(s), [
    ["315360", "SOFAMEL", "REGLETA CONEXION SKL-6 BL.", "10", "1.400", "65", false],
    ["315370", "SOFAMEL", "REGLETA CONEXION SKL-10 BL.", "10", "0.700", "0", false],
    ["10040 CBR", "EFAPEL", "CANAL 32x16mm SERIE 10 BLANCO", "4", "3.010", "48", false],
    ["10040 CBR", "EFAPEL", "CANAL 32x16mm SERIE 10 BLANCO", "4", "3.010", "48", false],
    ["NB1-2-63C", "CHINT", "MAGNETOT.2P 63A 2M CURVA-C 6kA", "1", "31.498", "0", false],
  ]);
  assert.ok(!s.warnings.some((w) => w.startsWith("Importes sin conciliar") || w.startsWith("Las líneas reconocidas no suman")));
});
