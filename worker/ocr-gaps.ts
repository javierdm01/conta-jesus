import path from "node:path";
import sharp from "sharp";
import { layoutRows } from "../src/lib/ocr-layout";

type Run = (command: string, args: string[]) => Promise<string>;
const num = (t: string) => /^-?\d+[.,]\d{1,6}$/.test(t.replace(/[€\s)|}\]]/g, ""));
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();

type Rows = ReturnType<typeof layoutRows>;
/** Columnas numéricas deducidas de la posición real de los números en las filas completas. */
export function numericColumns(rows: Rows, head: number) {
  const quantityLeft = rows[head].words.find(w => /^CANT/.test(norm(w.text)))!.left - 60;
  const body: { y: number; nums: Rows[0]["words"] }[] = [];
  for (const row of rows.slice(head + 1)) {
    if (/PRODUCTOR|BASE\s*IMP|IMP\.?\s*BRUTO|INFORMACI[OÓ]N|FORMA DE PAGO/i.test(row.words.map(w => w.text).join(" "))) break;
    const nums = row.words.filter(w => w.left >= quantityLeft && num(w.text));
    if (nums.length >= 2) body.push({ y: row.y, nums });
  }
  const sizes = body.map(b => b.nums.length);
  const size = sizes.sort((a, b) => sizes.filter(v => v === b).length - sizes.filter(v => v === a).length)[0];
  const full = body.filter(b => b.nums.length === size);
  if (full.length < 1 || size < 3) return null;
  const columns = Array.from({ length: size }, (_, k) => ({
    left: Math.min(...full.map(b => b.nums[k].left)),
    right: Math.max(...full.map(b => b.nums[k].left + b.nums[k].width)),
  }));
  return { body, size, full, columns };
}

/**
 * Tesseract a veces omite una celda numérica suelta de una tabla. Las columnas se deducen
 * de la posición real de los números en las filas completas (no de la cabecera, que suele
 * ir centrada) y la celda ausente se relee recortada. Devuelve el TSV con las celdas añadidas.
 */
export async function fillEmptyCells(file: string, tsv: string, run: Run) {
  const rows = layoutRows(tsv);
  const head = rows.findIndex(r => r.words.some(w => /^CANT/.test(norm(w.text))) && r.words.some(w => norm(w.text) === "PRECIO"));
  if (head < 0) return tsv;
  const found = numericColumns(rows, head);
  if (!found || found.full.length < 2) return tsv;
  const { body, size, full, columns } = found;
  const height = Math.max(...full.map(b => b.nums[0].height));
  const meta = await sharp(file).metadata();
  const added: string[] = [];
  for (const [n, row] of body.filter(b => b.nums.length < size && b.nums.length >= size - 2).entries()) {
    for (const [k, c] of columns.entries()) {
      if (row.nums.some(w => w.left + w.width / 2 >= c.left - 10 && w.left + w.width / 2 <= c.right + 10)) continue;
      const left = Math.max(0, Math.floor(c.left - 12)), top = Math.max(0, Math.floor(row.y - height));
      const width = Math.min(meta.width! - left, Math.ceil(c.right - c.left + 24)), h = Math.min(meta.height! - top, Math.ceil(height * 2));
      if (width < 5 || h < 5) continue;
      const crop = path.join(path.dirname(file), `gap-${path.basename(file)}-${n}-${k}.png`);
      await sharp(file).extract({ left, top, width, height: h }).greyscale().normalize().resize({ width: width * 3 })
        .extend({ top: 15, bottom: 15, left: 15, right: 15, background: "white" }).png().toFile(crop);
      const text = (await run(process.env.TESSERACT_PATH ?? "tesseract", [crop, "stdout", "-l", "eng", "--psm", "7", "-c", "tessedit_char_whitelist=0123456789.,-€"])).trim().replace(/[€\s]/g, "");
      if (/^-?\d+[.,]\d{2}$/.test(text))
        added.push(`5\t1\t1\t1\t1\t1\t${Math.round(c.left)}\t${Math.round(row.y - height / 2)}\t${Math.round(c.right - c.left)}\t${Math.round(height)}\t90\t${text}`);
    }
  }
  return added.length ? `${tsv.replace(/\s+$/, "")}\n${added.join("\n")}\n` : tsv;
}
