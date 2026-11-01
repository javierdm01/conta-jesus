// Diagnóstico local: no sube archivos ni modifica documentos o contabilidad.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ocrImage } from "../worker/ocr-image";
import { parseOcr } from "../src/lib/ocr";
async function main() {
  const input = process.argv[2],
    output = process.argv[3],
    kind = process.argv[4] ?? "PURCHASE";
  if (!["PURCHASE", "DELIVERY"].includes(kind))
    throw Error("Tipo no válido: PURCHASE o DELIVERY.");
  if (!input)
    throw Error(
      "Indica la ruta de la foto y, opcionalmente, un JSON de salida.",
    );
  const temp = await mkdtemp(path.join(tmpdir(), "instala-check-ocr-"));
  try {
    const image = input;
    await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    const text = await ocrImage(
      image,
      kind,
      async (command, args) =>
        (
          await promisify(execFile)(command, args, {
            windowsHide: true,
            env: { ...process.env, OMP_THREAD_LIMIT: "1" },
            timeout: 180000,
            maxBuffer: 4_000_000,
          })
        ).stdout,
      temp,
    );
    const suggestion = parseOcr(text, [], kind);
    if (output)
      await writeFile(output, JSON.stringify({ text, suggestion }, null, 2));
    console.log(JSON.stringify(suggestion, null, 2));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
