import test from "node:test";
import assert from "node:assert/strict";
import { parseCatalogCsv, parsePrice } from "../src/lib/catalog-csv";

test("parsePrice entiende formatos españoles y ingleses", () => {
  assert.equal(parsePrice("1.234,56 €"), "1234.56");
  assert.equal(parsePrice("12,5"), "12.5");
  assert.equal(parsePrice("12.50"), "12.5");
  assert.equal(parsePrice("1,234.56"), "1234.56");
  assert.equal(parsePrice("1.234.567"), "1234567");
  assert.equal(parsePrice("abc"), null);
});

test("parseCatalogCsv lee el CSV de Excel con ; y comillas", () => {
  const { items, errors } = parseCatalogCsv(
    '﻿Referencia;Descripción;Marca;Unidad;Precio\nA-1;"Cable 3x1,5; flexible";Prysmian;m;1,25\nB-2;Enchufe;;Uds;3,10\n;Sin precio;;ud;\n',
  );
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { reference: "A-1", description: "Cable 3x1,5; flexible", brand: "Prysmian", unit: "m", price: "1.25" });
  assert.equal(items[1].unit, "ud");
  assert.equal(errors.length, 1);
});

test("parseCatalogCsv avisa si faltan columnas", () => {
  assert.match(parseCatalogCsv("a;b\n1;2").errors[0], /Faltan columnas/);
});

test("reconoce el CSV que exporta el propio catálogo (cabeceras largas, con acentos y paréntesis)", async () => {
  const { parseCatalogCsv } = await import("../src/lib/catalog-csv");
  const csv = [
    "Referencia;Ref. proveedor;Descripción;Marca;Proveedor;Unidad;Precio unitario (€, sin IVA);Origen del precio;Precio de tarifa del catálogo (€)",
    "75432-39;17643;Base enchufe SIMON 75;SIMON;Sonepar;ud;3,45;Último precio pagado;3,59",
    "X1;99;Sin precio;;Sonepar;ud;;Sin precio;",
  ].join("\r\n");
  const r = parseCatalogCsv(`\uFEFF${csv}`);
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.items[0], { reference: "75432-39", description: "Base enchufe SIMON 75", brand: "SIMON", unit: "ud", price: "3.45", supplier: "Sonepar", supplierRef: "17643" });
  assert.equal(r.errors.length, 1);
});
