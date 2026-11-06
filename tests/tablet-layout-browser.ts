import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { company, upload, waitReview, origin, cleanup, launch } from "./docs-harness";

const sizes = [[960, 540], [1024, 600], [1280, 800]] as const;
async function main() {
  const a = await company("T");
  const doc = await upload(a.admin, a.jobId, "DELIVERY", "TABLET");
  await waitReview(doc.id);
  await mkdir("data/screenshots", { recursive: true });
  const browser = await launch();
  try {
    for (const [width, height] of sizes) {
      const context = await browser.newContext({ storageState: await a.admin.storageState(), viewport: { width, height }, hasTouch: true });
      const page = await context.newPage(), errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const [route, name] of [["/", "inicio"], ["/facturas", "facturas"], ["/inventario", "inventario"]] as const) {
        await page.goto(origin + route);
        await page.locator(".sidebar").waitFor();
        await page.waitForLoadState("networkidle");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} ${width}x${height}: sin desplazamiento horizontal`);
        assert.ok((await page.locator(".sidebar").boundingBox())!.width <= 64.5, `barra lateral ≤ 64 px (${width}x${height})`);
        assert.ok((await page.locator(".topbar").boundingBox())!.height <= 52.5, `barra superior ≤ 52 px (${width}x${height})`);
        await page.screenshot({ path: `data/screenshots/tablet-${width}x${height}-${name}.png` });
      }
      await page.goto(`${origin}/facturas`);
      await page.locator(".document-record", { hasText: "PRUEBA-TABLET" }).getByRole("button", { name: "Revisar" }).click();
      await page.locator(".review-split").waitFor();
      const v = (await page.locator(".review-split > .review-original").boundingBox())!, m = (await page.locator(".review-split > .review-main").boundingBox())!;
      assert.ok(v.x + v.width <= m.x + 1, `visor y formulario en columnas contiguas (${width}x${height})`);
      const ratio = v.width / (v.width + m.width);
      assert.ok(ratio > 0.4 && ratio < 0.5, `visor ≈ 45 % (${ratio.toFixed(2)})`);
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".dialog button, .dialog select, .dialog input:not([type=checkbox]):not([type=radio]):not([type=hidden]), .dialog .text-button")]
        .filter((el) => !el.closest(".doc-viewer-stage") && el.offsetParent && el.getBoundingClientRect().height < 43.5)
        .map((el) => `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.slice(0, 30)} ${Math.round(el.getBoundingClientRect().height)}px`));
      assert.deepEqual(small, [], `controles táctiles ≥ 44 px (${width}x${height})`);
      await page.screenshot({ path: `data/screenshots/tablet-${width}x${height}-revision.png` });
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("OK navegador: tablet horizontal 960×540, 1024×600 y 1280×800");
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(cleanup);
