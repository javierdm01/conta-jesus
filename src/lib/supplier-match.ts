// Reconocimiento del proveedor: NIF exacto primero y, si no basta, el nombre más parecido.
// Tolera errores típicos del OCR (letras cambiadas o perdidas) sin aceptar nombres lejanos.
export type SupplierRef = { id: string; name: string; taxId: string };
export type SupplierCandidate = { id: string; name: string; score: number };

const LEGAL = new Set([
  "sl", "sa", "slu", "slp", "sau", "sc", "scp", "cb", "sll", "coop", "sociedad", "limitada", "anonima",
]);
// Palabras comunes en nombres de proveedores del sector: pesan poco al decidir.
const GENERIC = new Set([
  "suministros", "suministro", "electricos", "electrico", "electricidad", "material", "materiales",
  "instalaciones", "instalacion", "climatizacion", "distribuciones", "distribucion", "almacen",
  "almacenes", "comercial", "industrial", "industriales", "grupo", "iberica", "iberia", "espana",
  "tecnicos", "tecnica", "tecnicas", "servicios", "fontaneria", "ferreteria", "the", "los", "las",
  "del", "con", "por", "para", "and",
]);

export function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const tokens = (s: string) =>
  normalizeName(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !LEGAL.has(t));

function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function tokenMatch(t: string, pool: Set<string>) {
  if (pool.has(t)) return 1;
  const max = t.length <= 4 ? 0 : t.length <= 7 ? 1 : 2;
  if (!max) return 0;
  for (const p of pool) if (distance(t, p, max) <= max) return 0.85;
  return 0;
}
function coverage(name: string, text: string) {
  const mine = tokens(name);
  if (!mine.length) return 0;
  const pool = new Set(tokens(text));
  let got = 0,
    all = 0;
  for (const t of mine) {
    const w = GENERIC.has(t) ? 0.25 : Math.min(t.length, 8);
    all += w;
    got += w * tokenMatch(t, pool);
  }
  // Un nombre completo y seguido en el texto vale más que palabras sueltas.
  const phrase = normalizeName(name).replace(/\b(sl|sa|slu|slp|sau)\b/g, "").replace(/\s+/g, " ").trim();
  const bonus = phrase.length >= 4 && normalizeName(text).includes(phrase) ? 0.1 : 0;
  return Math.min(1, got / all + bonus);
}
const idOf = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function matchSupplier(text: string, suppliers: SupplierRef[]) {
  const upper = text.toUpperCase();
  const byTaxId = suppliers.filter((s) => {
    const id = idOf(s.taxId);
    return (
      id.length >= 8 &&
      new RegExp(
        `(^|[^A-Z0-9])${id.split("").join("[ .-]?")}([^A-Z0-9]|$)`,
      ).test(upper)
    );
  });
  if (byTaxId.length === 1)
    return { supplierId: byTaxId[0].id, by: "taxId" as const, candidates: [] };
  if (byTaxId.length > 1)
    return { supplierId: undefined, by: "ambiguous" as const, candidates: [] };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^--- P[aá]gina/.test(l));
  const head = lines.slice(0, 14).join(" ");
  const ranked: SupplierCandidate[] = suppliers
    .map((s) => ({
      id: s.id,
      name: s.name,
      score: Math.max(
        coverage(s.name, head),
        0.85 * coverage(s.name, lines.join(" ")),
      ),
    }))
    .filter((c) => c.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return {
    supplierId: ranked[0]?.id,
    by: ranked.length ? ("name" as const) : ("none" as const),
    candidates: ranked.map((c) => ({ ...c, score: Math.round(c.score * 100) / 100 })),
  };
}
