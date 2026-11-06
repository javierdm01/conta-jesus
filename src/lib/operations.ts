import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { admin, accessibleJob, AppError, type Actor } from "./access";
import * as v from "./validation";
import { cents, dec, lineNet, documentLineNet, quotePrice, sum } from "./money";
import { inventoryOperation } from "./inventory";
import { purchaseOrderOperation } from "./purchase-orders";
import { userOperation } from "./users";
import { deleteDocuments } from "./document-delete";

type Tx = Prisma.TransactionClient;
const audit = (tx: Tx, u: Actor, action: string, entityId: string) =>
  tx.audit.create({
    data: { companyId: u.companyId, userId: u.id, action, entityId },
  });
const serial = <T>(fn: (tx: Tx) => Promise<T>) =>
  db.$transaction(fn, { isolationLevel: "Serializable" });
async function belongs(
  model: "customer" | "supplier" | "worker",
  id: string,
  companyId: string,
) {
  const entity = await (model === "customer"
    ? db.customer.findFirst({ where: { id, companyId } })
    : model === "supplier"
      ? db.supplier.findFirst({ where: { id, companyId } })
      : db.worker.findFirst({ where: { id, companyId, active: true } }));
  if (!entity)
    throw new AppError(
      "El registro seleccionado no pertenece a la empresa.",
      404,
    );
}
export async function operate(u: Actor, action: string, input: unknown) {
  const companyId = u.companyId;
  if (action.startsWith("stock-")) return inventoryOperation(u, action, input);
  if (action.startsWith("order-"))
    return purchaseOrderOperation(u, action, input);
  if (action.startsWith("user-")) return userOperation(u, action, input);
  // Técnicos y responsable; las reglas de propiedad se comprueban dentro.
  if (action === "document-delete") return deleteDocuments(u, input);
  if (
    ["customer", "supplier", "customerUpdate", "supplierUpdate"].includes(
      action,
    )
  ) {
    admin(u);
    const isCustomer = action.startsWith("customer"),
      updateId = action.endsWith("Update")
        ? z.object({ id: v.id }).parse(input).id
        : undefined;
    if (updateId)
      await belongs(isCustomer ? "customer" : "supplier", updateId, companyId);
    const d = z
      .object({
        name: v.name,
        taxId: v.text,
        phone: v.text,
        email: z.union([z.email(), z.literal("")]).default(""),
        address: v.text,
        contact: v.text,
        terms: v.text,
      })
      .parse(input);
    return serial(async (tx) => {
      const customer = {
          companyId,
          name: d.name,
          taxId: d.taxId,
          phone: d.phone,
          email: d.email,
          address: d.address,
        },
        supplier = {
          companyId,
          name: d.name,
          taxId: d.taxId,
          phone: d.phone,
          email: d.email,
          contact: d.contact,
          terms: d.terms,
        };
      const row = isCustomer
        ? updateId
          ? await tx.customer.update({
              where: { id: updateId },
              data: customer,
            })
          : await tx.customer.create({ data: customer })
        : updateId
          ? await tx.supplier.update({
              where: { id: updateId },
              data: supplier,
            })
          : await tx.supplier.create({ data: supplier });
      await audit(
        tx,
        u,
        `${updateId ? "Actualizar" : "Crear"} ${isCustomer ? "cliente" : "proveedor"}`,
        row.id,
      );
      return row;
    });
  }
  if (action === "worker" || action === "workerUpdate") {
    admin(u);
    const d = z
      .object({ name: v.name, hourlyCost: v.price, specialty: v.text })
      .parse(input);
    const updateId =
      action === "workerUpdate"
        ? z.object({ id: v.id }).parse(input).id
        : undefined;
    if (updateId) await belongs("worker", updateId, companyId);
    return serial(async (tx) => {
      const row = updateId
        ? await tx.worker.update({ where: { id: updateId }, data: d })
        : await tx.worker.create({ data: { companyId, ...d } });
      await audit(
        tx,
        u,
        updateId ? "Actualizar trabajador" : "Crear trabajador",
        row.id,
      );
      return row;
    });
  }
  if (action === "job" || action === "jobUpdate") {
    admin(u);
    const d = z
      .object({
        name: v.name,
        customerId: v.id,
        address: v.text,
        service: z.enum(v.services),
        workerId: v.id.optional(),
        plannedAt: v.date.optional(),
      })
      .parse(input);
    const updateId =
      action === "jobUpdate"
        ? z.object({ id: v.id }).parse(input).id
        : undefined;
    if (updateId) await accessibleJob(u, updateId);
    await belongs("customer", d.customerId, companyId);
    if (d.workerId) await belongs("worker", d.workerId, companyId);
    return serial(async (tx) => {
      const n = await tx.job.count({ where: { companyId } }),
        data = {
          ...d,
          workerId: d.workerId ?? null,
          plannedAt: d.plannedAt ? new Date(d.plannedAt) : null,
        };
      const row = updateId
        ? await tx.job.update({ where: { id: updateId }, data })
        : await tx.job.create({
            data: {
              ...data,
              companyId,
              number: `T-${String(n + 1).padStart(5, "0")}`,
            },
          });
      await audit(
        tx,
        u,
        updateId ? "Actualizar trabajo" : "Crear trabajo",
        row.id,
      );
      return row;
    });
  }
  if (action === "status") {
    const d = z
      .object({ jobId: v.id, status: z.enum(v.statuses) })
      .parse(input);
    await accessibleJob(u, d.jobId);
    if (u.role !== "ADMIN" && d.status !== "Finalizado")
      throw new AppError(
        "El técnico solo puede marcar el trabajo como finalizado.",
        403,
      );
    return serial(async (tx) => {
      const row = await tx.job.update({
        where: { id: d.jobId },
        data: {
          status: d.status,
          finishedAt: d.status === "Finalizado" ? new Date() : null,
        },
      });
      await audit(tx, u, `Estado: ${d.status}`, row.id);
      return { id: row.id };
    });
  }
  if (action === "hours") {
    const d = z
      .object({
        jobId: v.id,
        workerId: v.id,
        date: v.date,
        hours: v.hours,
        activity: z.enum([
          "Instalación",
          "Reparación",
          "Diagnóstico",
          "Mantenimiento",
          "Desplazamiento",
          "Preparación",
          "Otras",
        ]),
        billable: z.boolean(),
        notes: v.text,
        requestKey: v.requestKey,
      })
      .parse(input);
    if (dec(d.hours).gt(24))
      throw new AppError("Un parte no puede superar 24 horas.");
    await accessibleJob(u, d.jobId);
    await belongs("worker", d.workerId, companyId);
    if (u.role !== "ADMIN" && u.worker?.id !== d.workerId)
      throw new AppError("Solo puedes registrar tus propias horas.", 403);
    return serial(async (tx) => {
      const worker = await tx.worker.findUniqueOrThrow({
        where: { id: d.workerId },
      });
      const previous = await tx.timeEntry.findMany({
        where: { workerId: d.workerId, date: new Date(d.date) },
      });
      if (
        sum(previous.map((x) => x.hours.toString()))
          .plus(d.hours)
          .gt(24)
      )
        throw new AppError("El total diario del técnico supera 24 horas.");
      const row = await tx.timeEntry.create({
        data: {
          ...d,
          companyId,
          date: new Date(d.date),
          hourlyCost: worker.hourlyCost,
        },
      });
      await audit(tx, u, "Registrar horas", row.id);
      return { id: row.id };
    });
  }
  if (action === "cost") {
    const d = z
      .object({
        jobId: v.id,
        type: z.enum([
          "Materiales",
          "Desplazamiento",
          "Subcontratación",
          "Otros",
          "Gastos generales asignados",
        ]),
        description: v.name,
        amount: v.money,
        requestKey: v.requestKey,
      })
      .parse(input);
    await accessibleJob(u, d.jobId);
    if (u.role !== "ADMIN" && d.type !== "Materiales")
      throw new AppError("Solo puedes añadir materiales.", 403);
    return serial(async (tx) => {
      const row = await tx.cost.create({ data: { ...d, companyId } });
      await audit(tx, u, "Registrar coste", row.id);
      return { id: row.id };
    });
  }
  if (action === "sale") {
    admin(u);
    const d = z
      .object({
        jobId: v.id,
        number: v.name,
        description: v.name,
        date: v.date,
        dueAt: v.date.optional(),
        net: v.money,
        tax: v.money,
        withholding: v.money,
        collected: v.money,
        requestKey: v.requestKey,
        documentId: v.id.optional(),
      })
      .parse(input);
    await accessibleJob(u, d.jobId);
    if (
      dec(d.withholding).gt(d.net) ||
      dec(d.collected).gt(dec(d.net).plus(d.tax).minus(d.withholding))
    )
      throw new AppError(
        "Revisa la retención o el cobro: superan el importe permitido.",
      );
    return serial(async (tx) => {
      if (d.documentId) {
        const doc = await tx.document.findFirst({
          where: {
            id: d.documentId,
            companyId,
            kind: "SALE",
            status: { in: ["REVIEW", "FAILED"] },
          },
        });
        if (!doc) throw new AppError("Documento de venta no disponible.");
        await tx.document.update({
          where: { id: doc.id },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            number: d.number,
            jobId: d.jobId,
            net: d.net,
            tax: d.tax,
          },
        });
      }
      const row = await tx.sale.create({
        data: {
          ...d,
          number: d.number.trim().toUpperCase(),
          companyId,
          date: new Date(d.date),
          dueAt: d.dueAt ? new Date(d.dueAt) : null,
        },
      });
      await audit(tx, u, "Registrar factura de cliente", row.id);
      return row;
    });
  }
  if (action === "payment") {
    admin(u);
    const d = z.object({ saleId: v.id, collected: v.money }).parse(input);
    return serial(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: d.saleId, companyId },
      });
      if (!sale) throw new AppError("Factura no encontrada.", 404);
      if (
        dec(d.collected).gt(
          dec(sale.net.toString())
            .plus(sale.tax.toString())
            .minus(sale.withholding.toString()),
        )
      )
        throw new AppError("El cobro supera el total de la factura.");
      const row = await tx.sale.update({
        where: { id: sale.id },
        data: { collected: d.collected },
      });
      await audit(tx, u, `Actualizar cobro a ${d.collected}`, row.id);
      return row;
    });
  }
  if (action === "quote") {
    admin(u);
    const d = z
      .object({
        jobId: v.id,
        name: v.name,
        materials: v.money,
        hours: v.plannedHours,
        hourlyCost: v.price,
        travel: v.money,
        subcontract: v.money,
        other: v.money,
        overhead: v.money,
        margin: v.margin,
      })
      .parse(input);
    await accessibleJob(u, d.jobId);
    const cost = sum([
      d.materials,
      dec(d.hours).mul(d.hourlyCost),
      d.travel,
      d.subcontract,
      d.other,
      d.overhead,
    ]);
    const net = quotePrice(cost, d.margin);
    if (cost.gt("999999999999.99") || dec(net).gt("999999999999.99"))
      throw new AppError("El presupuesto supera el importe máximo permitido.");
    return serial(async (tx) => {
      const row = await tx.quote.create({
        data: {
          companyId,
          jobId: d.jobId,
          name: d.name,
          inputs: d,
          cost: cents(cost),
          net,
          plannedHours: d.hours,
        },
      });
      await audit(tx, u, "Crear presupuesto", row.id);
      return row;
    });
  }
  if (action === "approveQuote") {
    admin(u);
    const d = z.object({ quoteId: v.id }).parse(input);
    return serial(async (tx) => {
      const q = await tx.quote.findFirst({
        where: { id: d.quoteId, companyId },
      });
      if (!q) throw new AppError("Presupuesto no encontrado.", 404);
      await tx.quote.updateMany({
        where: { jobId: q.jobId },
        data: { approved: false },
      });
      await tx.quote.update({ where: { id: q.id }, data: { approved: true } });
      await audit(tx, u, "Aprobar presupuesto", q.id);
      return { id: q.id };
    });
  }
  if (action === "review") {
    admin(u);
    const d = z
      .object({
        documentId: v.id,
        supplierId: v.id,
        number: v.name,
        date: v.date,
        net: v.money,
        tax: v.money,
        supersedesId: v.id.optional(),
        lines: z.array(v.line).min(1).max(500),
        reviewed: z.literal(true),
      })
      .parse(input);
    await belongs("supplier", d.supplierId, companyId);
    for (const id of new Set(d.lines.map((x) => x.jobId)))
      await accessibleJob(u, id);
    if (d.lines.some((l) => Number(l.quantity) < 0 && !l.financial))
      throw new AppError(
        "Marca los abonos como conceptos económicos; no son material recibido.",
      );
    const lines = d.lines.map(({ financial: _, ...l }) => ({
      ...l,
      net: documentLineNet(l.quantity, l.price, l.discount),
    }));
    if (!sum(lines.map((l) => l.net)).eq(d.net))
      throw new AppError(
        "La suma neta de las líneas debe coincidir con la base del documento. Revisa descuentos, portes y redondeos.",
      );
    return serial(async (tx) => {
      const doc = await tx.document.findFirst({
        where: {
          id: d.documentId,
          companyId,
          status: { in: ["REVIEW", "FAILED"] },
          kind: { in: ["PURCHASE", "DELIVERY"] },
        },
      });
      if (!doc)
        throw new AppError("Documento ya confirmado o no disponible.", 409);
      if (d.supersedesId) {
        if (
          await tx.stockLot.count({
            where: { documentId: d.supersedesId, companyId },
          })
        )
          throw new AppError(
            "Este albarán tiene material de almacén. Elige «Factura de un albarán de almacén» para actualizar sus precios sin duplicar costes.",
          );
        const old = await tx.document.findFirst({
          where: {
            id: d.supersedesId,
            companyId,
            kind: "DELIVERY",
            status: "CONFIRMED",
            supplierId: d.supplierId,
            replacedBy: null,
          },
        });
        if (doc.kind !== "PURCHASE" || !old)
          throw new AppError(
            "Selecciona un albarán confirmado del mismo proveedor y pendiente de factura.",
          );
        await tx.cost.updateMany({
          where: { documentId: old.id, companyId },
          data: { reversed: true },
        });
      }
      const row = await tx.document.update({
        where: { id: doc.id },
        data: {
          supplierId: d.supplierId,
          number: d.number.trim().toUpperCase(),
          date: new Date(d.date),
          net: d.net,
          tax: d.tax,
          supersedesId: d.supersedesId,
          status: "CONFIRMED",
          confirmedAt: new Date(),
          lines: { create: lines },
          costs: {
            create: lines.map((l) => ({
              companyId,
              jobId: l.jobId,
              type: "Materiales",
              description: `${l.description} (${l.quantity} ${l.unit})`,
              amount: l.net,
            })),
          },
        },
      });
      await audit(tx, u, "Confirmar documento revisado", row.id);
      return { id: row.id };
    });
  }
  if (action === "retry") {
    const d = z.object({ documentId: v.id }).parse(input);
    const doc = await db.document.findFirst({
      where: {
        id: d.documentId,
        companyId,
        ...(u.role !== "ADMIN" ? { uploaderId: u.id } : {}),
      },
    });
    if (!doc || !["REVIEW", "FAILED"].includes(doc.status))
      throw new AppError(
        "Solo se puede volver a leer un documento pendiente de revisión o con error.",
        409,
      );
    const updated = await db.document.updateMany({
      where: { id: doc.id, status: doc.status },
      data: {
        status: "QUEUED",
        attempts: 0,
        availableAt: new Date(),
        error: null,
      },
    });
    if (!updated.count)
      throw new AppError(
        "El documento ha cambiado. Actualiza antes de volver a leerlo.",
        409,
      );
    return { id: doc.id };
  }
  if (action === "company") {
    admin(u);
    const d = z.object({ name: v.name, taxId: v.text }).parse(input);
    return serial(async (tx) => {
      const row = await tx.company.update({
        where: { id: companyId },
        data: d,
      });
      await audit(tx, u, "Actualizar empresa", companyId);
      return row;
    });
  }
  if (action === "overhead") {
    admin(u);
    const d = z
      .object({
        description: v.name,
        amount: v.money,
        tax: v.money.default("0"),
        date: v.date,
      })
      .parse(input);
    return serial(async (tx) => {
      const row = await tx.overhead.create({
        data: { ...d, companyId, date: new Date(d.date) },
      });
      await audit(tx, u, "Registrar gasto general", row.id);
      return row;
    });
  }
  throw new AppError("Acción desconocida.", 404);
}
