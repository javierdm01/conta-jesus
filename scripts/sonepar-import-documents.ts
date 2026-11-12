import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { inventoryOperation } from "../src/lib/inventory";
import { purchaseOperation } from "../src/lib/purchases";
import { parseSoneparPdf } from "../src/lib/sonepar";
import { detectKind, documentRefs } from "../src/lib/document-kind";
import { soneparNumber, soneparStockPlan } from "../src/lib/sonepar-import";
import { dec, sum } from "../src/lib/money";
import { atomic } from "./sonepar-portal-core";
import type { RemoteInvoice } from "./sonepar-documents";

process.umask(0o077);
const root = path.resolve(process.env.SONEPAR_EXCHANGE_DIR ?? "data/automation/sonepar");
const documentDir = path.resolve(process.env.DOCUMENT_DIR ?? "data/documents");
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const companies = await db.company.findMany({ where: process.env.SONEPAR_COMPANY_ID ? { id: process.env.SONEPAR_COMPANY_ID } : {}, take: 2 });
  if (companies.length !== 1) throw Error("Selecciona una empresa para importar documentos Sonepar");
  const companyId = companies[0].id;
  const user = await db.user.findFirstOrThrow({ where: { companyId, active: true, role: "ADMIN" }, orderBy: { createdAt: "asc" }, include: { worker: true } });
  const actor = { ...user, companyId };
  const supplier = await db.supplier.findFirstOrThrow({ where: { companyId, name: { equals: "Sonepar", mode: "insensitive" } } });
  const catalog = await db.catalogItem.findMany({ where: { companyId, supplier: { equals: "Sonepar", mode: "insensitive" } } });
  const manifest = JSON.parse(await readFile(path.join(root, "documents/manifest.json"), "utf8"));
  if (!Array.isArray(manifest.documents)) throw Error("No hay un manifiesto de PDF válido");
  const items = (manifest.documents as RemoteInvoice[]).sort((a, b) => (a.kind === b.kind ? a.date.localeCompare(b.date) : a.kind === "PURCHASE" ? -1 : 1));
  const results: { externalId: string; documentId?: string; status: string; reasons?: string[] }[] = [];
  await mkdir(documentDir, { recursive: true, mode: 0o700 });
  for (const item of items) {
    try {
      if (!/^[FA][A-Z0-9-]{3,70}$/.test(item.externalId) || !/^[A-Z0-9-]+-[a-f0-9]{12}\.pdf$/.test(item.file) || !/^[a-f0-9]{64}$/.test(item.sha256) || !["PURCHASE", "CREDIT"].includes(item.kind)) throw Error("Metadatos del documento no válidos");
      const filename = path.join(root, "documents", item.file), bytes = await readFile(filename);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== item.sha256 || bytes.subarray(0, 5).toString() !== "%PDF-") throw Error("El PDF no coincide con su huella");
      const native = execFileSync(process.env.PDFTOTEXT_PATH ?? "pdftotext", ["-layout", filename, "-"], { encoding: "utf8", maxBuffer: 5000000, timeout: 60000 });
      const parsed = parseSoneparPdf(native);
      const reasons: string[] = [];
      if (!parsed) reasons.push("No se pudo leer con seguridad la factura Sonepar");
      if (parsed && (!parsed.consistent || !dec(parsed.total).eq(dec(item.total).abs()) || parsed.date !== item.date)) reasons.push("El PDF y los datos del portal no coinciden en fecha o importes");
      if (detectKind(native) !== item.kind) reasons.push("El tipo del PDF no coincide con el portal");
      const plan = parsed && item.kind === "PURCHASE" ? soneparStockPlan(parsed, catalog) : null;
      if (plan) reasons.push(...plan.problems);
      const refs = documentRefs(native);
      const number = item.externalId.replace(/^([FA]\d{4,6}[A-Z])(\d+)$/, "$1-$2");
      const sourceId = `sonepar-doc:${companyId}:${item.externalId}`;
      const source = await db.syncTask.findUnique({ where: { id: sourceId } });
      const priorId = (source?.payload as { documentId?: string } | null)?.documentId;
      const existing = await db.document.findMany({ where: { companyId, OR: [{ hash }, { id: priorId ?? "none" }, { supplierId: supplier.id, kind: item.kind, number: { not: null } }] } });
      let document = existing.find(row => row.hash === hash || row.id === priorId || (row.number && [item.externalId, parsed?.number ?? ""].some(alias => soneparNumber(alias) === soneparNumber(row.number!))));
      if (document && document.hash !== hash) { results.push({ externalId: item.externalId, documentId: document.id, status: "conflict", reasons: ["Existe el mismo número con otro PDF; no se sustituye ni se repite stock"] }); continue; }
      if (document?.status === "CONFIRMED") {
        results.push({ externalId: item.externalId, documentId: document.id, status: "already_registered" }); continue;
      }
      if (dryRun) { results.push({ externalId: item.externalId, status: reasons.length ? "review" : "ready", reasons }); continue; }
      if (!document) {
        const stored = `${randomUUID()}.pdf`, destination = path.join(documentDir, stored);
        await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
        try {
          document = await db.$transaction(async tx => {
            const created = await tx.document.create({ data: { companyId, uploaderId: user.id, kind: item.kind, originalName: `${item.externalId}.pdf`, filename: stored, mime: "application/pdf", hash, status: "REVIEW", supplierId: supplier.id, number, date: new Date(item.date),
              net: parsed?.net, tax: parsed?.tax, text: native, refs: refs.albaranes,
              suggestion: JSON.parse(JSON.stringify({ supplierId: supplier.id, number, date: item.date, net: parsed?.net, tax: parsed?.tax, lines: plan?.lines ?? [], warnings: reasons })) } });
            await tx.syncTask.upsert({ where: { id: sourceId }, create: { id: sourceId, companyId, type: "SONEPAR_DOCUMENT", status: "REVIEW", payload: { documentId: created.id, hash, externalId: item.externalId } }, update: { status: "REVIEW", payload: { documentId: created.id, hash, externalId: item.externalId } } });
            await tx.audit.create({ data: { companyId, userId: user.id, action: "Descargar documento Sonepar automáticamente", entityId: created.id } });
            return created;
          });
        } catch (error) { await unlink(destination).catch(() => {}); throw error; }
      }
      if (reasons.length || !parsed) { results.push({ externalId: item.externalId, documentId: document.id, status: "review", reasons }); continue; }
      if (item.kind === "CREDIT") {
        const sg = { supplierId: supplier.id, number, date: parsed.date, net: parsed.net, tax: parsed.tax, lines: [], warnings: [] };
        await db.document.update({ where: { id: document.id }, data: { suggestion: sg } });
        const result = await purchaseOperation(actor, "purchase-archive", { ids: [document.id] });
        if ((result as { archived: number }).archived !== 1) throw Error("El abono necesita revisión antes de confirmarse");
        results.push({ externalId: item.externalId, documentId: document.id, status: "credit_registered" });
      } else if (plan) {
        const receipts = refs.albaranes.length ? await db.document.findMany({ where: { companyId, supplierId: supplier.id, kind: "DELIVERY", status: "CONFIRMED", number: { in: refs.albaranes } }, include: { stockLots: true } }) : [];
        if (receipts.length) {
          const lots = receipts.flatMap(row => row.stockLots);
          const reconciled = plan.lines.map(line => {
            if (line.financial) return line;
            const matches = lots.filter(lot => lot.reference.toUpperCase() === line.reference.toUpperCase() && lot.unit === line.unit);
            if (matches.length !== 1 || !matches[0].received.eq(line.quantity) || matches[0].invoiceDocumentId) throw Error("La conciliación con el albarán no es inequívoca; no se duplica la entrada");
            return { ...line, lotId: matches[0].id };
          });
          if (lots.some(lot => !reconciled.some(line => "lotId" in line && line.lotId === lot.id))) throw Error("La factura no cubre todos los lotes del albarán; revisión necesaria");
          await inventoryOperation(actor, "stock-reconcile", { documentId: document.id, supplierId: supplier.id, number, date: parsed.date, net: parsed.net, tax: parsed.tax, reviewed: true, receiptIds: receipts.map(row => row.id), lines: reconciled });
          results.push({ externalId: item.externalId, documentId: document.id, status: "reconciled" });
        } else {
          await inventoryOperation(actor, "stock-confirm", { documentId: document.id, supplierId: supplier.id, number, date: parsed.date, net: parsed.net, tax: parsed.tax, reviewed: true, lines: plan.lines });
          results.push({ externalId: item.externalId, documentId: document.id, status: "stock_received" });
        }
      }
      await db.syncTask.updateMany({ where: { id: sourceId }, data: { status: "DONE" } });
    } catch (error) {
      results.push({ externalId: item.externalId, status: "review", reasons: [error instanceof Error ? error.message.split("\n")[0] : "Error de importación"] });
    }
    await atomic(path.join(root, "documents/import-result.json"), { checkedAt: new Date().toISOString(), dryRun, results });
  }
  // Los abonos son económicos. Las devoluciones físicas se ejecutan solo con un plan separado e inequívoco.
  const counts = Object.fromEntries([...new Set(results.map(row => row.status))].map(status => [status, results.filter(row => row.status === status).length]));
  await atomic(path.join(root, "documents/import-result.json"), { checkedAt: new Date().toISOString(), dryRun, counts, results });
  console.log(JSON.stringify({ soneparDocuments: counts }));
}
main().catch(() => { console.error("No se pudo iniciar la importación de documentos Sonepar; revisa la configuración y el manifiesto"); process.exitCode = 1; }).finally(() => db.$disconnect());
