import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSearch, recommendedPrice } from "../src/lib/product-search";
test("buscar combina alias, nombre y referencia sin depender de acentos, orden o separadores", () => {
  const fields = [
    "Enchufe salón",
    "DOBLE CONMUTADOR",
    "ABC-8122",
    "NIESSEN",
    "Cajón 3",
  ];
  for (const q of [
    "salon",
    "SALÓN",
    "niessen enchufe",
    "8122 abc",
    "ABC8122",
    "cajon3",
    "cajon 3",
    "conmutador doble",
  ])
    assert.ok(matchesSearch(q, fields), q);
  assert.equal(matchesSearch("salon diferencial", fields), false);
});
test("recomendación añade un 30 % al coste real por unidad, con redondeo monetario", () => {
  assert.equal(recommendedPrice("200", "20"), "13.00");
  assert.equal(recommendedPrice("44.02", "6"), "9.54");
  assert.equal(recommendedPrice("0", "1"), "0.00");
  assert.equal(recommendedPrice(null, "20"), null);
  assert.equal(recommendedPrice("20", "0"), null);
});
