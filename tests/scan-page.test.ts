import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { scanPage } from "../worker/scan-page";

const python = process.env.PYTHON_PATH ?? (process.platform === "win32" ? "python" : "python3");
const hasCv = (() => {
  try { execFileSync(python, ["-c", "import cv2"], { stdio: "ignore" }); return true; } catch { return false; }
})();
const run = (command: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(command, args, (e, out) => (e ? reject(e) : resolve(out))),
  );
const text = `<g font-family="Arial" font-size="42" fill="black"><text x="80" y="140">FACTURA F-001</text><text x="80" y="260">Total 37,51</text></g>`;

test("foto sobre fondo oscuro: recorta, quita la sombra y limita el tamaño", { skip: !hasCv }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "scan-"));
  const page = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><defs><linearGradient id="g"><stop offset="0" stop-color="#bbb"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="1200" height="1600" fill="url(#g)"/>${text}</svg>`)).png().toBuffer();
  const input = path.join(dir, "in.png");
  await sharp({ create: { width: 1400, height: 1800, channels: 3, background: "#222" } })
    .composite([{ input: await sharp(page).rotate(3, { background: "#222" }).toBuffer(), gravity: "centre" }])
    .png().toFile(input);
  const output = path.join(dir, "out.jpg");
  const r = await scanPage(input, output, run);
  assert.equal(r.quality, "ok");
  assert.ok(Math.max(r.width, r.height) <= 2500);
  const { data } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  const sorted = [...data].sort((a, b) => a - b);
  assert.ok(sorted[Math.floor(sorted.length / 2)] >= 235, "el fondo queda blanco");
  assert.ok((await stat(output)).size > 0);
});

test("sin contorno de papel: genera la imagen con calidad fallback", { skip: !hasCv }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "scan-"));
  const input = path.join(dir, "in.png");
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="white"/>${text}</svg>`)).png().toFile(input);
  const output = path.join(dir, "out.jpg");
  const r = await scanPage(input, output, run);
  assert.equal(r.quality, "fallback");
  assert.ok((await stat(output)).size > 0);
});
