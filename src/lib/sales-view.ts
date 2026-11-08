import { dec } from "./money";
import type { Sale } from "./workspace-types";

export type SaleStatus = "Cobrada" | "Vencida" | "Pendiente";

/** Total a cobrar: base + impuestos − retención. */
export const saleTotal = (s: Pick<Sale, "net" | "tax" | "withholding">) =>
  dec(s.net).plus(s.tax).minus(s.withholding);
export const saleDue = (s: Pick<Sale, "net" | "tax" | "withholding" | "collected">) =>
  saleTotal(s).minus(s.collected);

/** Cobrada si no queda nada; vencida si queda algo y su vencimiento ya pasó (today = AAAA-MM-DD). */
export function saleStatus(s: Sale, today: string): SaleStatus {
  if (saleDue(s).lte(0)) return "Cobrada";
  return s.dueAt && s.dueAt.slice(0, 10) < today ? "Vencida" : "Pendiente";
}

/** Base facturada por mes (0–11) de un año. */
export function monthlyNet(sales: Sale[], year: number) {
  const out = Array<number>(12).fill(0);
  for (const s of sales) {
    if (s.date.slice(0, 4) === String(year)) out[Number(s.date.slice(5, 7)) - 1] += Number(s.net);
  }
  return out;
}

/** Los N mayores por clave, con el resto agrupado. */
export function topN<T>(rows: T[], key: (r: T) => string, value: (r: T) => number, n = 5) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  const sorted = [...m].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map(([name, total]) => ({ name, total }));
  const rest = sorted.slice(n).reduce((a, [, t]) => a + t, 0);
  return rest > 0 ? [...top, { name: "Resto", total: rest }] : top;
}

/** Reparto de lo pendiente: vencido, próximos 30 días y más adelante / sin fecha. */
export function collections(sales: Sale[], today: string) {
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 30);
  const end = limit.toISOString().slice(0, 10);
  const r = { pending: { n: 0, amount: 0 }, overdue: { n: 0, amount: 0 }, soon: { n: 0, amount: 0 }, later: { n: 0, amount: 0 } };
  for (const s of sales) {
    const due = saleDue(s);
    if (due.lte(0)) continue;
    const amount = due.toNumber(),
      d = s.dueAt?.slice(0, 10);
    r.pending.n++;
    r.pending.amount += amount;
    const bucket = d && d < today ? r.overdue : d && d <= end ? r.soon : r.later;
    bucket.n++;
    bucket.amount += amount;
  }
  return r;
}
