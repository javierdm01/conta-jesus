import path from "node:path";
import { layoutWords } from "../src/lib/ocr-layout";
import sharp from "sharp";
import { readTableCells } from "./ocr-cells";
import { tabularText } from "./ocr-tabular";
import { fillEmptyCells } from "./ocr-gaps";
import { readFiscalBox } from "./ocr-footer";
import { uprightPage } from "./scan-page";
import { parseOcr } from "../src/lib/ocr";
import { cents, documentLineNet, sum } from "../src/lib/money";

type Run = (command: string, args: string[]) => Promise<string>;
export async function ocrImage(
  img: string,
  kind: string,
  run: Run,
  workingDirectory = path.dirname(img),
) {
  img = await uprightPage(img, path.join(workingDirectory, `upright-${path.parse(img).name}.png`), run);
  const read = async (file: string, psm: string, cells = false, language="spa+eng") => {
    const tsv = await run(process.env.TESSERACT_PATH ?? "tesseract", [
      file,
      "stdout",
      "-l",
      language,
      "--psm",
      psm,
      "tsv",
    ]);
    if (cells) return { file, tsv, text: await readTableCells(file, tsv, run) };
    const filled = await fillEmptyCells(file, tsv, run);
    return { file, tsv: filled, text: tabularText(filled) };
  };
  const score = (text: string) => {
    const s = parseOcr(text, [], kind);
    const balanced =
      s.net &&
      s.lines.length &&
      s.lines.every((l) => l.price !== "") &&
      cents(
        sum(
          s.lines.map((l) => documentLineNet(l.quantity, l.price, l.discount)),
        ),
      ) === s.net;
    // Los metadatos ausentes se recuperan después de otra variante; no deben decidir qué líneas se leen mejor.
    return s.lines.length * 10 + (balanced ? 20 : 0);
  };
  const candidates: { file: string; tsv: string; text: string }[] = [];
  const prepared = path.join(
    workingDirectory,
    `prepared-${path.parse(img).name}.png`,
  );
  // OpenCV es dependencia local del contenedor; los originales permanecen inmutables.
  const preparation = JSON.parse(
    await run(
      process.env.PYTHON_PATH ??
        (process.platform === "win32" ? "python" : "python3"),
      [path.resolve("scripts/prepare-ocr.py"), img, prepared],
    ),
  ) as { screen: boolean; variants: string[] };
  if (preparation.screen) candidates.push(await read(prepared, "6", true,"eng"));
  else {
    const normalized = path.join(
      workingDirectory,
      `normalized-${path.parse(img).name}.png`,
    );
    await sharp(img)
      .rotate()
      .resize({ width: 3500, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .png()
      .toFile(normalized);
    await run(
      process.env.PYTHON_PATH ??
        (process.platform === "win32" ? "python" : "python3"),
      [path.resolve("scripts/prepare-ocr.py"), normalized, `${prepared}-photo.png`],
    );
    candidates.push(await read(normalized, "3"));
    candidates.push(await read(`${prepared}-photo.png`, "3"));
  }
  const incomplete = (text: string) => {
    const s = parseOcr(text, [], kind);
    return (
      !s.lines.length ||
      !s.date ||
      !s.number ||
      (!s.net && kind !== "DELIVERY") ||
      (!!s.net &&
        s.lines.every((l) => l.price !== "") &&
        !sum(
          s.lines.map((l) => documentLineNet(l.quantity, l.price, l.discount)),
        ).eq(s.net))
    );
  };
  if (!preparation.screen && preparation.variants[2]) {
    candidates.push(await read(preparation.variants[2], "3",false,"eng"));
    candidates.push(await read(preparation.variants[2], "6",false,"eng"));
  }
  // Los pliegues y las líneas de tabla pueden ocultar un resumen pequeño en la página completa.
  if (!preparation.screen && preparation.variants[3] && !candidates.some(c=>{
    const s=parseOcr(c.text,[],kind); return s.net && s.tax && s.total;
  })) {
    const page=preparation.variants[3], meta=await sharp(page).metadata();
    const top=Math.floor(meta.height!*.83), footer=path.join(workingDirectory,"footer.png");
    await sharp(page).extract({left:0,top,width:meta.width!,height:meta.height!-top}).grayscale().normalize().png().toFile(footer);
    const fiscal=await run(process.env.TESSERACT_PATH ?? "tesseract",[footer,"stdout","-l","eng","--psm","6"]);
    // Solo anexar un resumen si base, impuesto y total impresos concilian.
    const s=parseOcr(fiscal,[],kind);
    if(s.net && s.tax && s.total && sum([s.net,s.tax]).eq(s.total)) {
      for(const c of candidates) c.text+=`\nBase imponible: ${s.net}\nCuota IVA: ${s.tax}\nTotal documento: ${s.total}`;
    } else {
      const totals=[...new Set([s.total,...candidates.map(c=>parseOcr(c.text,[],kind).total)].filter(Boolean))];
      const box=totals.length===1 ? await readFiscalBox(footer,totals[0]!,run) : null;
      if(box) for(const c of candidates) c.text+=`\nBase imponible: ${box.net}\nCuota IVA: ${box.tax}\nTotal documento: ${totals[0]}`;
    }
  }
  // La variante binaria también aporta códigos completos cuando un borde de tabla tapa dígitos.
  const binary = await read(preparation.variants[1], "6", preparation.screen, preparation.screen ? "eng" : "spa+eng");
  if (candidates.every((c) => incomplete(c.text))) candidates.push(binary);
  const winner = candidates.reduce((a, b) =>
    score(b.text) > score(a.text) ? b : a,
  );
  let best = winner.text;
  const references = new Set(
    parseOcr(best, [], kind)
      .lines.map((l) => l.reference)
      .filter(Boolean),
  );
  const metadata = await sharp(winner.file).metadata();
  let retried = 0;
  for (const word of layoutWords(winner.tsv)) {
    if (
      !references.has(word.text) ||
      /^\d+$/.test(word.text) ||
      (word.confidence >= 80 && !/[O0]{2,}/.test(word.text)) ||
      retried >= 25
    )
      continue;
    const crop = path.join(workingDirectory, `reference-${retried++}.png`);
    const left = Math.max(0, word.left - 12),
      top = Math.max(0, word.top - 12);
    await sharp(winner.file)
      .extract({
        left,
        top,
        width: Math.min(word.width + 24, metadata.width! - left),
        height: Math.min(word.height + 24, metadata.height! - top),
      })
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: "white" })
      .png()
      .toFile(crop);
    const corrected = (
      await run(process.env.TESSERACT_PATH ?? "tesseract", [
        crop,
        "stdout",
        "-l",
        "spa+eng",
        "--psm",
        "7",
      ])
    ).trim();
    if (
      /^[A-Z0-9][A-Z0-9._/-]{3,24}$/.test(corrected) &&
      corrected.length === word.text.length
    )
      best = best.replace(word.text, corrected);
  }
  // Un borde de tabla puede tapar los primeros dígitos de un código; otra variante lo lee completo.
  const words = [...new Set([...candidates, binary].flatMap((c) => layoutWords(c.tsv).map((w) => w.text)))];
  for (const r of references) {
    const longer = words.filter((t) => t.length > r.length && t.length <= r.length + 4 && t.endsWith(r) && /^[A-Z0-9]+$/.test(t));
    if (longer.length === 1) best = best.replace(new RegExp(`(?<![A-Z0-9,.])${r}(?![A-Z0-9])`, "g"), longer[0]);
  }
  // Recuperar solo metadatos ausentes de otra segmentación de la MISMA página.
  const main = parseOcr(best, [], kind);
  for (const key of ["number", "date", "net", "tax", "total"] as const) {
    if (main[key]) continue;
    const values = [
      ...new Set(
        candidates.map((t) => parseOcr(t.text, [], kind)[key]).filter(Boolean),
      ),
    ];
    if (values.length !== 1) continue;
    const label = {
      number: "Factura Nº",
      date: "Fecha factura:",
      net: "Base imponible:",
      tax: "Cuota IVA:",
      total: "Total documento:",
    }[key];
    best += `\n${label} ${values[0]}`;
  }
  return best;
}
