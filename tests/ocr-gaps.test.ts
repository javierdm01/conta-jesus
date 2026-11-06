import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { fillEmptyCells } from "../worker/ocr-gaps";
import { layoutWords } from "../src/lib/ocr-layout";

const head = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const w = (left: number, top: number, text: string) => `5\t1\t1\t1\t1\t1\t${left}\t${top}\t60\t20\t95\t${text}`;
const row = (top: number, v: string[]) => v.map((t, i) => w(200 + i * 100, top, t));

test("relee una celda numérica omitida usando las columnas de las filas completas", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "gaps-")), "p.png");
  await sharp({ create: { width: 700, height: 400, channels: 3, background: "white" } }).png().toFile(file);
  const tsv = [head, w(10, 10, "CANT"), w(300, 10, "PRECIO"), w(500, 10, "IMPORTE"),
    ...row(100, ["1,00", "2,00", "2,00"]), ...row(150, ["1,00", "3,00", "3,00"]), ...row(200, ["1,00", "8,00"])].join("\n");
  const out = await fillEmptyCells(file, tsv, async () => "8,00\n");
  const added = layoutWords(out).filter(x => x.top === 200 && x.text === "8,00");
  assert.equal(added.length, 2);
  assert.equal(await fillEmptyCells(file, tsv, async () => "basura"), tsv);
});
