import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { atomic, RateLimit, StopPortal, type Price } from "./sonepar-portal-core";
import { createAdapter } from "./sonepar-portal-adapter";

process.umask(0o077);
const root = path.resolve("data/automation/sonepar");
const directory = path.join(root, "images");
type ImageRow = { supplierRef: string; file: string | null; sha256: string | null; status: "ok" | "missing" | "failed"; checkedAt: string };
async function main() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const products: { supplierRef: string }[] = JSON.parse(await readFile(path.join(root, "catalago_sonepar.json"), "utf8"));
  const wanted = new Set(products.map(p => p.supplierRef).filter(Boolean));
  const manifestFile = path.join(directory, "manifest.json");
  const previous = await readFile(manifestFile, "utf8").then(s => JSON.parse(s)).catch(e => { if (e.code === "ENOENT") return null; throw e; });
  const saved = new Map<string, ImageRow>(previous && !previous.complete && Date.now() - Date.parse(previous.checkedAt) < 86400000 ? previous.images.map((r: ImageRow) => [r.supplierRef, r]) : []);
  const browser = await chromium.launch();
  let pages = 0, searches = 0;
  try {
    const context = await browser.newContext({ storageState: path.join(root, "portal/session.json") });
    const adapter = await createAdapter(context, products, { prices: false });
    async function save(row: Price) {
      if (!wanted.has(row.supplierRef) || saved.has(row.supplierRef)) return;
      const result: ImageRow = { supplierRef: row.supplierRef, file: null, sha256: null, status: "missing", checkedAt: new Date().toISOString() };
      if (row.imageUrl) {
        const url = new URL(row.imageUrl);
        if (url.protocol !== "https:" || url.hostname !== "esp-sonesp.mo.cloudinary.net" || !url.pathname.startsWith("/PRODUCT/IMAGE/") || [...url.searchParams.keys()].some(key => !["ts", "type"].includes(key))) throw new StopPortal("Origen de imagen no reconocido; no se descargan destinos arbitrarios");
        try {
          for (let attempt = 0; attempt < 3; attempt++) {
            const response = await context.request.get(url.href, { timeout: 20000, maxRedirects: 0 });
            if (response.status() === 429) throw new RateLimit("Sonepar ha limitado la descarga de imágenes");
            if (response.status() >= 500 && attempt < 2) { await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); continue; }
            if (!response.ok()) throw Error("Imagen no disponible");
            const headers = response.headers();
            if (!/^image\/(jpeg|jpg|png|webp)(?:;|$)/i.test(headers["content-type"] ?? "")) break; // SVG genérico, no fotografía.
            if (Number(headers["content-length"] ?? 0) > 5000000) throw Error("Imagen demasiado grande");
            const bytes = await response.body();
            if (bytes.length > 5000000) throw Error("Imagen demasiado grande");
            const sha256 = createHash("sha256").update(bytes).digest("hex"), file = `${sha256}.bin`;
            await writeFile(path.join(directory, file), bytes, { flag: "wx", mode: 0o600 }).catch(e => { if (e.code !== "EEXIST") throw e; });
            Object.assign(result, { status: "ok", file, sha256 });
            break;
          }
        } catch (error) {
          if (error instanceof RateLimit || error instanceof StopPortal) throw error;
          result.status = "failed";
        }
      }
      saved.set(row.supplierRef, result);
      await atomic(manifestFile, { checkedAt: new Date().toISOString(), complete: false, pages, searches, images: [...saved.values()] });
    }
    const seen = new Set<string>();
    for (let first = true; ; first = false) {
      const batch = await (first ? adapter.purchasedFirst() : adapter.purchasedNext());
      if (seen.has(batch.pageKey)) throw new StopPortal("Página de imágenes duplicada");
      seen.add(batch.pageKey); pages++;
      for (const row of batch.rows) await save(row);
      if (!batch.hasNext) break;
      if (pages >= 200) throw new StopPortal("Demasiadas páginas de imágenes");
    }
    for (const ref of wanted) {
      if (saved.get(ref)?.status === "ok") continue;
      saved.delete(ref);
      await new Promise(r => setTimeout(r, 1000)); searches++;
      const row = await adapter.search(ref);
      if (row) await save(row);
      else saved.set(ref, { supplierRef: ref, file: null, sha256: null, status: "missing", checkedAt: new Date().toISOString() });
    }
    await atomic(manifestFile, { checkedAt: new Date().toISOString(), complete: true, pages, searches, images: [...saved.values()] });
    await atomic(path.join(root, "portal/session.json"), await context.storageState());
    const rows = [...saved.values()];
    console.log(`Sonepar imágenes: ${rows.filter(r => r.status === "ok").length} descargadas, ${rows.filter(r => r.status !== "ok").length} sin foto verificable; ${pages} páginas, ${searches} búsquedas`);
  } finally { await browser.close(); }
}
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) process.once(signal, () => process.exit(code));
main().catch(error => { console.error(error instanceof StopPortal || error instanceof RateLimit ? error.message : "Error al sincronizar imágenes Sonepar"); process.exitCode = 1; });
