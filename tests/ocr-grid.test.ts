import test from "node:test";
import assert from "node:assert/strict";
import { parseOcr } from "../src/lib/ocr";
import { chooseRows, GRID_TAG, type GridRow } from "../src/lib/ocr-grid";

// Oferta de venta de Suministros INRA (Grupo Unase) fotografiada: lo que lee el lector de celdas, con las variantes que cuadran.
const row = (code: string, brand: string, description: string, alts: Record<string, string>[], extra: string[] = []): GridRow => ({
  cells: { code, brand, description },
  how: "ok",
  values: alts[0],
  extra,
  alternatives: alts,
});
const a = (quantity: string, price: string, dto1: string, total: string) => ({ quantity, price, dto1, dto2: "0.00", total });

const text = (rows: GridRow[], notes: string[] = []) =>
  [
    "SUMINISTROS Y TRANSPORTES INRA, SL",
    "CIF: 813555504",
    "JESUS DIAZ DUEÑAS",
    "CIF: 703486210",
    "OFERTA DE VENTA REFERENCIA CLIENTE FECHA",
    "6108750 00 01389 26/10/2020",
    "Base imponible 148,06",
    "Cuota IVA: 31.09",
    "Total documento: 179.15",
    `${GRID_TAG}${JSON.stringify({ identity: "6108750 00 01389 26/10/2026", rows, notes })}`,
  ].join("\n");

const rows = [
  row("5795", "TELEVES", "FUENTE ALIM.PICOKOM 24V/130mA EASY-F", [a("4.00", "35.850", "45.00", "78.87")]),
  row("WIR9059N", "NIMO", "Cable coaxial de antena cobre desnudo para exterior", [a("100.00", "0.524", "0.00", "52.40")], ["negro 100m"]),
  row("010290", "SOFAMEL", "TERMINAL Cu T-10/10", [a("6.00", "0.712", "60.00", "1.71"), a("6.00", "0.711", "60.00", "1.71")]),
  row("010280", "SOFAMEL", "TERMINAL Cu T-10/8", [a("15.00", "0.580", "60.00", "3.48")]),
  row("010310", "SOFAMEL", "Terminal cobre T-16/8", [a("20.00", "0.691", "60.00", "5.53")]),
  // La mejor lectura de esta fila (importe 6.70) no suma la base; la segunda sí.
  row("010340", "SOFAMEL", "Terminal cobre T-16/10", [a("20.00", "0.838", "60.00", "6.70"), a("20.00", "0.759", "60.00", "6.07")]),
];

test("elige por fila la combinación que hace sumar los importes a la base del documento", () => {
  const r = chooseRows(rows, "148.06");
  assert.equal(r.matched, true);
  assert.equal(r.picks[5]!.total, "6.07");
  assert.equal(r.picks[2]!.price, "0.712");
  assert.equal(chooseRows(rows, "999.99").matched, false);
});

test("la oferta de INRA da proveedor, cabecera, líneas y notas", () => {
  const known = [{ id: "s1", name: "Inra", taxId: "B13555594" }];
  const s = parseOcr(text(rows, ["ECHARLE 1UDS DE CADA MAS", "las lleva ya pagadas en otro albaran"]), known, "PURCHASE");
  assert.equal(s.supplierId, "s1");
  assert.equal(s.supplier?.taxId, "B13555594");
  assert.equal(s.number, "6108750");
  assert.equal(s.date, "2026-10-26"); // el OCR general leyó 2020; la cabecera leída aparte la corrige
  assert.equal(s.net, "148.06");
  assert.equal(s.lines.length, 6);
  assert.deepEqual(s.lines[0], { reference: "5795", description: "FUENTE ALIM.PICOKOM 24V/130mA EASY-F", quantity: "4.00", unit: "ud", price: "35.850", discount: "45", family: "Sin clasificar", brand: "TELEVES" });
  assert.equal(s.lines[1].description, "Cable coaxial de antena cobre desnudo para exterior negro 100m");
  assert.equal(s.lines[5].price, "0.759");
  assert.ok(s.warnings.some((w) => w.includes("suman la base del documento")));
  assert.ok(s.warnings.some((w) => w.startsWith("Nota del proveedor") && w.includes("ECHARLE")));
  assert.ok(s.warnings.some((w) => w.startsWith("Fecha corregida")));
});

test("una fila sin combinación que cuadre se conserva sin precio y avisa", () => {
  const broken = [...rows.slice(0, 5), { ...rows[5], alternatives: [], values: { quantity: "20.00", price: "0.75" } }];
  const s = parseOcr(text(broken), [], "PURCHASE");
  assert.equal(s.lines.length, 6);
  assert.equal(s.lines[5].price, "");
  assert.ok(s.warnings.some((w) => w.startsWith("Importes sin conciliar")));
  assert.ok(s.warnings.some((w) => w.includes("no se ha podido comprobar")));
});

import { repairByBase } from "../src/lib/ocr-grid";
test("la base del documento corrige un precio con una cifra mal leída", () => {
  // Extractor NOVOVENT: se leyó 29,072 (impreso 29,572); la línea cuadra sola (58,14) pero la base impresa es 59,14.
  const line = { description: "Extractor doméstico MUTE 100T", quantity: "2.00", price: "29.072", discount: "0" };
  const fix = repairByBase([line], "59.14");
  assert.equal(fix?.lines[0].price, "29.572");
  assert.match(fix!.warning, /29\.072 a 29\.572/);
  // Si ya suman la base, o si la corrección no se parece a lo leído, no se toca nada.
  assert.equal(repairByBase([{ ...line, price: "29.572" }], "59.14"), null);
  assert.equal(repairByBase([line], "300.00"), null);
});
test("con varias líneas no se corrige si varias podrían explicar la diferencia", () => {
  const a = { description: "A", quantity: "10.00", price: "0.700", discount: "0" }; // 7,00
  const b = { description: "B", quantity: "10.00", price: "1.070", discount: "0" }; // 10,70
  const bad = { description: "C", quantity: "2.00", price: "3.370", discount: "0" }; // 6,74 (impreso 3,379 → 6,76)
  // Una diferencia de 0,02 € la absorbería cualquiera de las tres líneas con un retoque mínimo: no se adivina.
  assert.equal(repairByBase([a, b, bad], "24.46"), null);
  // Una diferencia de 1,00 € solo la explica un fallo claro en una línea.
  const big = { description: "D", quantity: "2.00", price: "29.072", discount: "0" };
  assert.equal(repairByBase([a, b, big], "76.84")?.lines[2].price, "29.572");
});

test("tabla con T.RAEE y Marca por texto: la tasa y la marca no se mezclan con la descripción", () => {
  const s = parseOcr(
    [
      "OFERTA DE VENTA REFERENCIA CLIENTE FECHA",
      "6109095 00 01389 04/11/2026",
      "Código Marca Descripción T. RAEE(*) Cantidad Precio Dto Dto Importe",
      "NOVOVENT  Extractor doméstico MUTE 100T  0,50  2,00  29,572  0,00  0,00  59,14",
      "Base imponible 59,14",
    ].join("\n"),
    [],
    "PURCHASE",
  );
  assert.equal(s.lines.length, 1);
  assert.equal(s.lines[0].description, "Extractor doméstico MUTE 100T");
  assert.equal(s.lines[0].brand, "NOVOVENT");
  assert.equal(s.lines[0].price, "29.572");
  assert.equal(s.number, "6109095");
});
