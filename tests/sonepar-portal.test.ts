import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runExtraction, StopPortal, toImporter, type Price } from "../scripts/sonepar-portal-core";

// Synthetic data and adapter: these tests do not validate Sonepar's actual DOM.
const verified = (ref: string, fuente: Price["fuente"] = "ya_comprado"): Price => ({ supplierRef: ref, precioBruto: "10.1234", precioNeto: "2.1234", precioMostradoSinClasificar: null, moneda: "EUR", unidad: "unidad", cantidadPrecioMostrado: "1", packaging: "caja 10", fechaConsulta: "2026-11-12T00:00:00Z", fuente, estado: "verified_unit", observaciones: null });
test("bridge excludes absent, ambiguous and unsupported precision", () => {
  const rows: Price[] = [verified("92813"), { ...verified("2"), estado: "ambiguous" }, { ...verified("3"), precioNeto: null }, { ...verified("4"), precioBruto: "1.12345" }, { ...verified("5"), moneda: "USD" }, { ...verified("6"), cantidadPrecioMostrado: "3" }];
  assert.deepEqual(toImporter(rows), [{ supplierRef: "92813", precio_bruto: 10.1234, precio_neto: 2.1234, fuente: "ya_comprado" }]);
});
test("bridge accepts numeric prices and quantity from the exported JSON", () => {
  const row = JSON.parse(JSON.stringify({ ...verified("92813"), precioBruto: 4.68, precioNeto: 2.34, cantidadPrecioMostrado: 1 }));
  assert.deepEqual(toImporter([row]), [{ supplierRef: "92813", precio_bruto: 4.68, precio_neto: 2.34, fuente: "ya_comprado" }]);
});
test("rejects repeated pagination and resumes without duplicating results", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sonepar-"));
  const file = path.join(dir, "state.json");
  try {
    const adapter = { purchasedFirst: async () => ({ pageKey: "a", rows: [verified("92813")], hasNext: true }), purchasedNext: async () => ({ pageKey: "a", rows: [], hasNext: false }), search: async () => null };
    await assert.rejects(runExtraction(adapter, [{ supplierRef: "92813" }], file, 1000), StopPortal);
    assert.equal(JSON.parse(await readFile(file, "utf8")).results.length, 1);
    const done = await runExtraction({ ...adapter, purchasedFirst: async () => ({ pageKey: "a", rows: [verified("92813")], hasNext: false }) }, [{ supplierRef: "92813" }], file, 1000);
    assert.equal(done.phase, "done"); assert.equal(done.results.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("rejects a search match for a different supplier reference", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sonepar-"));
  try {
    await assert.rejects(runExtraction({ purchasedFirst: async () => ({ pageKey: "empty", rows: [], hasNext: false }), purchasedNext: async () => { throw Error("unexpected"); }, search: async () => verified("other", "busqueda") }, [{ supplierRef: "92813" }], path.join(dir, "state.json"), 1000), StopPortal);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("preserves unidentifiable catalog entries and never searches them", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sonepar-"));
  let searches = 0;
  try {
    const state = await runExtraction({ purchasedFirst: async () => ({ pageKey: "empty", rows: [], hasNext: false }), purchasedNext: async () => { throw Error("unexpected"); }, search: async () => { searches++; return null; } }, [{ supplierRef: "" }], path.join(dir, "state.json"), 1000);
    assert.equal(searches, 0); assert.equal(state.results[0].estado, "no_identificable");
    assert.deepEqual(toImporter(state.results), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("a finished run starts a fresh query even with the same resume file", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sonepar-"));
  let calls = 0;
  try {
    const file = path.join(dir, "state.json");
    const adapter = { purchasedFirst: async () => { calls++; return { pageKey: "one", rows: [verified("92813")], hasNext: false }; }, purchasedNext: async () => { throw Error("unexpected"); }, search: async () => null };
    await runExtraction(adapter, [{ supplierRef: "92813" }], file, 1000);
    await runExtraction(adapter, [{ supplierRef: "92813" }], file, 1000);
    assert.equal(calls, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
