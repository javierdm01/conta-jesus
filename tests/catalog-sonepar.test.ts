import test from "node:test";
import assert from "node:assert/strict";
import { parseSoneparJson } from "../src/lib/catalog-sonepar";

const sample = JSON.stringify({
  productos: [
    { referencia_sonepar: "29267", referencia_fabricante: "82010-30", marca: "SIMON", nombre: "SIMON-Tecla SIMON 82 blanco", precios_mostrados: ["4,81 €", "2,41 €", "2,41 €"], unidad_precio: "por Unid." },
    { referencia_sonepar: "22126", referencia_fabricante: "78021-2", marca: null, nombre: "UNEX-Moldura 10x16", precios_mostrados: ["3,42 €", "2,05 €", "1,03 €"], unidad_precio: "por 2 Unid." },
    { referencia_sonepar: "102415", referencia_fabricante: "065200016", marca: "TUPERSA", nombre: "TUPERSA-Tubo rígido 16", precios_mostrados: ["6,06 €", "1,82 €", "0,606 €"], unidad_precio: "por 3 metros" },
    { referencia_sonepar: "16514", referencia_fabricante: "27431-61", marca: "SIMON", nombre: "SIMON-Base sin precio", precios_mostrados: [], unidad_precio: null },
    { referencia_sonepar: "PORTES-PROVEEDOR", nombre: "SERVICIOS-PORTES DE ENVIO" },
  ],
});

test("parseSoneparJson asigna proveedor, marca, unidad y precio unitario", () => {
  const { items, skipped, withoutPrice } = parseSoneparJson(sample);
  assert.equal(items.length, 4);
  assert.equal(skipped, 1);
  assert.equal(withoutPrice, 1);
  assert.deepEqual(items[0], { reference: "82010-30", description: "Tecla SIMON 82 blanco", brand: "SIMON", unit: "ud", price: "2.41", supplier: "Sonepar", supplierRef: "29267" });
  assert.equal(items[1].brand, "UNEX"); // marca deducida del prefijo
  assert.equal(items[1].description, "Moldura 10x16");
  assert.equal(items[1].price, "1.03"); // el último precio es el unitario
  assert.equal(items[2].unit, "m");
  assert.equal(items[3].price, "0");
});

test("parseSoneparJson rechaza archivos sin productos", () => {
  assert.throws(() => parseSoneparJson("{}"), /productos/);
});
