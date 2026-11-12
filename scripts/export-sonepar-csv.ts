// Exporta también artículos sin precio del CSV histórico, sin modificar la base de datos.
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { splitLine } from "../src/lib/catalog-csv";

async function main() {
  process.umask(0o077);
  const source = process.argv[2] ?? "exports/catalogo-materiales.csv";
  const directory = path.resolve(process.env.SONEPAR_EXCHANGE_DIR ?? "data/automation/sonepar");
  const lines = (await readFile(source, "utf8")).replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  const head = splitLine(lines[0], ";");
  const fields = { reference: "Referencia", supplierRef: "Ref. proveedor", description: "Descripción", brand: "Marca", supplier: "Proveedor" };
  for (const title of Object.values(fields)) if (!head.includes(title)) throw Error(`Falta columna ${title}`);
  const rows = lines.slice(1).map(line => {
    const values = splitLine(line, ";");
    return Object.fromEntries(Object.entries(fields).map(([key, title]) => [key, values[head.indexOf(title)] ?? ""]));
  }).filter(row => row.supplier.trim().toLowerCase() === "sonepar").map(row => ({ ...row, supplier: "Sonepar" }));
  if (!rows.length) throw Error("El CSV no tiene productos Sonepar");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.export-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(rows, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await rename(temporary, path.join(directory, "catalago_sonepar.json"));
  console.log(`Exportados ${rows.length} artículos Sonepar desde ${source}. No modifica la base de datos ni inicia el plazo de importación.`);
}
main().catch(error => { console.error("Error al exportar Sonepar:", error); process.exitCode = 1; });
