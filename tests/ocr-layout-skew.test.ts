import test from "node:test";
import assert from "node:assert/strict";
import { layoutRows } from "../src/lib/ocr-layout";

const head = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const w = (left: number, top: number, text: string) => `5\t1\t1\t1\t1\t1\t${left}\t${top}\t60\t30\t95\t${text}`;
test("una fila ladeada se mantiene unida y no se mezcla con la siguiente", () => {
  // Cada fila sube 4 px cada 100 px; las filas distan 70 px.
  const row = (top: number, t: string[]) => t.map((x, i) => w(100 + i * 300, top - i * 12, x));
  const rows = layoutRows([head, ...row(200, ["COD1", "Cable", "2,00", "5,00"]), ...row(270, ["COD2", "Tubo", "1,00", "3,00"])].join("\n"));
  assert.deepEqual(rows.map((r) => r.words.map((x) => x.text).join(" ")), ["COD1 Cable 2,00 5,00", "COD2 Tubo 1,00 3,00"]);
});
