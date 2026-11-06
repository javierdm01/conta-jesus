import { layoutWords } from "./ocr-layout";

// Coordenadas como fracciones 0–1 de la página; `c` es la confianza 0–100.
export type Word = { t: string; x: number; y: number; w: number; h: number; c: number };
const frac = (n: number) => Math.round(n * 100000) / 100000;

export function wordsFromTsv(tsv: string, width: number, height: number): Word[] {
  return layoutWords(tsv).map((w) => ({
    t: w.text,
    x: frac(w.left / width),
    y: frac(w.top / height),
    w: frac(w.width / width),
    h: frac(w.height / height),
    c: w.confidence,
  }));
}

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => entities[m]);

// Salida de `pdftotext -bbox-layout` de UNA página: <page width height><word xMin yMin xMax yMax>…
export function wordsFromPdfBbox(xhtml: string): Word[] {
  const page = xhtml.match(/<page[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
  if (!page) return [];
  const [width, height] = [Number(page[1]), Number(page[2])];
  if (!width || !height) return [];
  const words: Word[] = [];
  for (const m of xhtml.matchAll(
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g,
  )) {
    const [x0, y0, x1, y1] = [m[1], m[2], m[3], m[4]].map(Number);
    const t = decode(m[5]).trim();
    if (!t) continue;
    words.push({ t, x: frac(x0 / width), y: frac(y0 / height), w: frac((x1 - x0) / width), h: frac((y1 - y0) / height), c: 100 });
  }
  return words;
}
