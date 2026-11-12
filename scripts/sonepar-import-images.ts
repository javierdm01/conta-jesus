import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { atomic } from "./sonepar-portal-core";

process.umask(0o077);
async function main() {
  const root = path.resolve(process.env.SONEPAR_EXCHANGE_DIR ?? "data/automation/sonepar");
  const directory = path.join(path.resolve(process.env.DOCUMENT_DIR ?? "data/documents"), "catalog-images");
  const companies = await db.company.findMany({ where: process.env.SONEPAR_COMPANY_ID ? { id: process.env.SONEPAR_COMPANY_ID } : {}, take: 2 });
  if (companies.length !== 1) throw Error("Selecciona una empresa");
  const companyId = companies[0].id;
  const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
  const manifest = JSON.parse(await readFile(path.join(root, "images/manifest.json"), "utf8"));
  if (!Array.isArray(manifest.images)) throw Error("Manifiesto de imágenes inválido");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let changed = 0, unchanged = 0, skipped = 0, failed = 0;
  for (const row of manifest.images) {
    if (row.status !== "ok") { skipped++; continue; }
    try {
      if (typeof row.supplierRef !== "string" || !/^[a-f0-9]{64}\.bin$/.test(row.file) || row.file !== `${row.sha256}.bin`) throw Error("Identidad de imagen inválida");
      const bytes = await readFile(path.join(root, "images", row.file));
      if (bytes.length > 5000000 || createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw Error("Huella de imagen inválida");
      const picture = sharp(bytes, { limitInputPixels: 20000000 });
      const info = await picture.metadata();
      if (!["jpeg", "png", "webp"].includes(info.format ?? "")) throw Error("Formato de imagen inválido");
      const converted = await picture.rotate().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const hash = createHash("sha256").update(converted).digest("hex");
      const items = await db.catalogItem.findMany({ where: { companyId, supplier: { equals: "Sonepar", mode: "insensitive" }, supplierRef: row.supplierRef } });
      for (const item of items) {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(item.id)) throw Error("ID de catálogo inválido");
        const file = path.join(directory, `${item.id}.webp`);
        const imageUrl = `${origin}/api/catalog-images/${item.id}?v=${hash}`;
        if (item.imageUrl === imageUrl && await access(file).then(() => true).catch(() => false)) { unchanged++; continue; }
        const temporary = `${file}.${randomUUID()}.tmp`;
        await writeFile(temporary, converted, { mode: 0o600, flag: "wx" });
        await rename(temporary, file);
        await db.catalogItem.update({ where: { id: item.id }, data: { imageUrl } });
        changed++;
      }
    } catch { failed++; }
  }
  await atomic(path.join(root, "images/import-result.json"), { checkedAt: new Date().toISOString(), changed, unchanged, skipped, failed });
  console.log(JSON.stringify({ soneparImages: { changed, unchanged, skipped, failed } }));
  if (failed) process.exitCode = 1;
}
main().catch(() => { console.error("No se pudieron incorporar las imágenes Sonepar; revisa el manifiesto y la configuración"); process.exitCode = 1; }).finally(() => db.$disconnect());
