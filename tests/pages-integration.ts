import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { company, upload, waitReview, db, docDir, cleanup } from "./docs-harness";

async function main() {
  const a = await company("A"), b = await company("B");
  const doc = await upload(a.admin, a.jobId, "DELIVERY", "PAGINAS");
  await waitReview(doc.id);

  const meta = await a.admin.get(`/api/documents/${doc.id}/pages?words=1`);
  assert.equal(meta.status(), 200);
  const { pages } = await meta.json();
  assert.ok(pages.length >= 1, "al menos una página guardada");
  assert.ok(["ok", "fallback"].includes(pages[0].scanQuality));
  assert.ok(pages[0].words.length > 0, "palabras con coordenadas");
  assert.ok(pages[0].words.every((w: { x: number; y: number }) => w.x >= 0 && w.x <= 1 && w.y >= 0 && w.y <= 1));

  const img = await a.admin.get(`/api/documents/${doc.id}/pages/1/image`);
  assert.equal(img.status(), 200);
  assert.equal(img.headers()["content-type"], "image/jpeg");

  const full = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
  const suggestion = full.suggestion as { evidence?: { lines: unknown[] } } | null;
  assert.ok(suggestion?.evidence, "la sugerencia incluye evidencia");

  assert.equal((await b.admin.get(`/api/documents/${doc.id}/pages`)).status(), 404, "otra empresa");
  assert.ok([403, 404].includes((await (await a.technician()).get(`/api/documents/${doc.id}/pages`)).status()), "técnico ajeno");

  const page = await db.documentPage.findFirstOrThrow({ where: { documentId: doc.id } });
  await unlink(path.join(docDir(), page.scanFilename));
  const gone = await a.admin.get(`/api/documents/${doc.id}/pages/1/image`);
  assert.equal(gone.status(), 404, "archivo ausente → 404 con mensaje, no 500");
  assert.match((await gone.json()).error, /ya no está/);
  console.log("OK páginas escaneadas, palabras, evidencia, permisos y archivo ausente");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(cleanup);
