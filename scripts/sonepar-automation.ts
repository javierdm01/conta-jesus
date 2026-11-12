import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db } from "../src/lib/db";
import { parseSoneparPrices, soneparImportReady } from "../src/lib/sonepar-prices";

process.umask(0o077);
const directory = path.resolve(process.env.SONEPAR_EXCHANGE_DIR ?? "data/automation/sonepar");
const file = (name: string) => path.join(directory, name);
type State = { companyId: string; exportedAt: string; references: string[]; imported?: boolean };
async function atomic(name: string, value: unknown) {
  const temporary = path.join(path.dirname(file(name)), `.${path.basename(name)}.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await rename(temporary, file(name));
}
async function optional(name: string) {
  try {
    const info = await lstat(file(name));
    if (!info.isFile() || info.isSymbolicLink() || info.size > 50_000_000) throw Error(`Archivo no permitido: ${name}`);
    return await readFile(file(name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function cycle() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // El bloqueo de sesión se mantiene en una transacción durante el ciclo completo.
  await db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(738201994) AS locked`;
    if (!lock.locked) return;
    const companies = await tx.company.findMany({
      where: process.env.SONEPAR_COMPANY_ID ? { id: process.env.SONEPAR_COMPANY_ID } : {}, select: { id: true }, take: 2,
    });
    if (companies.length !== 1) throw Error("Configura SONEPAR_COMPANY_ID: debe existir una única empresa seleccionada");
    const companyId = companies[0].id;
    const previous = await optional("estado.json");
    let state: State | null = previous ? JSON.parse(previous) : null;
    if (state && state.companyId !== companyId) throw Error("La carpeta pertenece a otra empresa");
    const incoming = await optional("precios_sonepar.json");
    if (!state || (state.imported && Date.now() - Date.parse(state.exportedAt) >= 86400000 && !incoming)) {
      if (incoming) throw Error("Hay precios sin una exportación previa; retíralos antes de iniciar");
      const items = await tx.catalogItem.findMany({
        where: { companyId, supplier: { equals: "Sonepar", mode: "insensitive" } },
        select: { reference: true, supplierRef: true, description: true, brand: true },
        orderBy: [{ supplierRef: "asc" }, { id: "asc" }],
      });
      if (!items.length) throw Error("No hay artículos Sonepar para exportar");
      state = { companyId, exportedAt: new Date().toISOString(), references: items.map(i => i.supplierRef), imported: false };
      await atomic("catalago_sonepar.json", items.map(i => ({ ...i, supplier: "Sonepar" })));
      await atomic("estado.json", state);
      console.log(`Sonepar: exportados ${items.length} artículos; importación disponible en una hora`);
      return;
    }
    if (!incoming || !state || !soneparImportReady(state.exportedAt)) return;
    const rows = parseSoneparPrices(incoming);
    const digest = createHash("sha256").update(incoming).digest("hex");
    const receiptId = `sonepar:${companyId}:${digest}`;
    const receipt = await tx.syncTask.findUnique({ where: { id: receiptId } });
    if (!receipt) {
      if (state.imported) throw Error("Esta exportación ya recibió precios; espera al siguiente ciclo");
      const exported = new Set(state.references);
      for (const row of rows) {
        if (!exported.has(row.supplierRef)) throw Error(`Referencia no exportada: ${row.supplierRef}`);
        const result = await tx.catalogItem.updateMany({
          where: { companyId, supplier: { equals: "Sonepar", mode: "insensitive" }, supplierRef: row.supplierRef },
          data: { currentPrice: new Prisma.Decimal(row.precio_neto), currentPriceAt: new Date(),
            supplierGrossPrice: new Prisma.Decimal(row.precio_bruto), supplierPriceSource: row.fuente },
        });
        if (!result.count) throw Error(`Referencia inexistente: ${row.supplierRef}`);
      }
      await tx.syncTask.create({ data: { id: receiptId, companyId, type: "SONEPAR_PRICES", status: "DONE",
        payload: { digest, rows: rows.length, exportedAt: state.exportedAt } } });
    }
    // El recibo transaccional permite recuperar fallos entre el commit y el archivado.
  }, { timeout: 120000, maxWait: 10000 });

  // Archivar solo después de confirmar el commit. No borrar un archivo reemplazado mientras se importaba.
  await db.$transaction(async tx => {
  const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(738201994) AS locked`;
  if (!lock.locked) return;
  const incoming = await optional("precios_sonepar.json");
  if (incoming) {
    const digest = createHash("sha256").update(incoming).digest("hex");
    const previous = await optional("estado.json");
    const state: State | null = previous ? JSON.parse(previous) : null;
    if (state && await tx.syncTask.findUnique({ where: { id: `sonepar:${state.companyId}:${digest}` } })) {
      await mkdir(file("procesados"), { recursive: true, mode: 0o700 });
      await atomic(`procesados/${digest}.json`, JSON.parse(incoming));
      // rename conserva el archivo original para auditoría y evita borrarlo.
      await atomic("estado.json", { ...state, imported: true });
      await atomic("resultado.json", { ok: true, digest, importedAt: new Date().toISOString() });
      await rename(file("precios_sonepar.json"), file(`procesados/${digest}.original.json`));
      console.log(`Sonepar: precios importados y archivados (${digest.slice(0, 12)})`);
    }
  }
  }, { timeout: 30000 });
}

async function main() {
  do {
    try { await cycle(); }
    catch (error) {
      console.error("Error en automatización Sonepar:", error);
      try { await atomic("error.json", { at: new Date().toISOString(), error: String(error) }); }
      catch (reportError) { console.error("No se pudo guardar el error:", reportError); }
      if (process.argv.includes("--once")) { process.exitCode = 1; break; }
    }
    if (process.argv.includes("--once")) break;
    await new Promise(resolve => setTimeout(resolve, 60000));
  } while (true);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
}
