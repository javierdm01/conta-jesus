import type { OcrSuggestion } from "./ocr";
import type { Word } from "./ocr-words";

export type Box = [number, number, number, number];
export type Ev = { page: number; box: Box; approx: boolean };
export type LineEv = Partial<
  Record<"description" | "quantity" | "unit" | "price" | "discount", Ev | null>
>;
export type Evidence = {
  number?: Ev | null;
  date?: Ev | null;
  net?: Ev | null;
  tax?: Ev | null;
  total?: Ev | null;
  supplier?: Ev | null;
  lines: LineEv[];
};
export type PageWords = { page: number; words: Word[] };
type Suggestion = Pick<
  OcrSuggestion,
  "number" | "date" | "net" | "tax" | "total" | "supplier" | "lines"
>;
type Placed = Word & { page: number; row: number };

const cy = (w: Word) => w.y + w.h / 2;
const union = (words: Word[]): Box => {
  const x0 = Math.min(...words.map((w) => w.x)),
    y0 = Math.min(...words.map((w) => w.y)),
    x1 = Math.max(...words.map((w) => w.x + w.w)),
    y1 = Math.max(...words.map((w) => w.y + w.h));
  return [x0, y0, x1 - x0, y1 - y0].map((n) => Math.round(n * 100000) / 100000) as Box;
};
const alnum = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

// Importes y cantidades: admite 1.234,56 · 1234.56 · 31,00 · 31 €
function amount(s: string): number | null {
  const t = s.replace(/[€\s%]/g, "");
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const dot = t.lastIndexOf("."),
    comma = t.lastIndexOf(",");
  let normalized = t;
  if (dot >= 0 && comma >= 0)
    normalized =
      dot > comma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
  else if (comma >= 0) normalized = t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normalized = t.replace(/\./g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
const sameAmount = (word: string, value: string) => {
  const a = amount(word),
    b = amount(value);
  return a !== null && b !== null && Math.abs(a - b) < 0.0051;
};
function sameDate(word: string, iso: string) {
  const m = word.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/),
    v = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || !v) return false;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return Number(m[1]) === Number(v[3]) && Number(m[2]) === Number(v[2]) && year === Number(v[1]);
}

// Reunir palabras en filas por su posición vertical y ordenarlas en orden de lectura.
function place(pages: PageWords[]): Placed[] {
  const out: Placed[] = [];
  for (const { page, words } of pages) {
    if (!words.length) continue;
    const heights = words.map((w) => w.h).sort((a, b) => a - b),
      median = heights[Math.floor(heights.length / 2)] || 0.01;
    const sorted = [...words].sort((a, b) => cy(a) - cy(b) || a.x - b.x);
    const rows: { y: number; words: Word[] }[] = [];
    for (const w of sorted) {
      const r = rows.at(-1);
      if (r && Math.abs(cy(w) - r.y) < median * 0.6) {
        r.y = (r.y * r.words.length + cy(w)) / (r.words.length + 1);
        r.words.push(w);
      } else rows.push({ y: cy(w), words: [w] });
    }
    rows.forEach((r, i) =>
      r.words.sort((a, b) => a.x - b.x).forEach((w) => out.push({ ...w, page, row: i })),
    );
  }
  return out;
}

const LABEL: Record<string, RegExp> = {
  number: /^(n[º°o.]?|num|número|numero|factura|albar[aá]n|doc)/i,
  date: /^fecha/i,
  net: /^(base|neto|subtotal|imponible)/i,
  tax: /^(iva|cuota|impuesto)/i,
  total: /^total/i,
};

// Candidato más cercano a su etiqueta; si hay ambigüedad real, el recuadro es aproximado.
function choose(
  candidates: Placed[],
  all: Placed[],
  field: keyof typeof LABEL,
): Ev | null {
  if (!candidates.length) return null;
  const labels = all.filter((w) => LABEL[field].test(w.t));
  const distance = (c: Placed) => {
    let best = Infinity;
    for (const l of labels) {
      if (l.page !== c.page || l === c) continue;
      const dy = cy(c) - cy(l);
      if (Math.abs(dy) > 0.03 + l.h && !(dy > 0 && dy < 0.06)) continue;
      const dx = c.x - (l.x + l.w);
      best = Math.min(best, Math.hypot(Math.abs(dx), Math.abs(dy) * 2) + (dx < -0.01 ? 1 : 0));
    }
    return best;
  };
  const scored = candidates
    .map((c, i) => ({ c, i, d: distance(c) }))
    .sort((a, b) => a.d - b.d || a.i - b.i);
  const [first, second] = scored;
  const unique = scored.length === 1;
  const clear = Number.isFinite(first.d) && (!second || second.d - first.d > 0.01);
  return { page: first.c.page, box: union([first.c]), approx: !(unique || clear) };
}

function header(
  all: Placed[],
  field: keyof typeof LABEL,
  matches: (w: Placed) => boolean,
): Ev | null {
  return choose(all.filter(matches), all, field);
}

function lineEvidence(
  line: Suggestion["lines"][number],
  all: Placed[],
  used: Set<string>,
): LineEv {
  const key = (w: Placed) => `${w.page}:${w.row}`;
  const rows = new Map<string, Placed[]>();
  for (const w of all) rows.set(key(w), [...(rows.get(key(w)) ?? []), w]);
  let found: Placed[] | undefined;
  for (const [k, row] of rows) {
    if (used.has(k)) continue;
    const q = row.filter((w) => sameAmount(w.t, line.quantity)),
      p = row.filter((w) => sameAmount(w.t, line.price));
    if (q.length && p.length && (q[0] !== p[0] || q.length + p.length > 2)) {
      found = row;
      used.add(k);
      break;
    }
  }
  if (!found) return { description: null, quantity: null, unit: null, price: null, discount: null };
  const taken = new Set<Placed>();
  const take = (predicate: (w: Placed) => boolean, after = -1) => {
    const w = found!.find((x) => !taken.has(x) && x.x > after && predicate(x));
    if (w) taken.add(w);
    return w;
  };
  const quantity = take((w) => sameAmount(w.t, line.quantity)),
    price = take((w) => sameAmount(w.t, line.price), quantity?.x ?? -1) ?? take((w) => sameAmount(w.t, line.price)),
    discount = Number(line.discount) ? take((w) => sameAmount(w.t, line.discount)) : undefined,
    unit = line.unit ? take((w) => alnum(w.t) === alnum(line.unit)) : undefined;
  const tokens = [...new Set(line.description.split(/\s+/).map(alnum).filter((t) => t.length >= 2))];
  const hits = found.filter((w) => tokens.includes(alnum(w.t)) && !taken.has(w));
  const ev = (w?: Placed): Ev | null => (w ? { page: w.page, box: union([w]), approx: false } : null);
  return {
    description:
      tokens.length && hits.length >= Math.ceil(tokens.length / 2)
        ? {
            page: hits[0].page,
            box: union(hits),
            approx: new Set(hits.map((w) => alnum(w.t))).size < tokens.length,
          }
        : null,
    quantity: ev(quantity),
    unit: ev(unit),
    price: ev(price),
    discount: Number(line.discount) ? ev(discount) : null,
  };
}

export function buildEvidence(s: Suggestion, pages: PageWords[]): Evidence {
  const all = place(pages);
  const out: Evidence = { lines: [] };
  if (s.number) {
    const n = alnum(s.number);
    out.number = header(all, "number", (w) => alnum(w.t) === n);
  }
  if (s.date) out.date = header(all, "date", (w) => sameDate(w.t, s.date!));
  for (const f of ["net", "tax", "total"] as const)
    if (s[f]) out[f] = header(all, f, (w) => sameAmount(w.t, s[f]!));
  if (s.supplier?.name) {
    const tokens = s.supplier.name.split(/\s+/).map(alnum).filter((t) => t.length >= 2).slice(0, 2);
    let hit: Placed[] | null = null;
    if (tokens.length)
      for (let i = 0; i + tokens.length <= all.length && !hit; i++) {
        const slice = all.slice(i, i + tokens.length);
        if (slice.every((w, j) => w.page === slice[0].page && alnum(w.t) === tokens[j])) hit = slice;
      }
    out.supplier = hit ? { page: hit[0].page, box: union(hit), approx: true } : null;
  }
  const used = new Set<string>();
  out.lines = s.lines.map((l) => lineEvidence(l, all, used));
  return out;
}
