import { chromium } from "@playwright/test";
import { chmod, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { atomic, runExtraction, toImporter, RateLimit, type Price } from "./sonepar-portal-core";
import { adapterReady, fullValidated, createAdapter } from "./sonepar-portal-adapter";

process.umask(0o077);
// No continuar consultando con un navegador cerrado tras una señal de cancelación.
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
  process.once(signal, () => { console.error("Sonepar: ejecución interrumpida; se conserva el último checkpoint"); process.exit(code); });
}
const privateDir = path.resolve("data/automation/sonepar/portal");
const session = path.join(privateDir, "session.json");
const throttleFile = path.join(privateDir, "rate-limit.json");
const safeError = (error: unknown) => (error instanceof Error ? error.message : "Error de extracción Sonepar")
  .replace(/https?:\/\/[^\s]+/g, value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return "[URL]"; } });

async function main() {
  const [command, ...args] = process.argv.slice(2);
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  await chmod(privateDir, 0o700);
  if (command === "login") {
    if (!process.stdin.isTTY) throw Error("El inicio de sesión requiere una terminal interactiva");
    const url = new URL(args[0] ?? "https://sonepar.es/account/es-es/already-purchased");
    if (url.protocol !== "https:" || !["sonepar.es", "www.sonepar.es"].includes(url.hostname)) throw Error("URL de inicio no permitida");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(url.href, { waitUntil: "domcontentloaded" });
      console.log("Inicia sesión manualmente en el navegador. Mantén la ventana abierta y pulsa Intro aquí cuando termines.");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try { await rl.question(""); } finally { rl.close(); }
      await atomic(session, await context.storageState());
      console.log(`Sesión guardada en ${session} con permisos privados. La autenticación aún debe verificarse durante la inspección.`);
    } finally { await browser.close(); }
    return;
  }
  if (command === "bridge") {
    if (args.length !== 2) throw Error("Uso: sonepar:portal -- bridge entrada-rica.json salida-revision.json");
    const rows: Price[] = JSON.parse(await readFile(args[0], "utf8"));
    if (!Array.isArray(rows)) throw Error("La entrada debe ser un array");
    const converted = toImporter(rows);
    if (!converted.length) throw Error("No hay precios unitarios verificados compatibles");
    const output = path.resolve(args[1]);
    if (path.basename(output) === "precios_sonepar.json") throw Error("La salida debe revisarse antes de publicarse al importador");
    await atomic(output, converted);
    console.log(`${converted.length} de ${rows.length} precios preparados para revisión: ${output}`);
    return;
  }
  if (command === "extract") {
    const started = Date.now();
    const option = (name: string, fallback?: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
    const input = path.resolve(option("--input", "data/automation/sonepar/catalago_sonepar.json")!);
    const output = path.resolve(option("--output", path.join(privateDir, "resultado-rico.json"))!);
    const outputFile = args.includes("--timestamped") ? output.replace(/(\.json)?$/, `-${new Date().toISOString().replace(/[:.]/g, "-")}.json`) : output;
    const summaryFile = `${outputFile}.summary.json`;
    const stateFile = args.includes("--resume") ? `${output}.state.json` : `${outputFile}.state.json`;
    let interval = Number(option("--interval-ms", "1000"));
    const limit = Number(option("--limit", "0"));
    let counts: Record<string, number> = {};
    let pages = 0; let searches = 0; let sources: Record<string, number> = {};
    const tally = (state: { results: Price[]; pageKeys: string[]; searched: string[] }) => {
      counts = {}; sources = {}; pages = state.pageKeys.length; searches = state.searched.length;
      for (const row of state.results) { counts[row.estado] = (counts[row.estado] ?? 0) + 1; sources[row.fuente] = (sources[row.fuente] ?? 0) + 1; }
    };
    try {
      if (!adapterReady) throw Error("Extracción bloqueada: adaptador DOM sin inspeccionar ni validar");
      try {
        const throttle = JSON.parse(await readFile(throttleFile, "utf8"));
        if (Number.isFinite(throttle.intervalMs)) interval = Math.max(interval, throttle.intervalMs);
        const delay = Date.parse(throttle.retryAfter) - Date.now();
        if (delay > 7200000) throw Error("El proveedor requiere esperar antes de una nueva ejecución");
        if (delay > 0) {
          console.log(`Sonepar: respetando pausa por límite del proveedor (${Math.ceil(delay / 1000)} s)`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (!Number.isInteger(limit) || limit < 0 || (!fullValidated && (limit < 1 || limit > 4))) throw Error("Solo se permite la prueba pequeña de hasta cuatro productos; falta validación real");
      const info = await stat(session);
      if ((info.mode & 0o077) !== 0) throw Error("La sesión debe tener permisos 600");
      const allProducts = JSON.parse(await readFile(input, "utf8"));
      const products = limit ? allProducts.slice(0, limit) : allProducts;
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ storageState: session });
        const adapter = await createAdapter(context, products);
        const state = await runExtraction(adapter, products, stateFile, interval);
        tally(state);
        // El checkpoint conserva cadenas decimales; el JSON de intercambio usa números sin redondear.
        const order = new Map(products.map((row: { supplierRef: string }, index: number) => [row.supplierRef, index]));
        const results = [...state.results].sort((a, b) => Number(order.get(a.supplierRef) ?? 0) - Number(order.get(b.supplierRef) ?? 0));
        await atomic(outputFile, results.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
          value !== null && ["precioBruto", "precioNeto", "precioMostradoSinClasificar", "precioBrutoUnitario", "precioNetoUnitario", "cantidadPrecioMostrado"].includes(key) ? Number(value) : value,
        ]))));
        await atomic(session, await context.storageState());
      } finally { await browser.close(); }
      await atomic(summaryFile, { status: "done", startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, timingScope: "current_invocation", resumed: args.includes("--resume"), counts, sources, pages, searches });
      console.log(`Extracción terminada: ${outputFile}`);
    } catch (error) {
      if (error instanceof RateLimit) {
        await atomic(throttleFile, { intervalMs: Math.max(interval, Math.min(30000, Math.max(2000, interval * 2))), retryAfter: new Date(Date.now() + error.retryAfterMs).toISOString() });
      }
      try {
        const partial = JSON.parse(await readFile(stateFile, "utf8"));
        if (Array.isArray(partial.results) && Array.isArray(partial.pageKeys) && Array.isArray(partial.searched)) tally(partial);
      } catch { /* No progress file exists before the first completed page. */ }
      await atomic(summaryFile, { status: "stopped", startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, counts, sources, pages, searches, error: safeError(error) });
      throw error;
    }
    return;
  }
  console.log("Uso: npm run sonepar:portal -- login [URL] | extract | bridge entrada-rica.json salida-revision.json");
}
main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
