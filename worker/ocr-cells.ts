import path from "node:path";
import sharp from "sharp";
import { numberInkBounds, visibleDecimal } from "./ocr-ink";
import {
  ocrCellCandidates,
  reconcileOcrTable,
  type OcrNumericCandidate,
} from "../src/lib/ocr-numbers";
import { parseOcr } from "../src/lib/ocr";
import { layoutRows, layoutText, layoutWords } from "../src/lib/ocr-layout";
type Run = (command: string, args: string[]) => Promise<string>;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/gi, "")
    .toUpperCase();
export async function readTableCells(file: string, tsv: string, run: Run) {
  const rows = layoutRows(tsv),
    words = layoutWords(tsv),
    meta = await sharp(file).metadata();
  let serial = 0,
    lastConfidence = 0;
  const cropRead = async (
    left: number,
    top: number,
    width: number,
    height: number,
    digits = false,
    mode = "gray",
  ) => {
    left = Math.max(0, Math.floor(left));
    top = Math.max(0, Math.floor(top));
    width = Math.min(meta.width! - left, Math.ceil(width));
    height = Math.min(meta.height! - top, Math.ceil(height));
    if (width < 5 || height < 5) return "";
    const crop = path.join(
      path.dirname(file),
      `cell-${path.basename(file)}-${serial++}.png`,
    );
    let pipeline = sharp(file).extract({ left, top, width, height });
    let punctuation: ReturnType<typeof visibleDecimal> = null;
    if (digits) {
      const raw = await pipeline
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const box = numberInkBounds(raw.data, raw.info.width, raw.info.height);
      if (box) {
        pipeline = sharp(raw.data, {
          raw: { width: raw.info.width, height: raw.info.height, channels: 1 },
        })
          .extract({
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          })
          .resize({ width: box.width * 3 });
        const enlarged = await pipeline
          .clone()
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        punctuation = visibleDecimal(
          enlarged.data,
          enlarged.info.width,
          enlarged.info.height,
        );
      }
    } else pipeline = pipeline.resize({ height: Math.max(height, 75) });
    if (mode === "binary") pipeline = pipeline.threshold(210);
    if (mode === "binary200") pipeline = pipeline.threshold(200);
    await pipeline
      .extend({ top: 15, bottom: 15, left: 15, right: 15, background: "white" })
      .png()
      .toFile(crop);
    const args = [
      crop,
      "stdout",
      "-l",
      "eng",
      "--psm",
      mode === "word" ? "8" : "7",
    ];
    if (digits) args.push("-c", "tessedit_char_whitelist=0123456789.,-%");
    if (!digits) args.push("tsv");
    const output = (
      await run(process.env.TESSERACT_PATH ?? "tesseract", args)
    ).trim();
    let text = output;
    if (!digits) {
      const words = layoutWords(output);
      text = words.map((w) => w.text).join(" ");
      lastConfidence = words.length
        ? words.reduce((sum, w) => sum + w.confidence * w.text.length, 0) /
          words.reduce((sum, w) => sum + w.text.length, 0)
        : 0;
    }
    const compact = text.replace(/\s/g, "");
    if (
      digits &&
      punctuation &&
      /^-?\d+$/.test(compact) &&
      compact.replace("-", "").length === punctuation.digits
    ) {
      const sign = compact.startsWith("-") ? "-" : "",
        numbers = compact.replace("-", "");
      return `${sign}${numbers.slice(0, punctuation.after)}.${numbers.slice(punctuation.after)}`;
    }
    return text;
  };
  const headerIndex = rows.findIndex(
    (r) =>
      r.words.some((w) => norm(w.text) === "CANTIDAD") &&
      r.words.some((w) => norm(w.text) === "PRECIO") &&
      norm(r.words.map((w) => w.text).join("")).includes("IMPORTE"),
  );
  if (headerIndex < 0) return layoutText(tsv);
  const header = rows[headerIndex].words;
  const headerWord = (name: string) => {
    for (let i = 0; i < header.length; i++)
      for (let count = 1; count <= 3 && i + count <= header.length; count++) {
        const parts = header.slice(i, i + count);
        if (norm(parts.map((p) => p.text).join("")) === name)
          return {
            ...parts[0],
            text: name,
            width: parts.at(-1)!.left + parts.at(-1)!.width - parts[0].left,
          };
      }
    return undefined;
  };
  const columnWords = ["CANTIDAD", "PRECIO", "DTO", "IMPORTE"].map((n) =>
    headerWord(n),
  );
  if (columnWords.some((w) => !w)) return layoutText(tsv);
  const columns = columnWords.map((w) => w!);
  const centers = columns.map((w) => w.left + w.width / 2);
  const boundaries = [
    columns[0].left - 35,
    ...centers.slice(1).map((v, i) => (v + centers[i]) / 2),
    meta.width! - 5,
  ];
  const pending: {
    index: number;
    prefix: string;
    candidates: OcrNumericCandidate[];
    readings: string[][];
  }[] = [];
  const auxiliary = new Map<
    number,
    {
      rows: { index: number; abb: boolean; brand: string }[];
      votes: Map<string, number>;
    }
  >();
  let currentProduct: number | undefined;
  let count = 0;
  const deadline = Date.now() + 120_000;
  for (
    let i = headerIndex + 1;
    i < rows.length && count < 100 && Date.now() < deadline;
    i++
  ) {
    const row = rows[i],
      text = row.words.map((w) => w.text).join(" ");
    if (
      /PRODUCTOR|BASE\s*IMP|TOTAL\s*ALBAR|IMP\s*BRUTO|INFORMACI[OÓ]N/i.test(
        text,
      )
    )
      break;
    const abb = row.words.findIndex((w) => norm(w.text) === "ABB"),
      prov = row.words.findIndex((w) => /^(REF)?PROV$/.test(norm(w.text)));
    if (currentProduct !== undefined && (abb >= 0 || prov >= 0)) {
      const start = (abb >= 0 ? abb : prov) + 1,
        marca = row.words.findIndex((w) => norm(w.text) === "MARCA");
      const parts = row.words.slice(start, marca >= start ? marca : undefined);
      const original = parts.map((w) => w.text).join(" ");
      if (parts.length && /\d/.test(original) && original.length < 30) {
        const group = auxiliary.get(currentProduct) ?? {
          rows: [],
          votes: new Map<string, number>(),
        };
        group.rows.push({
          index: i,
          abb: abb >= 0,
          brand:
            marca >= 0
              ? row.words
                  .slice(marca + 1)
                  .map((w) => w.text)
                  .join(" ")
              : "",
        });
        const add = (value: string, score: number) => {
          const key = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const originalKey = original.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (
            /\d/.test(key) &&
            key.length >= originalKey.length * 0.8 &&
            key.length <= originalKey.length * 1.2
          )
            group.votes.set(key, (group.votes.get(key) ?? 0) + score);
        };
        add(original, 0.5);
        const left = Math.min(...parts.map((w) => w.left)) - 5,
          top = Math.min(...parts.map((w) => w.top)) - 5;
        const right = Math.max(...parts.map((w) => w.left + w.width)) + 5,
          bottom = Math.max(...parts.map((w) => w.top + w.height)) + 5;
        for (const mode of ["gray", "binary", "binary200"]) {
          const text = await cropRead(
            left,
            top,
            right - left,
            bottom - top,
            false,
            mode,
          );
          add(text, 1 + lastConfidence / 100);
        }
        auxiliary.set(currentProduct, group);
      }
      continue;
    }
    const prefixWords = row.words.filter((w) => w.left < boundaries[0]);
    if (!prefixWords.some((w) => /[A-Za-zÁÉÍÓÚÑ]/.test(w.text))) continue;
    const regions = columns.map((_, index) =>
      row.words.filter(
        (w) =>
          w.left + w.width / 2 >= boundaries[index] &&
          w.left + w.width / 2 < boundaries[index + 1] &&
          /\d/.test(w.text),
      ),
    );
    if (regions.filter((r) => r.length).length < 2) continue;
    const numericWords = regions.flat();
    const median = (v: number[]) =>
      v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const center = median(numericWords.map((w) => w.top + w.height / 2)),
      height = median(numericWords.map((w) => w.height));
    const top = center - height * 0.65 - 3,
      bottom = center + height * 0.65 + 3;
    const readings: string[][] = [];
    for (let j = 0; j < 4; j++) {
      const values = [regions[j].map((w) => w.text).join("")];
      for (const mode of ["gray", "binary", "word", "binary200"]) {
        values.push(
          await cropRead(
            boundaries[j] + 2,
            top,
            boundaries[j + 1] - boundaries[j] - 4,
            bottom - top,
            true,
            mode,
          ),
        );
      }
      readings.push(values);
    }
    const candidates = ocrCellCandidates(readings);
    // Retener filas cuyos dígitos son legibles aunque una coma se haya perdido.
    // Solo se recuperarán si concilian con toda la tabla y su base impresa.
    if (!candidates.length && !ocrCellCandidates(readings, true).length) continue;
    const reference = prefixWords.find((w) => /\d{4}/.test(w.text));
    const code = reference?.text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    let prefix = prefixWords
      .sort((a, b) => a.left - b.left)
      .map((w, index) => `${index ? "  " : ""}${w.text}`)
      .join("");
    if (reference && code) {
      const descriptionHeader = header.find(
        (w) => norm(w.text) === "DESCRIPCION" || norm(w.text) === "DE",
      );
      if (descriptionHeader) {
        const descriptions: { text: string; confidence: number }[] = [];
        for (const mode of ["gray", "binary", "binary200"]) {
          const text = await cropRead(
            descriptionHeader.left - 10,
            top,
            boundaries[0] - descriptionHeader.left + 5,
            bottom - top,
            false,
            mode,
          );
          const baseline = prefixWords
            .filter((w) => w !== reference && w.left > reference.left)
            .map((w) => w.text)
            .join(" ");
          const anchors =
            baseline.toUpperCase().match(/[A-ZÁÉÍÓÚÑ]{6,}/g) ?? [];
          if (
            text.length > baseline.length * 0.8 &&
            text.length <= baseline.length + 3 &&
            text.length < 200 &&
            (!anchors.length ||
              anchors.filter((a) => text.toUpperCase().includes(a)).length >=
                Math.ceil(anchors.length / 2))
          )
            descriptions.push({ text, confidence: lastConfidence });
        }
        descriptions.sort((a, b) => b.confidence - a.confidence);
        if (descriptions.length) prefix = `${code}  ${descriptions[0].text}`;
      } else prefix = prefix.replace(reference.text, code);
    }
    pending.push({ index: i, prefix, candidates, readings });
    currentProduct = pending.length - 1;
    count++;
  }
  const formatted = layoutText(tsv)
    .split("\n")
    .map((line) => line.replace(/IMP\s+ORTE/g, "IMPORTE"));
  for (const group of auxiliary.values()) {
    const winner = [...group.votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (winner)
      for (const r of group.rows)
        formatted[r.index] = r.abb
          ? `ABB ${winner}`
          : `Ref.Prov: ${winner} Marca: ${r.brand}`;
  }
  const net = parseOcr(formatted.join("\n")).net;
  let chosen = net
    ? reconcileOcrTable(
        pending.map((p) => p.candidates),
        net,
      )
    : null;
  if (
    !chosen &&
    net &&
    pending.filter((p) =>
      p.readings[3].some((v) => /^-?\d+[.,]\d{2}$/.test(v.trim())),
    ).length >= 2
  ) {
    chosen = reconcileOcrTable(
      pending.map((p) => ocrCellCandidates(p.readings, true)),
      net,
    );
    if (chosen) formatted.push("[OCR_DECIMAL_COLUMN]");
  }
  for (const [index, p] of pending.entries()) {
    const values =
      chosen?.[index] ??
      (p.candidates.length === 1 ||
      p.candidates[0].score > p.candidates[1].score
        ? p.candidates[0].values
        : null);
    if (values) formatted[p.index] = `${p.prefix}  ${values.join("  ")}`;
  }
  // Releer el número junto a la fecha cuando la cabecera no lo etiqueta en la misma fila.
  const title = words.find(
    (w) =>
      /^(ALBAR[AÁ]N|FACTURA)$/i.test(w.text) && w.top < rows[headerIndex].y,
  );
  if (title) {
    const date = words.find(
      (w) =>
        /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(w.text) &&
        w.top > title.top + title.height &&
        w.top < title.top + title.height * 5 &&
        w.left > title.left,
    );
    if (date) {
      const value = (
        await cropRead(
          5,
          date.top - 12,
          date.left - 35,
          date.height + 24,
          false,
        )
      ).replace(/\s/g, "");
      if (/^\d{5,20}$/.test(value))
        formatted.unshift(
          `${norm(title.text) === "ALBARAN" ? "Albarán" : "Factura"} Nº ${value}`,
        );
    }
  }
  return formatted.join("\n");
}
