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
