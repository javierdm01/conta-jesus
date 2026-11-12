// Alta inicial explícita desde el CSV histórico. Solo admite un catálogo vacío.
import { readFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { splitLine, parsePrice } from "../src/lib/catalog-csv";

async function main() {
  const companies = await db.company.findMany({ where: process.env.SONEPAR_COMPANY_ID ? { id: process.env.SONEPAR_COMPANY_ID } : {}, take: 2 });
  if (companies.length !== 1) throw Error("Selecciona una empresa con SONEPAR_COMPANY_ID");
  const companyId = companies[0].id;
  const lines = (await readFile(process.argv[2] ?? "exports/catalogo-materiales.csv", "utf8")).replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  const header = splitLine(lines[0], ";");
  const required = ["Referencia", "Ref. proveedor", "Descripción", "Marca", "Proveedor", "Unidad", "Precio unitario (€, sin IVA)", "Precio actual en Sonepar (€)", "Fecha del precio actual"];
  for (const title of required) if (!header.includes(title)) throw Error(`Falta columna ${title}`);
  const data = lines.slice(1).flatMap(line => {
    const values = splitLine(line, ";");
    const get = (title: string) => values[header.indexOf(title)] ?? "";
    if (get("Proveedor").trim().toLowerCase() !== "sonepar") return [];
    const date = get("Fecha del precio actual");
    const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
    const currentPrice = parsePrice(get("Precio actual en Sonepar (€)"));
    if (!get("Descripción")) throw Error("Artículo sin descripción");
    return [{ companyId, reference: get("Referencia"), supplierRef: get("Ref. proveedor"), description: get("Descripción"),
      brand: get("Marca"), supplier: "Sonepar", unit: get("Unidad") || "ud",
      price: parsePrice(get("Precio unitario (€, sin IVA)")) ?? "0", currentPrice,
      currentPriceAt: currentPrice && parts ? new Date(`${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}T00:00:00Z`) : null }];
  });
  if (!data.length) throw Error("Sin artículos Sonepar");
  await db.$transaction(async tx => {
    await tx.$executeRaw`LOCK TABLE "CatalogItem" IN EXCLUSIVE MODE`;
    if (await tx.catalogItem.count({ where: { companyId } })) throw Error("El catálogo no está vacío; no se sobrescribe");
    await tx.catalogItem.createMany({ data });
    await tx.audit.create({ data: { companyId, userId: "sonepar-automation", action: `SONEPAR_INITIAL_CSV:${data.length}`, entityId: companyId } });
  });
  console.log(`Cargados ${data.length} artículos desde el CSV; documentos y existencias conservados`);
}
main().catch(error => { console.error("Error al cargar catálogo Sonepar:", error); process.exitCode = 1; }).finally(() => db.$disconnect());
