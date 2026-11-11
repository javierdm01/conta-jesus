// Referencias desplazadas en líneas de documentos confirmados: la referencia guardada pertenecía a la fila de al lado.
// Se vuelve a leer el texto de cada documento y se compara por descripción y cantidad.
//   npx tsx scripts/check-line-refs.ts            → diagnóstico (solo lectura)
//   npx tsx scripts/check-line-refs.ts --detalle  → además, línea por línea
//   npx tsx scripts/check-line-refs.ts --apply    → corrige (antes guarda las referencias antiguas en exports/)
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { parseOcr } from "../src/lib/ocr";
import { refKey } from "../src/lib/catalog-export";

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
async function main() {
  const docs = await db.document.findMany({ where: { status: "CONFIRMED", kind: { in: ["PURCHASE", "DELIVERY", "CREDIT"] } }, include: { lines: true } });
  const fixes: { id: string; document: string; description: string; old: string; next: string }[] = [];
  let total = 0,
    unmatched = 0;
  for (const d of docs) {
    const parsed = parseOcr(d.text ?? "", [], d.kind).lines as { reference: string; model?: string; description: string; quantity: string }[];
    for (const l of d.lines) {
      if (!refKey(l.reference ?? "")) continue;
      total++;
      const hits = parsed.filter((p) => norm(p.description).slice(0, 18) === norm(l.description).slice(0, 18) && Number(p.quantity) === Number(l.quantity));
      if (hits.length !== 1) {
        unmatched++;
        continue;
      }
      const own = [hits[0].reference, hits[0].model ?? ""].filter(Boolean);
      if (own.map(refKey).includes(refKey(l.reference ?? ""))) continue;
      fixes.push({ id: l.id, document: d.number ?? d.id, description: l.description, old: l.reference ?? "", next: hits[0].model || hits[0].reference });
    }
  }
  if (process.argv.includes("--detalle")) for (const f of fixes) console.log(`${f.document} | ${f.description.slice(0, 34)} | ${f.old} → ${f.next}`);
  if (process.argv.includes("--apply") && fixes.length) {
    await mkdir("exports", { recursive: true });
    const file = `exports/referencias-antes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    await writeFile(file, JSON.stringify(fixes, null, 2));
    await db.$transaction(fixes.map((f) => db.documentLine.update({ where: { id: f.id }, data: { reference: f.next } })));
    console.log(`Corregidas ${fixes.length} líneas. Referencias antiguas guardadas en ${file}`);
  }
  console.log(JSON.stringify({ documentos: docs.length, lineasConReferencia: total, sinPoderComparar: unmatched, referenciasQueNoSonDeSuFila: fixes.length, documentosAfectados: new Set(fixes.map((f) => f.document)).size }));
}
main().then(() => db.$disconnect());
