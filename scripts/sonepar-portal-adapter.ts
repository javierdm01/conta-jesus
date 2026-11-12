import { createHash } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { RateLimit, StopPortal, type PortalAdapter, type Price, type Source } from "./sonepar-portal-core";

export const adapterReady: boolean = true;
export const fullValidated: boolean = true;
const purchasedUrl = "https://sonepar.es/account/es-es/already-purchased";
const amount = (s: string | null) => {
  const m = s?.trim().match(/^([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+),([0-9]+)\s*€$/);
  return m ? `${m[1].replace(/\./g, "")}.${m[2]}` : null;
};
export async function createAdapter(context: BrowserContext, products: { supplierRef: string }[], options: { prices?: boolean } = {}): Promise<PortalAdapter> {
  const page = await context.newPage();
  const wanted = new Set(products.map(p => p.supplierRef));
  let rateLimited: RateLimit | null = null;
  const retryDelay = (value: string | undefined) => {
    if (!value) return 60000;
    const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
    return Number.isFinite(delay) ? Math.max(60000, delay) : 60000;
  };
  page.on("response", r => { if (r.status() === 429) rateLimited = new RateLimit("El portal respondió 429", retryDelay(r.headers()["retry-after"])); });
  async function check() {
    if (rateLimited) throw rateLimited;
    const url = new URL(page.url());
    if (url.hostname !== "sonepar.es" || /login|authorize/i.test(url.pathname)) throw new StopPortal("Sesión caducada o redirección inesperada");
    const body = await page.locator("body").innerText();
    if (/captcha|demasiadas solicitudes|acceso denegado/i.test(body)) throw new StopPortal("CAPTCHA o bloqueo del portal");
    if (/error al cargar|servicio no disponible|se ha producido un error/i.test(body)) throw Error("Fallo transitorio del portal");
  }
  async function navigate(url: string) {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    if (status === 429) throw new RateLimit("El portal respondió 429", retryDelay(response?.headers()["retry-after"]));
    if (status === 401 || status === 403) throw new StopPortal("Acceso rechazado por el portal; revisa la sesión");
    if (status >= 500) throw Error("Servicio Sonepar temporalmente no disponible");
  }
  async function settle() {
    let previous = ""; let stable = 0;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000); await check();
      const current = JSON.stringify({ number: await page.locator('[aria-current="page"][aria-label^="Página "]').allInnerTexts(), cards: await page.locator('[data-testid="product-list-card-container"]').allInnerTexts() });
      if (current === previous) stable++; else stable = 0;
      previous = current;
      if (i >= 5 && stable >= 2) return;
    }
    throw new StopPortal("La página no terminó de estabilizarse");
  }
  async function rows(source: Source): Promise<Price[]> {
    const raw = await page.locator('[data-testid="product-list-card-container"]').evaluateAll(cards => cards.map(card => {
      const refText = [...card.querySelectorAll('[data-testid="productReference"]')].map(e => e.textContent?.trim() ?? "").find(t => t.startsWith("Ref. Sonepar "));
      const supplierRef = refText?.slice("Ref. Sonepar ".length).trim() ?? "";
      const block = card.querySelector('[data-testid="price-display-block-container"]');
      const visible = (block as HTMLElement | null)?.innerText ?? (card as HTMLElement).innerText;
      const unitText = visible.match(/\bpor\s+(?:(\d+)\s+)?(Unid\.|metros?)/i);
      const byUnit = card.querySelector('[data-testid="price-by-unit-container"]') as HTMLElement | null;
      const image = [...card.querySelectorAll("img")].find(img => img.src.startsWith("https://esp-sonesp.mo.cloudinary.net/PRODUCT/IMAGE/") && !/image-default/i.test(img.src));
      return { supplierRef, imageUrl: image?.src ?? null, unitText: unitText?.[0] ?? null, quantity: unitText ? (unitText[1] ?? "1") : null, unit: unitText?.[2] ?? null, visible, byUnit: byUnit?.innerText ?? null };
    }));
    const result: Price[] = [];
    for (const r of raw.filter(r => r.supplierRef)) {
      let gross: string | null = null; let net: string | null = null;
      let unitGross: string | null = null; let unitNet: string | null = null;
      const shown = [...r.visible.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d+\s*€/g)].map(m => m[0]);
      if (wanted.has(r.supplierRef) && options.prices !== false) {
        const card = page.getByTestId("product-list-card-container").filter({ has: page.getByTestId("productReference").filter({ hasText: `Ref. Sonepar ${r.supplierRef}` }) });
        const legacy = page.getByTestId(`price-tooltip-${r.supplierRef}-button`);
        const button = await legacy.count() === 1 ? legacy : card.getByTestId("tooltip-info-icon");
        if (await button.count() === 1) {
          await button.click();
          const grossLabel = page.getByTestId("tooltip-gross-price").filter({ visible: true });
          const netLabel = page.getByTestId("tooltip-net-price").filter({ visible: true });
          if (await grossLabel.count() === 1 && await netLabel.count() === 1) {
            const g = await grossLabel.innerText(), n = await netLabel.innerText();
            if (r.unit && r.byUnit && r.byUnit.replace(/\s/g, "") === `${n}/${r.unit}`.replace(/\s/g, "")) {
              unitGross = amount(g); unitNet = amount(n);
            }
            if (shown.includes(g) && shown.includes(n)) { gross = amount(g); net = amount(n); }
          }
          await page.keyboard.press("Escape");
        }
      }
      const classified = gross !== null && net !== null;
      // El importe del desglose es por unidad (o por metro) aunque la tarjeta diga «por 100 Unid.»: esa cifra es el escalón del selector.
      // Solo se acepta si el total del selector es exactamente cantidad × neto, o si el portal da «neto/unidad» (p. ej. 1,66 €/metro).
      const unitKind = r.unit === null ? null : /^metros?$/i.test(r.unit) ? "metros" : /^Unid\.$/i.test(r.unit) ? "Unid." : "otra";
      const selector = r.visible.match(/Selector de cantidad\s+(\d+)\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d+\s*€)\s*$/);
      const selectorTotal = selector ? amount(selector[2]) : null;
      const selectorOk = classified && !!selector && selectorTotal !== null && Math.abs(Number(selector[1]) * Number(net) - Number(selectorTotal)) <= 0.0051 + Number(selector[1]) * 0.00005;
      const byUnitOk = classified && unitNet !== null && unitNet === net;
      const verifiedUnit = unitKind === "otra" ? null : unitKind ?? (selectorOk ? "Unid." : null);
      const legacyOk = classified && r.quantity === "1" && r.unit === "Unid.";
      const supported = legacyOk || (classified && verifiedUnit !== null && (selectorOk || byUnitOk));
      const inferred = supported && !r.unit;
      result.push({ supplierRef: r.supplierRef, precioBruto: gross, precioNeto: net, precioBrutoUnitario: unitGross, precioNetoUnitario: unitNet, precioMostradoSinClasificar: !classified && shown.length ? amount(shown[0]) : null, moneda: shown.length ? "EUR" : null, unidad: supported ? verifiedUnit : r.unit, cantidadPrecioMostrado: supported ? "1" : r.quantity, packaging: r.unitText, fechaConsulta: new Date().toISOString(), fuente: source, estado: supported ? "verified_unit" : shown.length ? "ambiguous" : "missing", observaciones: supported ? (inferred ? "Unidad deducida: el total del selector coincide con cantidad × neto" : r.quantity !== "1" && r.quantity ? `Importe por unidad verificado con el selector (el portal indica «${r.unitText}»: es el escalón de venta)` : null) : `Unidad o clasificación sin verificar${!r.unit && classified ? "; importes etiquetados bruto y neto, base de precio no verificada" : ""}; importes visibles: ${shown.join(", ")}` });
    }
    return result.map(row => ({ ...row, imageUrl: raw.find(r => r.supplierRef === row.supplierRef)?.imageUrl ?? null }));
  }
  let previousNumber = ""; let previousFingerprint = "";
  async function batch(expected?: string) {
    await settle();
    const number = await page.locator('[aria-current="page"][aria-label^="Página "]').first().innerText().catch(() => "");
    const result = await rows("ya_comprado");
    if (!number || !result.length) throw new StopPortal("No se pudo verificar página y productos comprados");
    if (expected && number !== expected) throw new StopPortal("La página cambió durante la estabilización");
    const fingerprint = createHash("sha256").update(JSON.stringify(result.map(r => r.supplierRef))).digest("hex");
    if (previousNumber && (number === previousNumber || fingerprint === previousFingerprint)) throw new StopPortal("La página o el contenido no cambiaron");
    previousNumber = number; previousFingerprint = fingerprint;
    const next = page.getByTestId("pagination-next-page");
    if (await next.count() !== 1 || !(await next.isVisible())) throw new StopPortal("No se pudo verificar el control de página siguiente");
    return { pageKey: `${number}:${fingerprint}`, rows: result, hasNext: await next.isEnabled() && (await next.getAttribute("aria-disabled")) !== "true" };
  }
  return {
    async purchasedFirst() { previousNumber = ""; previousFingerprint = ""; await navigate(purchasedUrl); return batch(); },
    async purchasedNext() {
      // Clicking twice on a transient failure could silently skip a page. Stop
      // and replay pagination from the beginning instead of retrying the click.
      try {
        await check();
        const expected = String(Number(previousNumber) + 1);
        if (!Number.isInteger(Number(expected))) throw new StopPortal("Número de página inválido");
        await page.getByTestId("pagination-next-page").click();
        let changed = false;
        for (let i = 0; i < 30; i++) {
          await page.waitForTimeout(1000); await check();
          const number = await page.locator('[aria-current="page"][aria-label^="Página "]').first().innerText().catch(() => "");
          const refs = await page.locator('[data-testid="product-list-card-container"] [data-testid="productReference"]').allTextContents();
          const ordered = refs.map(r => r.trim()).filter(r => r.startsWith("Ref. Sonepar ")).map(r => r.slice("Ref. Sonepar ".length).trim());
          const fingerprint = createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
          if (number === expected && ordered.length > 0 && fingerprint !== previousFingerprint) { changed = true; break; }
          if (number && number !== expected && number !== previousNumber) throw new StopPortal("Cambio de página inesperado");
        }
        if (!changed) throw new StopPortal("La página siguiente no terminó de cargar");
        return await batch(expected);
      }
      catch (error) { if (error instanceof RateLimit || error instanceof StopPortal) throw error; throw new StopPortal("No se pudo verificar el avance de página; reanuda desde el principio"); }
    },
    async search(ref) {
      await navigate(`https://sonepar.es/catalog/es-es/search/${encodeURIComponent(ref)}`);
      await settle();
      const found = (await rows("busqueda")).filter(r => r.supplierRef === ref);
      if (found.length > 1) throw new StopPortal(`Coincidencia duplicada para ${ref}`);
      return found[0] ?? null;
    },
  };
}
