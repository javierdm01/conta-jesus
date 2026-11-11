// Genera el CSV del catálogo desde la base de datos: npx tsx scripts/export-catalog.ts <salida.csv> [origen]
import { writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { catalogCsv } from "../src/lib/catalog-export";

async function main() {
  const out = process.argv[2] ?? "catalogo-materiales.csv";
  const origin = process.argv[3] ?? "http://localhost:3000";
  const company = await db.company.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const { csv, rows } = await catalogCsv(company.id, origin);
  await writeFile(out, csv, "utf8");
  const priced = rows.filter((r) => r.last).length;
  console.log(JSON.stringify({ artículos: rows.length, conPrecioPagado: priced, soloTarifa: rows.filter((r) => !r.last && r.price !== null).length, sinPrecio: rows.filter((r) => r.price === null).length, asociados: rows.filter((r) => r.documents.length).length, porDescripcion: rows.filter((r) => r.how.startsWith("descripción")).length }));
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exitCode = 1; });
