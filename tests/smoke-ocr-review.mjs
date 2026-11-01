import { chromium } from "@playwright/test";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const fixture = JSON.parse(
  await readFile("data/ocr-review-fixture.json", "utf8"),
);
const root = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
const directories = (await readdir(root))
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort();
const executablePath =
  process.env.PLAYWRIGHT_BROWSER_PATH ||
  path.join(root, directories.at(-1), "chrome-win64", "chrome.exe");
const browser = await chromium.launch({ headless: true, executablePath });
async function login(page, email, password) {
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar a mi empresa" }).click();
  await page.getByRole("heading", { name: "Todo bajo control." }).waitFor();
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, fixture.email, fixture.password);
  await page.goto("http://localhost:3000/facturas");
  await page
    .locator(".record")
    .filter({ hasText: "PRUEBA revisión de campos.png" })
    .getByRole("button", { name: "Revisar", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Revisar factura de compra",
  });
  assert.equal(
    await dialog.getByLabel("Número del documento").inputValue(),
    "F-95151",
  );
  assert.equal(
    await dialog.getByLabel("Fecha", { exact: true }).inputValue(),
    "2026-09-28",
  );
  assert.equal(await dialog.getByLabel("Base neta (€)").inputValue(), "319.00");
  assert.equal(await dialog.getByLabel("Impuestos (€)").inputValue(), "66.99");
  assert.equal(await dialog.locator(".stock-review-line").count(), 5);
  assert.equal(
    await dialog
      .locator(".stock-review-line")
      .nth(4)
      .getByLabel("Cantidad recibida")
      .inputValue(),
    "-1.00",
  );
  await dialog.getByLabel("Base neta (€)").fill("320.00");
  await dialog
    .getByRole("button", { name: "Crear proveedor", exact: true })
    .click();
  await dialog
    .getByLabel("Nombre del proveedor", { exact: true })
    .fill("Proveedor creado sin salir de revisión");
  await dialog
    .getByRole("button", { name: "Guardar y seleccionar proveedor" })
    .click();
  await dialog
    .getByRole("button", { name: "Crear proveedor", exact: true })
    .waitFor();
  assert.equal(
    await dialog
      .getByLabel("Proveedor", { exact: true })
      .locator("option:checked")
      .textContent(),
    "Proveedor creado sin salir de revisión",
  );
  assert.equal(await dialog.getByLabel("Base neta (€)").inputValue(), "320.00");
  await dialog.getByLabel("Base neta (€)").fill("319.00");
  await dialog
    .getByLabel(
      "He revisado el original, las cantidades, las unidades y los datos de cada artículo.",
    )
    .check();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/operations/review") &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Confirmar costes" }).click();
  assert.equal((await response).status(), 200);
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "OK formulario aislado: autocompletado, alta de proveedor sin perder cambios y confirmación de cinco conceptos con abono.",
  );

  const owner = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    p = await owner.newPage();
  await login(p, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  await p.goto("http://localhost:3000/facturas");
  await p
    .locator(".record")
    .filter({ hasText: "image.jpg" })
    .getByRole("button", { name: "Revisar", exact: true })
    .click();
  const real = p.getByRole("dialog", { name: "Revisar factura de compra" });
  const expected = JSON.parse(
    await readFile("data/ocr-debug/result-local.json", "utf8"),
  ).suggestion;
  for (const [label, value] of [
    ["Número del documento", expected.number],
    ["Fecha", expected.date],
    ["Base neta (€)", expected.net],
    ["Impuestos (€)", expected.tax],
  ])
    assert.equal(
      await real.getByLabel(label, { exact: true }).inputValue(),
      value,
    );
  assert.equal(
    await real.locator(".stock-review-line").count(),
    expected.lines.length,
  );
  for (const [i, line] of expected.lines.entries()) {
    const row = real.locator(".stock-review-line").nth(i);
    for (const [label, key] of [
      ["Descripción", "description"],
      ["Referencia del proveedor", "reference"],
      ["Cantidad recibida", "quantity"],
      ["Precio por unidad (€)", "price"],
      ["Descuento (%)", "discount"],
    ])
      assert.equal(
        await row.getByLabel(label, { exact: true }).inputValue(),
        line[key],
      );
  }
  await real
    .getByRole("button", { name: "Crear proveedor", exact: true })
    .click();
  assert.equal(
    await real.getByLabel("Nombre del proveedor", { exact: true }).inputValue(),
    expected.supplier.name,
  );
  assert.equal(
    await real.getByLabel("NIF / CIF", { exact: true }).inputValue(),
    expected.supplier.taxId,
  );
  await real.getByRole("button", { name: "Cerrar alta de proveedor" }).click();
  const photo = real.getByAltText("Factura original para comprobar los datos");
  await photo.scrollIntoViewIfNeeded();
  await photo.evaluate((img) => img.decode());
  assert.ok(await photo.evaluate((img) => img.naturalWidth > 0));
  await mkdir("data/screenshots", { recursive: true });
  await p.screenshot({ path: "data/screenshots/ocr-factura-desktop.png" });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: "data/screenshots/ocr-factura-movil.png" });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await owner.close();
  console.log(
    "OK factura real: imagen visible, número, fecha, base, IVA, cinco descripciones, referencias, cantidades, precios y descuentos comparados con el original; vista móvil. Sin confirmar la compra real.",
  );
} finally {
  await browser.close();
}
