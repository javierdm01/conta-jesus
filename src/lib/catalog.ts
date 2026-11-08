import { z } from "zod";
import { db } from "./db";
import { admin, AppError, type Actor } from "./access";
import * as v from "./validation";

const unit = z.string().trim().min(1).max(12).default("ud");
const item = z.object({ reference: v.text, description: v.name, brand: v.text, unit, price: v.price, supplier: v.text, supplierRef: v.text });
export const invoiceLine = z.object({
  description: v.name,
  unit,
  quantity: v.quantity,
  price: v.price,
});

// Base de conocimiento de materiales (para presupuestos) y plantillas de factura.
export async function catalogOperation(u: Actor, action: string, input: unknown) {
  admin(u);
  const companyId = u.companyId;
  const audit = (text: string, entityId: string) =>
    db.audit.create({ data: { companyId, userId: u.id, action: text, entityId } });

  if (action === "catalog-save") {
    const d = item.extend({ id: v.id.optional() }).parse(input);
    const { id, ...data } = d;
    if (id) {
      const found = await db.catalogItem.findFirst({ where: { id, companyId } });
      if (!found) throw new AppError("Artículo no encontrado.", 404);
      await db.catalogItem.update({ where: { id }, data });
      return { id };
    }
    const row = await db.catalogItem.create({ data: { ...data, companyId } });
    await audit("Añadir artículo al catálogo", row.id);
    return { id: row.id };
  }

  if (action === "catalog-import") {
    const { items } = z.object({ items: z.array(item).min(1).max(1000) }).parse(input);
    // Un artículo ya cargado se actualiza (precio, descripción…); los demás se crean.
    // Identidad: proveedor + su referencia si la tiene; si no, la referencia de fabricante.
    const keyOf = (i: { reference: string; supplier: string; supplierRef: string }) =>
      i.supplierRef ? `${i.supplier.toLowerCase()}|${i.supplierRef.toLowerCase()}` : i.reference ? `|${i.reference.toLowerCase()}` : "";
    const existing = await db.catalogItem.findMany({
      where: { companyId, OR: [{ reference: { not: "" } }, { supplierRef: { not: "" } }] },
      select: { id: true, reference: true, supplier: true, supplierRef: true },
    });
    const byRef = new Map(existing.map((e) => [keyOf(e), e.id]));
    const seen = new Set<string>();
    const toCreate: typeof items = [];
    const toUpdate: { id: string; data: (typeof items)[number] }[] = [];
    for (const i of items) {
      const key = keyOf(i);
      if (key && seen.has(key)) continue; // repetida dentro del mismo archivo: vale la primera
      if (key) seen.add(key);
      const id = key ? byRef.get(key) : undefined;
      id ? toUpdate.push({ id, data: i }) : toCreate.push(i);
    }
    await db.$transaction(
      async (tx) => {
        if (toCreate.length) await tx.catalogItem.createMany({ data: toCreate.map((i) => ({ ...i, companyId })) });
        for (const x of toUpdate) await tx.catalogItem.update({ where: { id: x.id }, data: x.data });
      },
      { timeout: 30000 },
    );
    await audit(`Importar catálogo (${toCreate.length} nuevos, ${toUpdate.length} actualizados)`, companyId);
    return { created: toCreate.length, updated: toUpdate.length };
  }

  if (action === "catalog-delete") {
    const { id } = z.object({ id: v.id }).parse(input);
    const r = await db.catalogItem.deleteMany({ where: { id, companyId } });
    if (!r.count) throw new AppError("Artículo no encontrado.", 404);
    return { id };
  }

  if (action === "template-save") {
    const d = z.object({ name: v.name, lines: z.array(invoiceLine).min(1).max(100) }).parse(input);
    const row = await db.invoiceTemplate.create({ data: { companyId, name: d.name, lines: d.lines } });
    await audit("Crear plantilla de factura", row.id);
    return { id: row.id };
  }

  if (action === "template-delete") {
    const { id } = z.object({ id: v.id }).parse(input);
    const r = await db.invoiceTemplate.deleteMany({ where: { id, companyId } });
    if (!r.count) throw new AppError("Plantilla no encontrada.", 404);
    return { id };
  }

  throw new AppError("Acción desconocida.", 404);
}
