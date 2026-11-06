import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const FAILED_KEEP_DAYS = 5;

const failedDir = (docDir: string) => path.join(docDir, "failed");

// Guarda una copia del original y el motivo para poder revisar por qué falló la lectura.
export async function keepFailed(docDir: string, doc: { id: string; filename: string }, error: string) {
  const dir = failedDir(docDir);
  await mkdir(dir, { recursive: true });
  const base = `${doc.id}${path.extname(doc.filename)}`;
  await copyFile(path.join(docDir, doc.filename), path.join(dir, base)).catch(() => {});
  await writeFile(path.join(dir, `${doc.id}.txt`), `${new Date().toISOString()}\n${doc.filename}\n${error}\n`);
}

// Borra lo guardado hace más de FAILED_KEEP_DAYS días. Devuelve cuántos archivos eliminó.
export async function pruneFailed(docDir: string, now = Date.now()) {
  const dir = failedDir(docDir);
  const limit = now - FAILED_KEEP_DAYS * 86400000;
  let removed = 0;
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const file = path.join(dir, name);
    const info = await stat(file).catch(() => null);
    if (info && info.mtimeMs < limit) {
      await rm(file, { force: true });
      removed++;
    }
  }
  return removed;
}
