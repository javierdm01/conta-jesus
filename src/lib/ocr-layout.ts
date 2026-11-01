// Tesseract ordena por bloques; en tablas eso separa códigos y precios.
// Reunir las palabras por su posición mantiene cada precio junto a su artículo.
export function layoutWords(tsv: string) {
  return tsv
    .split(/\r?\n/)
    .slice(1)
    .flatMap((row) => {
      const cells = row.split("\t");
      const [level, , , , , , left, top, width, height, confidence] =
        cells.map(Number);
      const text = cells.slice(11).join("\t").trim();
      return level === 5 && text && confidence >= 15 && height > 0
        ? [{ text, left, top, width, height, confidence, y: top + height / 2 }]
        : [];
    });
}
export function layoutRows(tsv: string) {
  const words = layoutWords(tsv);
  if (!words.length) return [];
  const heights = words.map((w) => w.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  const rows: { y: number; words: typeof words }[] = [];
  for (const word of words.sort((a, b) => a.y - b.y || a.left - b.left)) {
    const row = rows.at(-1);
    if (row && Math.abs(word.y - row.y) < median * 0.65) {
      row.y = (row.y * row.words.length + word.y) / (row.words.length + 1);
      row.words.push(word);
    } else rows.push({ y: word.y, words: [word] });
  }
  return rows.map((row) => ({
    ...row,
    words: row.words.sort((a, b) => a.left - b.left),
  }));
}
export function layoutText(tsv: string): string {
  const rows = layoutRows(tsv),
    heights = rows
      .flatMap((r) => r.words.map((w) => w.height))
      .sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 1;
  return rows
    .map((row) => {
      const ordered = row.words.sort((a, b) => a.left - b.left);
      return ordered
        .map((word, i) => {
          if (!i) return word.text;
          const previous = ordered[i - 1];
          return (
            (word.left - previous.left - previous.width > median * 0.75
              ? "  "
              : " ") + word.text
          );
        })
        .join("");
    })
    .join("\n");
}
