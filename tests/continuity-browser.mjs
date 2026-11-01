import { chromium } from "@playwright/test";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--host-resolver-rules=MAP localhost 127.0.0.1"],
});
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.origin);
  await page.getByLabel("Correo electrónico").fill(f.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Entrar a mi empresa" }).click();
  await page.getByRole("heading", { name: "Todo bajo control." }).waitFor();
  await page.goto(`${f.origin}/pedidos`);
  await page.getByRole("heading", { name: "Pedidos a proveedores" }).waitFor();
  await page.getByRole("button", { name: "Nuevo pedido", exact: true }).click();
  let dialog = page.getByRole("dialog");
  const po = `PC-UI-${Date.now()}`;
  await dialog.getByLabel("Proveedor del pedido").selectOption(f.supplierId);
  await dialog.getByLabel("Número de pedido").fill(po);
  await dialog
    .getByLabel("Descripción", { exact: true })
    .fill("Clavijas · PRUEBA PEDIDO UI");
  await dialog.getByLabel("Referencia", { exact: true }).fill("UI-PED-20");
  await dialog.getByLabel("Cantidad pedida").fill("20");
  await dialog
    .getByRole("button", { name: "Guardar pedido", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const orderPanel = page
    .locator("section.panel")
    .filter({
      has: page.getByRole("heading", { name: `${po} · Proveedor de prueba` }),
    });
  await orderPanel.waitFor();
  await orderPanel.getByRole("link", { name: "Recibir albarán" }).click();
  await page.getByRole("heading", { name: "Facturas y documentos" }).waitFor();
  assert.ok(new URL(page.url()).searchParams.get("pedido"));
  await page
    .getByRole("button", { name: "Subir documento", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tipo de documento").selectOption("DELIVERY");
  const filename = `PRUEBA-PEDIDO-UI-${Date.now()}.png`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="650"><rect width="1500" height="650" fill="white"/><g font-family="Arial" font-size="40"><text x="60" y="90">ALBARAN NUMERO UI-${Date.now()}</text><text x="60" y="180">Proveedor de prueba B12345678</text><text x="60" y="270">Fecha: 19/10/2026</text><text x="60" y="360">Clavijas de conexion 8 ud</text></g></svg>`;
  await dialog
    .locator("input[type=file]")
    .last()
    .setInputFiles({
      name: filename,
      mimeType: "image/png",
      buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
    });
  await dialog
    .getByRole("button", { name: "Subir documento", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const record = page.locator(".record").filter({ hasText: filename });
  await record
    .getByRole("button", { name: "Revisar", exact: true })
    .waitFor({ timeout: 90000 });
  await record.getByRole("button", { name: "Revisar", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Destino del material").selectOption("STOCK");
  await dialog
    .getByRole("combobox", { name: /^Proveedor/ })
    .selectOption(f.supplierId);
  await dialog.getByLabel("Número del documento").fill(`AL-UI-${Date.now()}`);
  await dialog.getByLabel("Fecha", { exact: true }).fill("2026-10-19");
  await dialog
    .getByRole("checkbox", { name: /Este albarán no incluye precios/ })
    .check();
  await dialog
    .getByLabel("Descripción", { exact: true })
    .fill("Clavijas · PRUEBA PEDIDO UI");
  await dialog.getByLabel("Referencia del proveedor").fill("UI-PED-20");
  await dialog.getByLabel("Cantidad recibida", { exact: true }).fill("8");
  await dialog.getByRole("combobox", { name: /^Unidad/ }).selectOption("ud");
  await dialog
    .getByLabel("Línea de pedido del artículo 1")
    .selectOption({
      label: await dialog
        .getByLabel("Línea de pedido del artículo 1")
        .locator("option")
        .filter({ hasText: po })
        .innerText(),
    });
  await dialog
    .getByRole("checkbox", { name: /He revisado el original/ })
    .check();
  await dialog
    .getByRole("button", { name: "Confirmar recepción", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Tu almacén, al día" }).waitFor();
  await page.goto(`${f.origin}/pedidos`);
  await page.getByRole("heading", { name: "Pedidos a proveedores" }).waitFor();
  await page.getByLabel("Estado del pedido").selectOption("all");
  await orderPanel
    .getByText("Recibido parcialmente", { exact: true })
    .waitFor();
  assert.deepEqual(
    await orderPanel.locator(".order-line dd").allTextContents(),
    ["20 ud", "8 ud", "12 ud"],
  );
  await orderPanel
    .getByRole("button", { name: "Cancelar lo pendiente" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Motivo de cancelación")
    .fill("PRUEBA UI: se cancela la cantidad pendiente");
  await dialog.getByRole("button", { name: "Confirmar cancelación" }).click();
  await dialog.waitFor({ state: "hidden" });
  await orderPanel.getByText("Pendiente cancelado", { exact: true }).waitFor();
  assert.deepEqual(
    await orderPanel.locator(".order-line dd").allTextContents(),
    ["20 ud", "8 ud", "0 ud", "12 ud"],
  );
  await mkdir("data/screenshots", { recursive: true });
  await page.screenshot({
    path: "data/screenshots/pedidos-verificados.png",
    fullPage: true,
  });
  await page.goto(`${f.origin}/etiquetas?items=${f.code}:2`);
  await page.getByRole("heading", { name: "Tus etiquetas." }).waitFor();
  await page.getByLabel("Ancho (mm)").fill("45");
  await page.getByLabel("Alto (mm)").fill("30");
  await page.getByLabel("Nombre del perfil").fill("PRUEBA rollo 45x30");
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await page
    .getByText("Perfil guardado en este navegador.", { exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("combobox", { name: /^Perfil guardado/ })
    .selectOption({ label: "PRUEBA rollo 45x30" });
  assert.equal(await page.getByLabel("Ancho (mm)").inputValue(), "45");
  assert.equal(await page.getByLabel("Alto (mm)").inputValue(), "30");
  assert.equal(await page.getByTestId("printed-label").count(), 2);
  await page.getByRole("button", { name: "Eliminar perfil" }).click();
  await page.goto(`${f.origin}/configuracion`);
  await page.getByRole("heading", { name: "Estado del sistema" }).waitFor();
  await page.getByText("Señal reciente", { exact: true }).waitFor();
  await page.getByText("Reciente y verificada", { exact: true }).waitFor();
  await page.screenshot({
    path: "data/screenshots/estado-sistema.png",
    fullPage: true,
  });
  await page.goto(`${f.origin}/trimestres`);
  await page
    .getByRole("heading", { name: "Trimestres", exact: true })
    .waitFor();
  await page.getByLabel("Año", { exact: true }).selectOption("2026");
  await page.getByLabel("Trimestre", { exact: true }).selectOption("4");
  await page
    .getByRole("heading", { name: /Facturas recibidas \([1-9]/ })
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar paquete (ZIP)", exact: true })
    .click();
  const download = await downloadPromise;
  const buf = await readFile(await download.path());
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  assert.ok(buf.includes(Buffer.from("resumen.csv")));
  await page.getByLabel("Trimestre", { exact: true }).selectOption("2");
  await page
    .getByRole("heading", { name: "Facturas recibidas (0)", exact: true })
    .waitFor();
  await page.getByLabel("Trimestre", { exact: true }).selectOption("4");
  await page
    .getByRole("heading", { name: /Facturas recibidas \([1-9]/ })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "data/screenshots/trimestres-movil.png",
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
    path: "data/screenshots/trimestres-desktop.png",
    fullPage: true,
  });
  await page.route("**/api/quarters?*format=check", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "PRUEBA: falta un original para preparar el paquete completo.",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Descargar paquete (ZIP)", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "PRUEBA: falta un original" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "OK navegador: pedido de 20, recepción de 8, cancelación de 12, perfiles persistentes, estado del sistema, trimestre vacío/con facturas, ZIP y error visible sin originales.",
  );
} finally {
  await browser.close();
}
