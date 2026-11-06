import { test } from "node:test";
import assert from "node:assert/strict";
import { wordsFromTsv, wordsFromPdfBbox } from "../src/lib/ocr-words";

const header =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const row = (level: number, l: number, t: number, w: number, h: number, c: number, text: string) =>
  `${level}\t1\t1\t1\t1\t1\t${l}\t${t}\t${w}\t${h}\t${c}\t${text}`;

test("wordsFromTsv convierte píxeles a fracciones", () => {
  const tsv = [header, row(5, 100, 50, 200, 40, 90, "Total")].join("\n");
  assert.deepEqual(wordsFromTsv(tsv, 1000, 500), [
    { t: "Total", x: 0.1, y: 0.1, w: 0.2, h: 0.08, c: 90 },
  ]);
});

test("wordsFromTsv descarta confianza baja, texto vacío y niveles distintos de 5", () => {
  const tsv = [
    header,
    row(5, 10, 10, 10, 10, 10, "bajo"),
    row(5, 10, 10, 10, 10, 90, ""),
    row(4, 10, 10, 10, 10, 90, "linea"),
    row(5, 10, 10, 10, 10, 90, "bueno"),
  ].join("\n");
  assert.deepEqual(
    wordsFromTsv(tsv, 100, 100).map((w) => w.t),
    ["bueno"],
  );
});

test("wordsFromPdfBbox normaliza por el tamaño de página y decodifica entidades", () => {
  const xhtml = `<page width="600" height="800"><word xMin="60" yMin="80" xMax="120" yMax="96">IVA</word><word xMin="0" yMin="0" xMax="60" yMax="16">A&amp;B</word></page>`;
  const words = wordsFromPdfBbox(xhtml);
  assert.deepEqual(words[0], { t: "IVA", x: 0.1, y: 0.1, w: 0.1, h: 0.02, c: 100 });
  assert.equal(words[1].t, "A&B");
});
