import { chromium } from "@playwright/test";
import { readdir, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const f = JSON.parse(await readFile("data/inventory-fixture.json", "utf8"));
const root = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
const executablePath =
  process.env.PLAYWRIGHT_BROWSER_PATH ||
  path.join(
    root,
    (await readdir(root))
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .at(-1),
    "chrome-win64",
    "chrome.exe",
  );
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.origin);
  await page.getByLabel("Correo electrónico").fill(f.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Entrar a mi empresa" }).click();
  await page.getByRole("heading", { name: "Todo bajo control." }).waitFor();
  await page.goto(`${f.origin}/inventario?trabajo=${f.jobId}`);
  await page
    .getByRole("link", { name: "Magnetotérmico 2P 16 A · PRUEBA", exact: true })
    .click();
  assert.equal(new URL(page.url()).searchParams.get("trabajo"), f.jobId);
  await page.getByRole("heading", { name: "Magnetotérmico 2P 16 A · PRUEBA", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Registrar uso", exact: true })
    .click();
  assert.equal(await page.locator("select[name=jobId]").inputValue(), f.jobId);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  async function count(quantity, reason) {
    await page
      .getByRole("button", { name: "Recuento físico", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Cantidad contada (ud)").fill(quantity);
    await dialog.getByLabel("Motivo del recuento").fill(reason);
    await dialog
      .getByRole("button", { name: "Confirmar recuento", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .locator(".lot-hero-quantity strong")
      .filter({ hasText: new RegExp(`^${quantity}$`) })
      .waitFor();
    await page.getByText(reason, { exact: true }).first().waitFor();
  }
  await count("15", "PRUEBA: dos unidades no localizadas");
  await count("17", "PRUEBA: dos unidades recuperadas");
  await count("17", "PRUEBA: recuento sin diferencias");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const current = (await page.evaluate(async () => (await fetch('/api/inventory')).json())).lots.find(l => l.id === f.lotId);
  await page.getByLabel("Avisar al llegar a (ud)").fill(String(Number(current.available) + 1));
  await page
    .getByRole("button", { name: "Guardar ficha", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir("data/screenshots", { recursive: true });
  await page.screenshot({
    path: "data/screenshots/recuentos-movil.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page
    .getByRole("link", { name: "Volver al almacén", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revisar mínimos", exact: true })
    .click();
  assert.equal(await page.locator(".stock-card").count(), 1);
  await page
    .getByLabel("Ubicación del material")
    .selectOption("Estantería A · cajón 3");
  await page
    .getByLabel("Proveedor del material")
    .selectOption("Proveedor de prueba");
  await page.getByLabel("Orden del material").selectOption("oldest");
  assert.equal(await page.locator(".stock-card").count(), 1);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar visibles CSV", exact: true })
    .click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  assert.ok(csv.includes(f.code));
  assert.ok(csv.includes('"Valor en stock EUR"'));
  assert.equal(csv.includes("Conectores · PRUEBA"), false);
  await page.getByLabel("Ubicación del material").selectOption("__empty");
  await page
    .getByRole("heading", { name: "No hay material con ese filtro" })
    .waitFor();
  await page.getByLabel("Ubicación del material").selectOption("");
  await page.screenshot({
    path: "data/screenshots/almacen-filtros-movil.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "data/screenshots/almacen-filtros-desktop.png",
    fullPage: true,
  });
  // Un fallo de actualización muestra error sin borrar los datos ya recibidos.
  await page.route("**/api/inventory", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "PRUEBA conexión interrumpida" }),
    }),
  );
  await page
    .getByRole("button", { name: "Actualizar existencias", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "PRUEBA conexión interrumpida" })
    .waitFor();
  assert.equal(await page.locator(".stock-card").count(), 1);
  await page.unroute("**/api/inventory");
  await page
    .getByRole("button", { name: "Actualizar existencias", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "PRUEBA conexión interrumpida" })
    .waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    "OK navegador: recuento, recuperación, comprobación sin diferencia, contexto del trabajo, mínimos libres, filtros, CSV, fallo/recuperación de conexión y móvil.",
  );
} finally {
  await browser.close();
}
