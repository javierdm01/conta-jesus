import type { Word } from "./ocr-words";

/** Recuadro [x, y, ancho, alto] en fracciones 0–1 de la página. */
export type Rect = [number, number, number, number];

/** Palabras cuyo centro cae en el recuadro, agrupadas por filas visuales (de arriba abajo). */
export function pickRows(words: Word[], [x, y, w, h]: Rect): string[] {
  const inside = words
    .filter((p) => p.x + p.w / 2 >= x && p.x + p.w / 2 <= x + w && p.y + p.h / 2 >= y && p.y + p.h / 2 <= y + h)
    .sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: Word[][] = [];
  for (const word of inside) {
    const row = rows.at(-1);
    const center = row && row.reduce((s, p) => s + p.y + p.h / 2, 0) / row.length;
    if (row && Math.abs(word.y + word.h / 2 - center!) < word.h * 0.6) row.push(word);
    else rows.push([word]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x).map((p) => p.t).join(" "));
}

const NUMERIC = new Set(["net", "tax", "quantity", "price", "discount"]);
/** Convierte el texto leído al formato del campo; devuelve "" si no hay un valor válido. */
export function fieldValue(field: string, text: string): string {
  const t = text.trim();
  if (NUMERIC.has(field)) {
    const m = t.match(/-?\d[\d.,]*/)?.[0].replace(/[.,]$/, "");
    if (!m) return "";
    const comma = m.lastIndexOf(","), dot = m.lastIndexOf(".");
    // El último separador es el decimal; el otro, de miles.
    return comma > dot ? m.replace(/\./g, "").replace(",", ".") : m.replace(/,/g, "");
  }
  if (field === "date") {
    const m = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})/);
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
  }
  if (field === "reference" || field === "model") return t.replace(/\s+/g, "");
  return t.replace(/\s+/g, " ");
}
