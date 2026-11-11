// Vacía el catálogo de materiales y lo vuelve a crear desde el JSON «Ya comprado» de Sonepar.
// El precio de cada artículo es el último precio UNITARIO pagado en sus facturas y albaranes (neto de descuentos);
// si no se ha comprado, el de tarifa del JSON.
//   npx tsx scripts/rebuild-catalog.ts <sonepar.json> [--dry-run]
//   npx tsx scripts/rebuild-catalog.ts <sonepar.json> --solo-precio-actual   → no borra nada: solo anota el precio actual de Sonepar
import { readFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { parseSoneparJson } from "../src/lib/catalog-sonepar";
import { buildRows, loadExportLines, type ExportItem } from "../src/lib/catalog-export";

async function main() {
  const file = process.argv[2];
  if (!file) throw Error("Indica la ruta del JSON de Sonepar.");
  const dry = process.argv.includes("--dry-run");
  const company = await db.company.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const parsed = parseSoneparJson(await readFile(file, "utf8"));
  const exportLines = await loadExportLines(company.id);
  if (process.argv.includes("--solo-precio-actual")) {
    let updated = 0;
    for (const i of parsed.items) {
      if (!i.supplierRef) continue;
      const r = await db.catalogItem.updateMany({ where: { companyId: company.id, supplierRef: i.supplierRef }, data: { ...(i.currentPrice === undefined ? {} : { currentPrice: i.currentPrice, currentPriceAt: new Date(i.currentPriceAt!) }), imageUrl: i.imageUrl ?? "" } });
      updated += r.count;
    }
    return console.log(JSON.stringify({ conPrecioActual: parsed.items.filter((i) => i.currentPrice !== undefined).length, actualizados: updated }));
  }
  const items: ExportItem[] = parsed.items.map((i) => ({ reference: i.reference, supplierRef: i.supplierRef ?? "", description: i.description, brand: i.brand, unit: i.unit, supplier: i.supplier ?? "", price: Number(i.price), currentPrice: i.currentPrice === undefined ? null : Number(i.currentPrice), currentPriceAt: i.currentPriceAt ? new Date(i.currentPriceAt) : null, imageUrl: i.imageUrl ?? "" }));
  const rows = buildRows(items, exportLines);
  const data = rows.map((r) => ({
    companyId: company.id,
    reference: r.item.reference,
    description: r.item.description,
    brand: r.item.brand,
    unit: r.item.unit,
    supplier: r.item.supplier,
    supplierRef: r.item.supplierRef,
    price: (r.price ?? 0).toFixed(4),
    currentPrice: r.item.currentPrice ?? null,
    currentPriceAt: r.item.currentPriceAt ?? null,
    imageUrl: r.item.imageUrl ?? "",
  }));
  const summary = {
    leidos: parsed.items.length,
    omitidos: parsed.skipped,
    conPrecioPagado: rows.filter((r) => r.last).length,
    soloTarifa: rows.filter((r) => !r.last && r.price !== null).length,
    sinPrecio: rows.filter((r) => r.price === null).length,
  };
  if (dry) return console.log("SIMULACIÓN", JSON.stringify(summary));
  const before = await db.catalogItem.count({ where: { companyId: company.id } });
  await db.$transaction(async (tx) => {
    await tx.catalogItem.deleteMany({ where: { companyId: company.id } });
    await tx.catalogItem.createMany({ data });
    await tx.audit.create({ data: { companyId: company.id, userId: (await tx.user.findFirstOrThrow({ where: { companyId: company.id }, orderBy: { createdAt: "asc" } })).id, action: `Rehacer catálogo (${before} borrados, ${data.length} creados)`, entityId: company.id } });
  });
  console.log(JSON.stringify({ borrados: before, creados: data.length, ...summary }));
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exitCode = 1; });
