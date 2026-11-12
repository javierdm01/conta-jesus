import { z } from "zod";

const amount = z.number().finite().min(0).max(9999999999.9999)
  .refine(n => Math.abs(n * 10000 - Math.round(n * 10000)) < 0.02, "Máximo cuatro decimales");
const prices = z.array(z.object({
  supplierRef: z.string().trim().min(1).max(80),
  precio_bruto: amount,
  precio_neto: amount,
  fuente: z.enum(["ya_comprado", "busqueda"]),
}).strict().refine(p => p.precio_neto <= p.precio_bruto, "El neto supera el bruto")).min(1).max(100000);

export function parseSoneparPrices(text: string) {
  const rows = prices.parse(JSON.parse(text));
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.supplierRef)) throw Error(`Referencia duplicada: ${row.supplierRef}`);
    seen.add(row.supplierRef);
  }
  return rows;
}

export const SONEPAR_WAIT_MS = 60 * 60 * 1000;
export function soneparImportReady(exportedAt: string, now = Date.now()) {
  const date = Date.parse(exportedAt);
  if (!Number.isFinite(date)) throw Error("Fecha de exportación inválida");
  return now - date >= SONEPAR_WAIT_MS;
}
