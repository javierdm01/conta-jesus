import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { admin, AppError, type Actor } from "./access";
import * as v from "./validation";
import { dec, sum } from "./money";
import { quantityForUnit } from "./inventory-math";
const serial = <T>(f: (tx: Prisma.TransactionClient) => Promise<T>) =>
  db.$transaction(f, { isolationLevel: "Serializable", timeout: 20000 });
export async function purchaseOrderOperation(
  u: Actor,
  action: string,
  input: unknown,
) {
  admin(u);
  if (action === "order-create") {
    const d = z
      .object({
        supplierId: v.id,
        number: v.name,
        date: v.date,
        expectedAt: v.date.optional(),
        notes: v.text,
        requestKey: v.requestKey,
        lines: z
          .array(
            z.object({
              description: v.name,
              reference: v.text,
              quantity: v.quantity,
              unit: z.enum(["ud", "m", "rollo", "pack", "kg", "l", "h"]),
              price: v.price.nullable().optional(),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(input);
    for (const line of d.lines) {
      try {
        quantityForUnit(line.quantity, line.unit);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
    }
    if (d.expectedAt && d.expectedAt < d.date)
      throw new AppError(
        "La entrega prevista no puede ser anterior al pedido.",
      );
    return serial(async (tx) => {
      if (
        !(await tx.supplier.findFirst({
          where: { id: d.supplierId, companyId: u.companyId },
        }))
      )
        throw new AppError("Proveedor no disponible.", 404);
      const order = await tx.purchaseOrder.create({
        data: {
          companyId: u.companyId,
          supplierId: d.supplierId,
          number: d.number.toUpperCase(),
          date: new Date(d.date),
          expectedAt: d.expectedAt ? new Date(d.expectedAt) : null,
          notes: d.notes,
          requestKey: d.requestKey,
          lines: { create: d.lines },
        },
      });
      await tx.audit.create({
        data: {
          companyId: u.companyId,
          userId: u.id,
          action: "Crear pedido de compra",
          entityId: order.id,
        },
      });
      return { id: order.id };
    });
  }
  if (action === "order-close") {
    const d = z
      .object({ orderId: v.id, reason: z.string().trim().min(5).max(2000) })
      .parse(input);
    return serial(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id: d.orderId, companyId: u.companyId, status: "OPEN" },
        include: {
          lines: { include: { receipts: { select: { quantity: true } } } },
        },
      });
      if (!order) throw new AppError("Pedido cerrado o no disponible.", 409);
      let pending = false;
      for (const line of order.lines) {
        const rest = dec(line.quantity.toString())
          .minus(line.cancelled.toString())
          .minus(sum(line.receipts.map((r) => r.quantity.toString())));
        if (rest.gt(0)) {
          pending = true;
          await tx.purchaseOrderLine.update({
            where: { id: line.id },
            data: {
              cancelled: dec(line.cancelled.toString()).plus(rest).toString(),
            },
          });
        }
      }
      if (!pending)
        throw new AppError("El pedido ya se ha recibido completo.", 409);
      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: "CLOSED",
          notes: [order.notes, `Cierre: ${d.reason}`]
            .filter(Boolean)
            .join("\n"),
        },
      });
      await tx.audit.create({
        data: {
          companyId: u.companyId,
          userId: u.id,
          action: `Cancelar pendiente de pedido · ${d.reason}`,
          entityId: order.id,
        },
      });
      return { id: order.id };
    });
  }
  throw new AppError("Operación de pedido no disponible.", 404);
}
export async function purchaseOrderState(u: Actor) {
  admin(u);
  const orders = await db.purchaseOrder.findMany({
    where: { companyId: u.companyId },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          receipts: {
            select: {
              quantity: true,
              lot: { select: { code: true } },
              document: { select: { id: true, number: true, date: true } },
            },
          },
        },
      },
    },
  });
  return {
    orders: orders.map((o) => {
      const lines = o.lines.map((l) => {
        const received = sum(l.receipts.map((r) => r.quantity.toString()));
        return {
          id: l.id,
          description: l.description,
          reference: l.reference,
          unit: l.unit,
          quantity: l.quantity.toString(),
          price: l.price?.toString() ?? null,
          cancelled: l.cancelled.toString(),
          received: received.toString(),
          pending: dec(l.quantity.toString())
            .minus(l.cancelled.toString())
            .minus(received)
            .toString(),
          receipts: l.receipts.map((r) => ({
            quantity: r.quantity.toString(),
            code: r.lot?.code ?? null,
            document: r.document,
          })),
        };
      });
      return {
        id: o.id,
        number: o.number,
        date: o.date,
        expectedAt: o.expectedAt,
        notes: o.notes,
        supplier: o.supplier,
        status:
          o.status === "CLOSED"
            ? "CLOSED"
            : lines.every((l) => dec(l.pending).eq(0))
              ? "RECEIVED"
              : lines.some((l) => dec(l.received).gt(0))
                ? "PARTIAL"
                : "OPEN",
        lines,
      };
    }),
  };
}
type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export type PurchaseOrderData = Serialized<
  Awaited<ReturnType<typeof purchaseOrderState>>
>;
