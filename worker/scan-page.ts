import path from "node:path";

type Run = (command: string, args: string[]) => Promise<string>;
export type ScanResult = { width: number; height: number; quality: "ok" | "fallback" };

// Convierte una página en una imagen «tipo escáner»; el original permanece intacto.
export async function scanPage(input: string, output: string, run: Run): Promise<ScanResult> {
  const out = await run(
    process.env.PYTHON_PATH ?? (process.platform === "win32" ? "python" : "python3"),
    [path.resolve("scripts/prepare-ocr.py"), "--scan", input, output],
  );
  const r = JSON.parse(out) as ScanResult;
  if (!r.width || !r.height) throw new Error("La imagen escaneada no es válida");
  return { width: r.width, height: r.height, quality: r.quality === "ok" ? "ok" : "fallback" };
}

// Gira fotos hechas de lado o del revés; devuelve el archivo a leer (el original queda intacto).
export async function uprightPage(input: string, output: string, run: Run): Promise<string> {
  const r = JSON.parse(await run(
    process.env.PYTHON_PATH ?? (process.platform === "win32" ? "python" : "python3"),
    [path.resolve("scripts/prepare-ocr.py"), "--upright", input, output],
  )) as { rotated: number };
  return r.rotated ? output : input;
}
