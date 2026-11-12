// Publica exclusivamente precios verificados y con la misma unidad que el catálogo.
import { randomUUID } from "node:crypto";
import { link, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { toImporter, type Price } from "./sonepar-portal-core";

const normalizeUnit = (unit: string) => {
  const value = unit.toLowerCase().replace(/[.\s]/g, "");
  if (["ud", "uds", "unid", "unidad", "unidades"].includes(value)) return "ud";
  if (["m", "metro", "metros"].includes(value)) return "m";
  return value;
};
async function main() {
  process.umask(0o077);
  const directory = path.resolve(process.env.SONEPAR_EXCHANGE_DIR ?? "data/automation/sonepar");
  const input = process.argv[2];
  if (!input) throw Error("Indica el JSON enriquecido que se publicará");
  const state = JSON.parse(await readFile(path.join(directory, "estado.json"), "utf8"));
  if (state.imported) throw Error("La exportación actual ya se importó; espera a una nueva exportación");
  if (!state.companyId || !Array.isArray(state.references)) throw Error("Estado de exportación inválido");
  const rows: Price[] = JSON.parse(await readFile(input, "utf8"));
  if (!Array.isArray(rows)) throw Error("La salida enriquecida no es una lista");
  const exported = new Set<string>(state.references);
  const catalog = await db.catalogItem.findMany({ where: {
    companyId: state.companyId, supplier: { equals: "Sonepar", mode: "insensitive" },
  }, select: { supplierRef: true, unit: true } });
  const safe = rows.filter(row => {
    const queriedAt = Date.parse(row.fechaConsulta);
    if (!Number.isFinite(queriedAt) || Date.now() - queriedAt > 86400000 || queriedAt > Date.now() + 300000) return false;
    if (!exported.has(row.supplierRef) || Number(row.cantidadPrecioMostrado) !== 1 || !row.unidad) return false;
    const matches = catalog.filter(item => item.supplierRef === row.supplierRef);
    return matches.length > 0 && matches.every(item => normalizeUnit(item.unit) === normalizeUnit(row.unidad!));
  });
  const converted = toImporter(safe);
  if (!converted.length) throw Error("No hay precios unitarios seguros para publicar");
  const temporary = path.join(directory, `.precios-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(converted, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  try {
    // link es atómico y falla con EEXIST si hay una importación pendiente.
    await link(temporary, path.join(directory, "precios_sonepar.json"));
  } finally { await unlink(temporary); }
  console.log(`Sonepar: publicados ${converted.length} precios unitarios; omitidos ${rows.length - converted.length} no verificables o con otra unidad`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Error al publicar precios Sonepar"); process.exitCode = 1; }).finally(() => db.$disconnect());
