import assert from "node:assert/strict";
import { access, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { company, upload, waitReview, db, docDir, cleanup } from "./docs-harness";
import type { APIRequestContext } from "@playwright/test";

const del = (c: APIRequestContext, ids: string[]) =>
  c.post("/api/operations/document-delete", { data: { ids, requestKey: randomUUID() } });
const exists = (f: string) => access(path.join(docDir(), f)).then(() => true, () => false);

async function main() {
  const a = await company("A"), b = await company("B");

  // 1. Sin confirmar: se borra registro, páginas y archivos; el mismo archivo puede subirse otra vez.
  const first = await upload(a.admin, a.jobId, "DELIVERY", "BORRAR");
  const doc = await waitReview(first.id);
  const pages = await db.documentPage.findMany({ where: { documentId: first.id } });
  assert.ok(pages.length >= 1);
  const ok = await del(a.admin, [first.id]);
  assert.equal(ok.status(), 200, await ok.text());
  assert.equal(await db.document.count({ where: { id: first.id } }), 0);
  assert.equal(await db.documentPage.count({ where: { documentId: first.id } }), 0, "páginas en cascada");
  assert.equal(await exists(doc.filename), false, "original eliminado");
  for (const p of pages) assert.equal(await exists(p.scanFilename), false, "escaneado eliminado");
  const again = await a.admin.post("/api/documents", { multipart: { kind: "DELIVERY", jobId: a.jobId, file: { name: "otra-vez.png", mimeType: "image/png", buffer: first.buffer } } });
  assert.equal(again.status(), 201, "el hash ya no bloquea la nueva subida");
  const reuploaded = (await again.json()).id as string;

  // 2. Confirmado o con dependencias: 409 con motivo.
  await db.document.update({ where: { id: reuploaded }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  const confirmed = await del(a.admin, [reuploaded]);
  assert.equal(confirmed.status(), 409);
  assert.match((await confirmed.json()).error, /confirmado/);

  // 3. Se está leyendo ahora mismo.
  const busy = await upload(a.admin, a.jobId, "DELIVERY", "LEYENDO");
  await db.document.update({ where: { id: busy.id }, data: { status: "PROCESSING", lockedUntil: new Date(Date.now() + 600000), lockToken: "x" } });
  const reading = await del(a.admin, [busy.id]);
  assert.equal(reading.status(), 409);
  assert.match((await reading.json()).error, /leyendo/);
  await db.document.update({ where: { id: busy.id }, data: { status: "FAILED", lockedUntil: null, lockToken: null } });

  // 4. Otra empresa → 404; técnico ajeno → 403/404.
  assert.equal((await del(b.admin, [busy.id])).status(), 404);
  assert.ok([403, 404].includes((await del(await a.technician(), [busy.id])).status()));

  // 5. Doble petición simultánea: nunca 500.
  const [r1, r2] = await Promise.all([del(a.admin, [busy.id]), del(a.admin, [busy.id])]);
  const statuses = [r1.status(), r2.status()].sort();
  assert.equal(statuses[0], 200, "una elimina");
  assert.ok([404, 409].includes(statuses[1]), `la otra no es 500 (fue ${statuses[1]})`);

  // 6. Archivo ya ausente del disco.
  const lost = await upload(a.admin, a.jobId, "DELIVERY", "AUSENTE");
  await waitReview(lost.id);
  await unlink(path.join(docDir(), (await db.document.findUniqueOrThrow({ where: { id: lost.id } })).filename));
  assert.equal((await del(a.admin, [lost.id])).status(), 200);

  // 7. Selección múltiple con uno bloqueado.
  const m1 = await upload(a.admin, a.jobId, "DELIVERY", "MULTI1");
  const m2 = await upload(a.admin, a.jobId, "DELIVERY", "MULTI2");
  await db.document.update({ where: { id: m2.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  const multi = await del(a.admin, [m1.id, m2.id]);
  assert.equal(multi.status(), 200);
  const body = await multi.json();
  assert.deepEqual(body.deleted, [m1.id]);
  assert.equal(body.blocked[0].id, m2.id);
  console.log("OK eliminar subidas: borrado, re-subida, confirmados, lectura en curso, permisos, carreras y selección múltiple");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(cleanup);
