import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSoneparPrices } from "../src/lib/sonepar-prices";

export type Source = "ya_comprado" | "busqueda" | "sin_consulta";
export type Product = { supplierRef: string };
export type Price = {
  imageUrl?: string | null;
  supplierRef: string; precioBruto: string | null; precioNeto: string | null;
  precioBrutoUnitario?: string | null; precioNetoUnitario?: string | null;
  precioMostradoSinClasificar: string | null; moneda: string | null; unidad: string | null;
  cantidadPrecioMostrado: string | null; packaging: string | null;
  fechaConsulta: string; fuente: Source; estado: "verified_unit" | "ambiguous" | "missing" | "no_identificable" | "failed"; observaciones: string | null;
};
export type Batch = { pageKey: string; rows: Price[]; hasNext: boolean };
// This interface must be implemented after inspecting the authenticated site.
// Methods must be read-only; search must return only an exact supplierRef match.
export interface PortalAdapter {
  purchasedFirst(): Promise<Batch>;
  purchasedNext(): Promise<Batch>;
  search(supplierRef: string): Promise<Price | null>;
}
type State = { inputHash: string; phase: "purchased" | "search" | "done"; pageKeys: string[]; results: Price[]; searched: string[] };
export class StopPortal extends Error {}
export class RateLimit extends Error {
  constructor(message: string, public readonly retryAfterMs = 60000) { super(message); }
}
export async function atomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await rename(temp, file);
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function runExtraction(adapter: PortalAdapter, products: Product[], stateFile: string, intervalMs = 1000) {
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) throw Error("Intervalo mínimo: 1000 ms");
  if (!Array.isArray(products) || !products.length) throw Error("Catálogo vacío");
  const refs = [...new Set(products.map(p => p.supplierRef).filter((r): r is string => typeof r === "string" && !!r.trim() && r === r.trim()))];
  const inputHash = createHash("sha256").update(JSON.stringify(products)).digest("hex");
  const newState = (): State => ({ inputHash, phase: "purchased", pageKeys: [], results: products.filter(p => typeof p.supplierRef !== "string" || !p.supplierRef.trim() || p.supplierRef !== p.supplierRef.trim()).map(() => ({ supplierRef: "", precioBruto: null, precioNeto: null, precioMostradoSinClasificar: null, moneda: null, unidad: null, cantidadPrecioMostrado: null, packaging: null, fechaConsulta: new Date().toISOString(), fuente: "sin_consulta" as const, estado: "no_identificable" as const, observaciones: "Referencia de proveedor vacía o inválida" })), searched: [] });
  let state: State;
  try { state = JSON.parse(await readFile(stateFile, "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; state = newState(); }
  const oldResults = state.results.some(r => !Number.isFinite(Date.parse(r.fechaConsulta)) || Date.now() - Date.parse(r.fechaConsulta) > 86400000);
  const oldCheckpoint = await stat(stateFile).then(s => Date.now() - s.mtimeMs > 86400000).catch(() => false);
  if (state.phase === "done" || oldResults || oldCheckpoint) { state = newState(); await atomic(stateFile, state); }
  else if (state.inputHash !== inputHash) throw Error("El catálogo cambió; usa otro archivo de progreso");
  for (const row of state.results) if (row.estado === "no_identificable") row.fuente = "sin_consulta";
  let lastRequest = 0;
  async function request<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await wait(Math.max(0, intervalMs - (Date.now() - lastRequest))); lastRequest = Date.now();
      try { return await fn(); } catch (e) {
        if (e instanceof StopPortal || e instanceof RateLimit || attempt >= 2) throw e;
        await wait(1000 * 2 ** attempt);
      }
    }
  }
  const wanted = new Set(refs);
  if (state.phase === "purchased") {
    // Restart pagination at the first page on resume, verifying every page again.
    const seen = new Set<string>();
    for (let first = true; ; first = false) {
      const batch = await request(() => first ? adapter.purchasedFirst() : adapter.purchasedNext());
      if (!batch.pageKey || seen.has(batch.pageKey)) throw new StopPortal("Paginación sin cambio de contenido/página");
      seen.add(batch.pageKey);
      for (const row of batch.rows) {
        if (row.fuente !== "ya_comprado") throw Error("Fuente incorrecta en compras");
        if (wanted.has(row.supplierRef) && !state.results.some(r => r.supplierRef === row.supplierRef)) state.results.push(row);
      }
      state.pageKeys = [...seen]; await atomic(stateFile, state);
      if (!batch.hasNext) break;
    }
    state.phase = "search"; await atomic(stateFile, state);
  }
  if (state.phase === "search") {
    for (const ref of refs) {
      if (state.searched.includes(ref) || state.results.some(r => r.supplierRef === ref && r.estado === "verified_unit")) continue;
      let row: Price | null;
      try { row = await request(() => adapter.search(ref)); }
      catch (error) {
        if (error instanceof StopPortal || error instanceof RateLimit) throw error;
        state.results = state.results.filter(r => r.supplierRef !== ref);
        state.results.push({ supplierRef: ref, precioBruto: null, precioNeto: null, precioMostradoSinClasificar: null, moneda: null, unidad: null, cantidadPrecioMostrado: null, packaging: null, fechaConsulta: new Date().toISOString(), fuente: "busqueda", estado: "failed", observaciones: "Falló la consulta tras reintentos limitados" });
        state.searched.push(ref); await atomic(stateFile, state); continue;
      }
      if (row && (row.supplierRef !== ref || row.fuente !== "busqueda")) throw new StopPortal(`Resultado no exacto: ${ref}`);
      if (row && (row.estado === "verified_unit" || !state.results.some(r => r.supplierRef === ref))) { state.results = state.results.filter(r => r.supplierRef !== ref); state.results.push(row); }
      else if (!state.results.some(r => r.supplierRef === ref)) state.results.push({ supplierRef: ref, precioBruto: null, precioNeto: null, precioMostradoSinClasificar: null, moneda: null, unidad: null, cantidadPrecioMostrado: null, packaging: null, fechaConsulta: new Date().toISOString(), fuente: "busqueda", estado: "missing", observaciones: null });
      state.searched.push(ref); await atomic(stateFile, state);
    }
    state.phase = "done"; await atomic(stateFile, state);
  }
  return state;
}

export function toImporter(rows: Price[]) {
  const result = rows.filter(r => r.estado === "verified_unit" && String(r.cantidadPrecioMostrado) === "1" && r.moneda === "EUR" && !!r.unidad && r.precioBruto !== null && r.precioNeto !== null)
    .filter(r => /^\d+(?:\.\d{1,4})?$/.test(r.precioBruto!) && /^\d+(?:\.\d{1,4})?$/.test(r.precioNeto!))
    .map(r => ({ supplierRef: r.supplierRef, precio_bruto: Number(r.precioBruto), precio_neto: Number(r.precioNeto), fuente: r.fuente }));
  return result.length ? parseSoneparPrices(JSON.stringify(result)) : [];
}
