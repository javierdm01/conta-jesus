import path from "node:path";
import sharp from "sharp";
import { layoutRows } from "../src/lib/ocr-layout";
import { dec } from "../src/lib/money";
import { numberInkBounds } from "./ocr-ink";

type Run = (command: string, args: string[]) => Promise<string>;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
const amount = /^\d{1,7}[.,]\d{2}$/;

/**
 * Caja «Base imponible / % IVA / Importe IVA»: sus cifras son pequeñas y los bordes las cortan en la
 * lectura de página. Cada celda se relee bajo su rótulo y solo se acepta la combinación que cuadra
 * con el total impreso (base + cuota = total y cuota ≈ base × tipo).
 */
export async function readFiscalBox(footer: string, total: string, run: Run) {
  const tesseract = process.env.TESSERACT_PATH ?? "tesseract";
  const tsv = await run(tesseract, [footer, "stdout", "-l", "eng", "--psm", "6", "tsv"]);
  const base = layoutRows(tsv).flatMap(r => r.words).find(w => norm(w.text) === "BASE");
  if (!base) return null;
  const meta = await sharp(footer).metadata();
  const top = Math.max(0, Math.floor(base.top + base.height * 1.3)), height = Math.min(meta.height! - top, Math.ceil(base.height * 1.5));
  // Las celdas van entre las líneas verticales de la caja: filas de píxeles oscuros continuos.
  const bandTop = Math.floor(base.top), bandHeight = Math.min(meta.height! - bandTop, Math.ceil(base.height * 5));
  const band = await sharp(footer).extract({ left: 0, top: bandTop, width: meta.width!, height: bandHeight }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const dark = Array.from({ length: band.info.width }, (_, x) => {
    let n = 0;
    for (let y = 0; y < bandHeight; y++) if (band.data[y * band.info.width + x] < 90) n++;
    return n / bandHeight > 0.7;
  });
  const borders: number[] = [];
  for (let x = 0; x < dark.length; x++) if (dark[x] && !dark[x - 1]) borders.push(x);
  const first = borders.filter(x => x < base.left).at(-1), after = borders.filter(x => x > base.left);
  if (first === undefined || after.length < 3) return null;
  const cells = [[first + 12, after[0] - 10], [after[0] + 12, after[1] - 10], [after[1] + 12, after[2] - 10]];
  const otsu = (g: Uint8Array) => {
    const h = new Array(256).fill(0);
    for (const v of g) h[v]++;
    let sum = 0, wb = 0, sb = 0, best = 0, t = 128;
    h.forEach((n, i) => (sum += i * n));
    for (let i = 0; i < 256; i++) {
      wb += h[i];
      if (!wb || wb === g.length) continue;
      sb += i * h[i];
      const between = wb * (g.length - wb) * (sb / wb - (sum - sb) / (g.length - wb)) ** 2;
      if (between > best) [best, t] = [between, i];
    }
    return t;
  };
  const read = async (left: number, right: number, k: number) => {
    left = Math.max(0, Math.floor(left));
    const width = Math.min(meta.width! - left, Math.ceil(right - left));
    if (width < 20 || height < 10) return [] as string[];
    const raw = await sharp(footer).extract({ left, top, width, height }).greyscale().normalize().raw().toBuffer({ resolveWithObject: true });
    const t = otsu(raw.data), binary = Buffer.from(raw.data.map(v => (v < t ? 0 : 255)));
    const box = numberInkBounds(binary, raw.info.width, raw.info.height);
    if (!box) return [];
    const crop = path.join(path.dirname(footer), `fiscal-${k}.png`);
    await sharp(binary, { raw: { width: raw.info.width, height: raw.info.height, channels: 1 } })
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .resize({ height: Math.max(80, box.height * 3) }).extend({ top: 25, bottom: 25, left: 25, right: 25, background: "white" }).png().toFile(crop);
    const out = await run(tesseract, [crop, "stdout", "-l", "eng", "--psm", "7", "-c", "tessedit_char_whitelist=0123456789.,"]);
    return out.split(/\s+/).filter(x => amount.test(x)).map(x => x.replace(",", "."));
  };
  const [nets, rates, taxes] = await Promise.all(cells.map(([l, r], k) => read(l, r, k)));
  const sum = dec(total.replace(",", "."));
  for (const n of nets) for (const t of taxes) {
    if (!dec(n).plus(t).eq(sum)) continue;
    const r = rates.find(x => dec(n).mul(x).div(100).minus(t).abs().lte(0.02));
    if (r) return { net: n, tax: t, rate: r };
  }
  return null;
}
