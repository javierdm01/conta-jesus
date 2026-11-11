// Tablas con rejilla (Código | Marca | Descripción | T.RAEE | Cantidad | Precio | Dto | Dto | Importe), como las
// ofertas y albaranes de Suministros INRA (Grupo Unase). El lector de celdas (scripts/ruled-table.py) devuelve, por fila,
// varias combinaciones posibles que cuadran (cantidad × precio × descuentos = importe); aquí se elige la que hace que
// todos los importes sumen la base imponible del documento.
import { dec, cents, documentLineNet } from "./money";

export type GridRow = {
  cells: Record<string, string>;
  how: string;
  values: Record<string, string | null>;
  extra: string[];
  alternatives: Record<string, string>[];
};
export type Grid = { identity?: string; rows: GridRow[]; notes: string[] };

/** Marca que `ocrImage` añade al texto OCR con el resultado del lector de celdas (una sola línea). */
export const GRID_TAG = "[GRID] ";

export function gridFrom(text: string): { grid: Grid | null; rest: string } {
  const m = text.match(/^\[GRID\] (.+)$/m);
  if (!m) return { grid: null, rest: text };
  const rest = text.replace(m[0], "");
  try {
    const g = JSON.parse(m[1]) as Grid;
    return { grid: Array.isArray(g.rows) && g.rows.length ? { ...g, notes: g.notes ?? [] } : null, rest };
  } catch {
    return { grid: null, rest };
  }
}

type Pick = Record<string, string>;
/**
 * Elige una combinación por fila. Con la base conocida busca la selección cuyos importes la suman (prefiriendo siempre las
 * lecturas mejor puntuadas); sin ella, o si ninguna suma, usa la mejor de cada fila.
 */
export function chooseRows(rows: GridRow[], net?: string): { picks: (Pick | null)[]; matched: boolean } {
  const best = rows.map((r) => r.alternatives[0] ?? null);
  if (!net || !rows.length || rows.some((r) => !r.alternatives.length)) return { picks: best, matched: false };
  const target = Math.round(Number(net) * 100);
  // Programación dinámica por suma en céntimos; el coste es el puesto de cada alternativa (0 = la mejor).
  let layer = new Map<number, { cost: number; back: { prev: number; index: number }[] }>([[0, { cost: 0, back: [] }]]);
  for (const r of rows) {
    const next = new Map<number, { cost: number; back: { prev: number; index: number }[] }>();
    for (const [sum, state] of layer)
      r.alternatives.forEach((alt, index) => {
        const total = sum + Math.round(Number(alt.total) * 100);
        const cost = state.cost + index;
        const at = next.get(total);
        if (!at || cost < at.cost) next.set(total, { cost, back: [...state.back, { prev: sum, index }] });
      });
    if (next.size > 20000) return { picks: best, matched: false };
    layer = next;
  }
  const hit = layer.get(target);
  if (!hit) return { picks: best, matched: false };
  return { picks: hit.back.map((b, i) => rows[i].alternatives[b.index]), matched: true };
}

const clean = (s: string) => s.replace(/[|_{}~=]+/g, " ").replace(/\s+/g, " ").trim();

/** Líneas propuestas a partir de la rejilla; las filas sin combinación que cuadre quedan sin precio y con aviso. */
export function gridLines(grid: Grid, net?: string) {
  const { picks, matched } = chooseRows(grid.rows, net);
  const warnings: string[] = [];
  const lines = grid.rows.flatMap((row, i) => {
    const description = clean([row.cells.description ?? "", ...row.extra].join(" "));
    const code = (row.cells.code ?? "").replace(/\s/g, "");
    const reference = /^[A-Z0-9][A-Z0-9._/-]{3,24}$/.test(code) && /\d/.test(code) ? code : "";
    const brand = clean(row.cells.brand ?? "").replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
    if (description.length < 3) return [];
    const p = picks[i];
    if (!p) {
      const q = row.values.quantity;
      if (!q || !dec(q).gt(0)) return [];
      warnings.push(`Importes sin conciliar: ${description}`);
      return [{ reference, description, quantity: q, unit: "ud", price: "", observedUnitPrice: row.values.price ?? undefined, discount: "0", family: "", brand }];
    }
    const factor = dec(1).minus(dec(p.dto1).div(100)).mul(dec(1).minus(dec(p.dto2).div(100)));
    const discount = dec(1).minus(factor).mul(100).toDecimalPlaces(4).toString();
    try {
      if (documentLineNet(p.quantity, p.price, discount) !== cents(p.total)) throw Error("no cuadra");
    } catch {
      warnings.push(`Importes sin conciliar: ${description}`);
      return [];
    }
    return [{ reference, description, quantity: p.quantity, unit: "ud", price: p.price, discount, family: "", brand }];
  });
  return { lines, matched, warnings };
}

/** Número, fecha y código de cliente de la fila bajo «OFERTA DE VENTA · REFERENCIA · CLIENTE · FECHA». */
export function gridIdentity(identity?: string) {
  const text = (identity ?? "").replace(/\s*\/\s*/g, "/");
  const date = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  const number = text.match(/\b(\d{6,10})\b/)?.[1];
  return { number, date: date ? { d: +date[1], m: +date[2], y: +date[3] } : undefined };
}
