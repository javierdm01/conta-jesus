// Recalcula los albaranes y facturas citados (refs) de las facturas y abonos ya archivados, a partir de su texto.
// Uso: docker compose exec web npx tsx scripts/backfill-refs.ts
import { PrismaClient } from "@prisma/client";
import { documentRefs } from "../src/lib/document-kind";

const db = new PrismaClient();
async function main() {
const docs = await db.document.findMany({ where: { kind: { in: ["PURCHASE", "CREDIT"] }, status: "CONFIRMED" }, select: { id: true, kind: true, text: true } });
let changed = 0;
for (const d of docs) {
  const r = documentRefs(d.text);
  const refs = d.kind === "CREDIT" ? r.facturas.concat(r.albaranes) : r.albaranes;
  await db.document.update({ where: { id: d.id }, data: { refs } });
  changed++;
}
console.log(`${changed} documentos recalculados`);
await db.$disconnect();
}
main();
