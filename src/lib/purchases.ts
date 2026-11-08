import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { admin, AppError, type Actor } from "./access";
import * as v from "./validation";
import { documentLineNet, dec, cents } from "./money";
import { documentRefs } from "./document-kind";
import { parseSoneparPdf } from "./sonepar";
import type { OcrSuggestion } from "./ocr";

// Abonos de proveedor: documento económico (no mueve almacén) ligado a las facturas o albaranes que corrige.
export async function purchaseOperation(u: Actor, action: string, input: unknown) {
  admin(u);
  if (action === "purchase-archive") return archive(u, input);
  if (action !== "credit-confirm") throw new AppError("Acción desconocida.", 404);
  const d = z
    .object({
      documentId: v.id,
      supplierId: v.id,
      number: v.name,
      date: v.date,
      net: v.money,
      tax: v.money,
      relatedIds: z.array(v.id).max(100).default([]),
      reviewed: z.literal(true),
    })
    .parse(input);
  const companyId = u.companyId;
  return db
    .$transaction(async (tx) => {
      const doc = await tx.document.findFirst({
        where: { id: d.documentId, companyId, kind: "CREDIT", status: { in: ["REVIEW", "FAILED"] } },
      });
      if (!doc) throw new AppError("Documento ya confirmado o no disponible.", 409);
      if (!(await tx.supplier.findFirst({ where: { id: d.supplierId, companyId } })))
        throw new AppError("Proveedor no disponible.", 404);
      const related = [...new Set(d.relatedIds)];
      const found = related.length
        ? await tx.document.count({
            where: { id: { in: related }, companyId, supplierId: d.supplierId, kind: { in: ["PURCHASE", "DELIVERY"] }, status: "CONFIRMED" },
          })
        : 0;
      if (found !== related.length)
        throw new AppError("Los documentos asociados deben ser facturas o albaranes confirmados del mismo proveedor.");
      // Se guarda en positivo: el signo lo pone el tipo de documento (CREDIT resta).
      await tx.document.update({
        where: { id: doc.id },
        data: {
          supplierId: d.supplierId,
          number: d.number.trim().toUpperCase(),
          date: new Date(d.date),
          net: d.net,
          tax: d.tax,
          relatedIds: related,
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      await tx.audit.create({ data: { companyId, userId: u.id, action: "Confirmar abono de proveedor", entityId: doc.id } });
      return { id: doc.id };
    })
    .catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new AppError("Ya existe un abono de este proveedor con ese número.", 409);
      throw e;
    });
}

const abs = (x: string) => dec(x).abs();
const iso = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Archiva las facturas y abonos leídos que cuadran, sin pasar por almacén ni trabajos: quedan como compras del proveedor.
 * Lo que no cuadra (sin proveedor, sin importes, líneas que no suman la base) se deja para revisarlo a mano, con su motivo.
 * Las facturas van primero para poder ligar después cada abono con la factura que cita («FRA. F02000R-122115»).
 */
async function archive(u: Actor, input: unknown) {
  const { ids } = z.object({ ids: z.array(v.id).max(500).optional() }).parse(input);
  const companyId = u.companyId;
  const docs = await db.document.findMany({
    where: { companyId, status: "REVIEW", kind: { in: ["PURCHASE", "CREDIT"] }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: [{ kind: "desc" }, { createdAt: "asc" }], // PURCHASE antes que CREDIT
  });
  let archived = 0;
  const skipped: { id: string; name: string; reason: string }[] = [];
  for (const doc of docs) {
    let sg = doc.suggestion as OcrSuggestion | null;
    // Sonepar: número, fecha y totales se leen de su posición fija; solo se acepta si base + IVA = total.
    const so = parseSoneparPdf(doc.text);
    if (so?.consistent && sg) sg = { ...sg, number: so.number, date: so.date, net: so.net, tax: so.tax };
    const skip = (reason: string) => skipped.push({ id: doc.id, name: doc.originalName, reason });
    if (!sg?.supplierId) { skip("No se ha reconocido el proveedor."); continue; }
    if (!sg.number || !sg.date || !iso.test(sg.date)) { skip("Falta el número o la fecha."); continue; }
    if (sg.net == null || sg.tax == null || sg.net === "" || sg.tax === "") { skip("Faltan la base o el IVA."); continue; }
    const credit = doc.kind === "CREDIT";
    const net = abs(sg.net), tax = abs(sg.tax);
    // Sonepar: las líneas impresas (con su importe exacto) mandan si suman la base; si no, las que propuso el OCR.
    const exact = so?.consistent && so.lines.length && Math.abs(so.lines.reduce((t, l) => t + Number(l.net), 0) * (credit ? -1 : 1) - Number(net)) <= 0.1 ? so.lines : null;
    const lines = (exact
      ? exact.map((l) => ({ description: l.description, reference: l.reference, quantity: l.quantity, unit: "ud", price: l.price, discount: l.discount, observedUnitPrice: "", exactNet: l.net }))
      : (sg.lines ?? []).map((l) => ({ ...l, exactNet: "" }))
    )
      .filter((l) => l.description && l.quantity && Number(l.quantity) !== 0)
      .map((l) => {
        const price = l.price || l.observedUnitPrice || "";
        const q = abs(l.quantity);
        return {
          description: l.description.slice(0, 200),
          reference: l.reference ?? "",
          unit: l.unit || "ud",
          quantity: q.toString(),
          price: price ? abs(price).toString() : null,
          discount: l.discount || "0",
          net: l.exactNet ? abs(l.exactNet).toString() : price ? documentLineNet(q, abs(price), l.discount || 0) : null,
        };
      });
    // Si las líneas llevan precio, tienen que sumar la base (con holgura de redondeo).
    const priced = lines.filter((l) => l.net != null);
    if (priced.length === lines.length && lines.length) {
      const diff = priced.reduce((a, l) => a.plus(l.net!), dec(0)).minus(net).abs();
      if (diff.gt(Math.max(0.1, lines.length * 0.02))) { skip(`Las líneas suman ${cents(priced.reduce((a, l) => a.plus(l.net!), dec(0)))} y la base es ${cents(net)}.`); continue; }
    }
    const refs = documentRefs(doc.text);
    try {
      await db.$transaction(async (tx) => {
        const related = credit && refs.facturas.length
          ? (await tx.document.findMany({ where: { companyId, supplierId: sg.supplierId, kind: "PURCHASE", status: "CONFIRMED", number: { in: refs.facturas } }, select: { id: true } })).map((d) => d.id)
          : [];
        await tx.document.update({
          where: { id: doc.id },
          data: {
            supplierId: sg.supplierId,
            number: sg.number!.trim().toUpperCase(),
            date: new Date(sg.date!),
            net: cents(net),
            tax: cents(tax),
            refs: credit ? refs.facturas.concat(refs.albaranes) : refs.albaranes,
            relatedIds: related,
            status: "CONFIRMED",
            confirmedAt: new Date(),
            lines: { create: lines },
          },
        });
        await tx.audit.create({ data: { companyId, userId: u.id, action: credit ? "Archivar abono de proveedor" : "Archivar factura de proveedor", entityId: doc.id } });
      });
      archived++;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") skip("Ya existe un documento de este proveedor con ese número.");
      else throw e;
    }
  }
  return { archived, skipped };
}
