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
  assert.deepEqual([b.reference, b.brand, b.description], ["MUTE100T", "NOVOVENT", "Extractor doméstico MUTE 100T"]);
  assert.equal(raee.financial, true);
  assert.equal(raee.price, "0.50");
  assert.ok(!s.warnings.some((w) => w.startsWith("Las líneas reconocidas no suman")));
});
