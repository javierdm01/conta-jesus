import { dec, documentLineNet } from "./money";
/** Elegir entre lecturas de los píxeles, sin fabricar decimales ni resolver importes ausentes. */
export type OcrNumericCandidate = { values: string[]; score: number };
export function ocrCellCandidates(
  cells: string[][],
  recoverAmountScale = false,
): OcrNumericCandidate[] {
  if (cells.length !== 4) return [];
  const candidates = cells.map((reads, index) => {
    const counts = new Map<string, number>();
    for (const read of reads) {
      let value = read.trim().replace(/\s|%|€/g, "");
      if (value.includes(","))
        value = value.replace(/\.(?=\d{3}(?:\.|,))/g, "").replace(",", ".");
      if (!/^-?\d+(?:\.\d+)?$/.test(value)) continue;
      const n = dec(value),
        max = index === 0 ? 999999 : index === 2 ? 100 : 999999999;
      if (
        n.abs().gt(max) ||
        (index > 0 && n.lt(0)) ||
        n.decimalPlaces() > (index === 3 ? 2 : 4) ||
        (index === 0 && n.isZero())
      )
        continue;
      const key = n.toFixed();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (recoverAmountScale && index === 3 && /^-?\d{3,}$/.test(value)) {
        const recovered = n.div(100).toFixed(2);
        counts.set(recovered, (counts.get(recovered) ?? 0) + 0.25);
      }
    }
    return [...counts]
      .map(([value, score]) => ({ value, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  });
  const valid: { values: string[]; score: number }[] = [];
  for (const q of candidates[0])
    for (const p of candidates[1])
      for (const d of candidates[2])
        for (const t of candidates[3]) {
          try {
            if (dec(documentLineNet(q.value, p.value, d.value)).eq(t.value))
              valid.push({
                values: [q.value, p.value, d.value, t.value],
                score: q.score + p.score + d.score + t.score,
              });
          } catch {}
        }
  valid.sort((a, b) => b.score - a.score);
  return valid;
}
export function reconcileOcrCells(cells: string[][]): string[] | null {
  const valid = ocrCellCandidates(cells);
  if (!valid.length || (valid.length > 1 && valid[0].score === valid[1].score))
    return null;
  return valid[0].values;
}
export function reconcileOcrTable(
  rows: OcrNumericCandidate[][],
  net: string,
): string[][] | null {
  type State = { score: number; rows: string[][]; ambiguous: boolean };
  let states = new Map<string, State>([
    ["0", { score: 0, rows: [], ambiguous: false }],
  ]);
  const positive = rows.every((r) => r.every((c) => dec(c.values[3]).gte(0)));
  for (const row of rows) {
    const next = new Map<string, State>();
    for (const [amount, state] of states)
      for (const candidate of row.slice(0, 32)) {
        const total = dec(amount).plus(candidate.values[3]);
        if (positive && total.gt(net)) continue;
        const key = total.toFixed(2),
          score = state.score + candidate.score,
          existing = next.get(key);
        if (!existing || score > existing.score)
          next.set(key, {
            score,
            rows: [...state.rows, candidate.values],
            ambiguous: state.ambiguous,
          });
        else if (score === existing.score) existing.ambiguous = true;
      }
    if (next.size > 5000) return null;
    states = next;
  }
  const best = states.get(dec(net).toFixed(2));
  return best && !best.ambiguous ? best.rows : null;
}
