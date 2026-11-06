import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { company, upload, waitReview, db, origin, cleanup, launch } from "./docs-harness";

async function main() {
  const a = await company("V");
  const doc = await upload(a.admin, a.jobId, "DELIVERY", "VISOR");
  await waitReview(doc.id);
  // Documento anterior a esta función: sin páginas guardadas.
  const legacy = await db.document.create({ data: { companyId: a.id, uploaderId: a.techUserId, jobId: a.jobId, kind: "DELIVERY", originalName: "ANTIGUO.png", filename: `${randomUUID()}.png`, mime: "image/png", hash: randomUUID(), status: "REVIEW", suggestion: { lines: [], warnings: [] } } });

  const browser = await launch();
  try {
    const context = await browser.newContext({ storageState: await a.admin.storageState(), viewport: { width: 1280, height: 800 } });
    const page = await context.newPage(), errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 400)); });
    await page.goto(`${origin}/facturas`);
    await page.getByRole("heading", { name: "Albaranes y facturas" }).waitFor();

    // Revisión con visor, recuadros etiquetados y foco cruzado campo ↔ recuadro.
    const row = page.locator(".document-record", { hasText: "PRUEBA-VISOR" });
    await row.getByRole("button", { name: "Revisar" }).click();
    try {
      await page.locator(".doc-viewer-page img").waitFor({ timeout: 15000 });
    } catch (e) {
      await mkdir("data/screenshots", { recursive: true });
      await page.screenshot({ path: "data/screenshots/revision-visor-fallo.png" });
      console.error("Visor:", (await page.locator(".doc-viewer, .doc-viewer-empty").first().innerText().catch(() => "(sin visor)")).slice(0, 300), "| errores:", errors);
      throw e;
    }
    const boxes = page.locator(".doc-box");
    assert.ok((await boxes.count()) >= 1, "al menos un recuadro");
    assert.match((await boxes.first().getAttribute("aria-label")) ?? "", /\S/);
    assert.ok((await page.locator(".doc-box-label").first().innerText()).length > 0, "el recuadro lleva etiqueta de texto");
    await boxes.first().click();
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest("[data-field]")), true, "tocar un recuadro enfoca su campo");
    await page.locator('[data-field="date"]').focus();
    if (await page.locator('.doc-box[aria-label^="Fecha"]').count())
      assert.equal(await page.locator(".doc-box.active").count(), 1, "enfocar Fecha resalta su recuadro");
    await mkdir("data/screenshots", { recursive: true });
    await page.screenshot({ path: "data/screenshots/revision-visor-1280x800.png" });
    await page.getByRole("button", { name: "Cerrar" }).click();

    // Documento sin páginas: mensaje, sin errores.
    await page.reload();
    await page.locator(".document-record", { hasText: "ANTIGUO" }).getByRole("button", { name: "Revisar" }).click();
    await page.getByText("No hay imagen preparada").waitFor();
    await page.getByRole("button", { name: "Cerrar" }).click();

    // Eliminar con confirmación y volver a subir el mismo archivo.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^Eliminar PRUEBA-VISOR/ }).click();
    await page.locator(".document-record", { hasText: "PRUEBA-VISOR" }).waitFor({ state: "detached" });
    const again = await a.admin.post("/api/documents", { multipart: { kind: "DELIVERY", jobId: a.jobId, file: { name: "otra.png", mimeType: "image/png", buffer: doc.buffer } } });
    assert.equal(again.status(), 201);
    assert.deepEqual(errors, []);
    console.log("OK navegador: visor con recuadros, foco cruzado, documento sin páginas y eliminación");
  } finally {
    await browser.close();
    await db.document.delete({ where: { id: legacy.id } }).catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(cleanup);
