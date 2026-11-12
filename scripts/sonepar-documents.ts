import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { atomic, RateLimit, StopPortal } from "./sonepar-portal-core";

process.umask(0o077);
const root = path.resolve("data/automation/sonepar");
const directory = path.join(root, "documents");
export type RemoteInvoice = { externalId: string; kind: "PURCHASE" | "CREDIT"; date: string; total: string; file: string; sha256: string; downloadedAt: string };
async function main() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const manifestFile = path.join(directory, "manifest.json");
  const previous = await readFile(manifestFile, "utf8").then(s => JSON.parse(s)).catch(e => {
    if (e.code === "ENOENT") return { documents: [] }; throw e;
  });
  const known = new Map<string, RemoteInvoice>((previous.documents as RemoteInvoice[]).map(row => [row.externalId, row]));
  const browser = await chromium.launch();
  let downloaded = 0, cached = 0, pages = 0;
  const failures: { externalId: string; error: string }[] = [];
  try {
    const context = await browser.newContext({ storageState: path.join(root, "portal/session.json"), acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    let limited = false;
    page.on("response", response => { if (response.status() === 429) limited = true; });
    async function check() {
      if (limited) throw new RateLimit("Sonepar ha limitado la descarga de documentos");
      if (new URL(page.url()).hostname !== "sonepar.es") throw new StopPortal("Renueva la sesión de Sonepar");
      const body = await page.locator("body").innerText();
      if (/captcha|acceso denegado|demasiadas solicitudes/i.test(body)) throw new StopPortal("Verificación o bloqueo de Sonepar: se detiene la descarga");
    }
    async function rows() {
      return page.locator('[data-testid^="invoice-billNumber-"]').evaluateAll(elements => elements.map(element => {
        const row = element.closest("tr") ?? element.closest('[role="row"]');
        if (!row) throw Error("No se reconoce la fila de factura");
        const externalId = element.getAttribute("data-testid")!.slice("invoice-billNumber-".length);
        const type = row.querySelector('[data-testid^="invoice-type-"]')?.getAttribute("data-testid");
        const date = row.querySelector('[data-testid^="invoice-created-date-"]')?.getAttribute("data-testid")?.match(/(\d{4}-\d{2}-\d{2})T/)?.[1] ?? "";
        const total = row.querySelector('[data-testid^="invoice-total-amount-"]')?.textContent?.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".") ?? "";
        return { externalId, kind: type === "invoice-type-INVOICE" ? "PURCHASE" : type === "invoice-type-CREDIT_NOTE" ? "CREDIT" : "UNKNOWN", date, total };
      }));
    }
    async function settled() {
      let last = "", stable = 0;
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000); await check();
        const current = JSON.stringify(await rows());
        stable = current === last ? stable + 1 : 0; last = current;
        if (stable >= 2 && i >= 3) return;
      }
      throw new StopPortal("El listado de facturas no terminó de cargar");
    }
    await page.goto("https://sonepar.es/account/es-es/invoice-credit-notes", { waitUntil: "domcontentloaded" });
    await check();
    await page.getByTestId("filterdrawer-trigger-button").click();
    // El portal limita inicialmente a seis meses. El usuario pidió todo lo disponible.
    await page.getByRole("button", { name: "Borrar todo", exact: true }).click();
    await page.getByRole("button", { name: "Mostrar resultados", exact: true }).click();
    const seenPages = new Set<string>(), seenIds = new Set<string>();
    let expected = 1;
    for (;;) {
      await settled();
      const list = await rows();
      const number = await page.locator('[aria-current="page"][aria-label^="Página "]').first().innerText().catch(() => "1");
      const fingerprint = list.map(row => row.externalId).join("|");
      if (Number(number) !== expected || seenPages.has(fingerprint)) throw new StopPortal("No se confirmó el cambio de página de facturas");
      seenPages.add(fingerprint); pages++;
      if (await page.getByTestId("documents-list-trigger").count() !== list.length) throw new StopPortal("Descargas y filas de factura no coinciden");
      for (const [index, item] of list.entries()) {
        if (!/^[FA][A-Z0-9-]{3,70}$/.test(item.externalId) || item.kind === "UNKNOWN" || !item.date || !/^-?\d+\.\d{2}$/.test(item.total)) throw new StopPortal("Factura sin identidad, tipo, fecha o importe verificable");
        if (seenIds.has(item.externalId)) continue;
        seenIds.add(item.externalId);
        const old = known.get(item.externalId);
        if (old && old.date === item.date && old.total === item.total && /^[A-Z0-9-]+-[a-f0-9]{12}\.pdf$/.test(old.file)) {
          const valid = await readFile(path.join(directory, old.file)).then(bytes => createHash("sha256").update(bytes).digest("hex") === old.sha256).catch(() => false);
          if (valid) { cached++; continue; }
        }
        try {
          await page.keyboard.press("Escape");
          await page.getByTestId("documents-list-trigger").nth(index).click();
          const pending = page.waitForEvent("download", { timeout: 45000 });
          await page.getByTestId(`documents-list-item-${item.externalId}`).click();
          const download = await pending;
          const temporary = await download.path();
          if (!temporary) throw new Error("Descarga sin archivo");
          const bytes = await readFile(temporary);
          if (bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") throw new StopPortal("El documento recibido no es un PDF válido de hasta 20 MB");
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          const file = `${item.externalId}-${sha256.slice(0, 12)}.pdf`;
          await writeFile(path.join(directory, file), bytes, { flag: "wx", mode: 0o600 }).catch(error => { if (error.code !== "EEXIST") throw error; });
          known.set(item.externalId, { ...item, kind: item.kind as "PURCHASE" | "CREDIT", sha256, file, downloadedAt: new Date().toISOString() });
          downloaded++;
          await atomic(manifestFile, { checkedAt: new Date().toISOString(), complete: false, pages, documents: [...known.values()], failures });
        } catch (error) {
          if (error instanceof StopPortal || error instanceof RateLimit) throw error;
          failures.push({ externalId: item.externalId, error: "No se pudo descargar; se reintentará en el siguiente ciclo" });
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1000); await check();
      }
      const next = page.getByTestId("pagination-next-page");
      if (!(await next.count()) || !(await next.isEnabled())) break;
      if (pages >= 200) throw new StopPortal("Se alcanzó el límite de seguridad de 200 páginas");
      await next.click(); expected++;
    }
    await atomic(path.join(root, "portal/session.json"), await context.storageState());
    await atomic(manifestFile, { checkedAt: new Date().toISOString(), complete: true, pages, downloaded, cached, documents: [...known.values()], failures });
    console.log(`Sonepar documentos: ${pages} páginas, ${downloaded} descargados, ${cached} ya guardados, ${failures.length} pendientes`);
    if (failures.length) process.exitCode = 1;
  } finally { await browser.close(); }
}
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) process.once(signal, () => process.exit(code));
main().catch(error => { console.error(error instanceof StopPortal || error instanceof RateLimit ? error.message : "Error al consultar documentos Sonepar; no se modifica el stock"); process.exitCode = 1; });
