import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, type StockLot } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { admin, accessibleJob, AppError, type Actor } from "./access";
import * as v from "./validation";
import { dec, sum, cents, lineNet, documentLineNet } from "./money";
import { allocateDocumentValue } from "./document-values";
import { portion, quantityForUnit, stockGroupKey } from "./inventory-math";
import { productFamily } from "./ocr";
import { recommendedPrice } from "./product-search";

type Tx = Prisma.TransactionClient;
function allocate(values: string[], target: string) {
  try {
    return allocateDocumentValue(values, target);
  } catch (e) {
    throw new AppError((e as Error).message);
  }
}
const serial = <T>(f: (tx: Tx) => Promise<T>) =>
  db.$transaction(f, { isolationLevel: "Serializable", timeout: 20000 });
const audit = (tx: Tx, u: Actor, action: string, id: string) =>
  tx.audit.create({
    data: { companyId: u.companyId, userId: u.id, action, entityId: id },
  });
const unit = z.enum(["ud", "m", "rollo", "pack", "kg", "l", "h"]);
const stockLine = z.object({
  description: v.name,
  reference: v.text,
  unit,
  quantity: v.documentQuantity,
  financial: z.boolean().default(false),
  price: v.price.nullable().optional(),
  discount: v.percent.default("0"),
  brand: v.text,
  model: v.text,
  location: v.text,
  jobId: v.id.optional(),
  lotId: v.id.optional(),
  orderLineId: v.id.optional(),
});

// Reparto exacto de céntimos: el último consumo agota también el valor restante.
// Si llega la factura después del consumo, se valoran los movimientos existentes sin repetir entradas.
async function valueLot(tx: Tx, lot: StockLot) {
  if (lot.totalValue === null) return;
  const movements = await tx.stockMovement.findMany({
    where: { lotId: lot.id },
    include: { cost: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  let available = dec(lot.received.toString()),
    value = dec(lot.totalValue.toString());
  const valued = new Map<
    string,
    {
      quantity: string;
      amount: string;
      returned: ReturnType<typeof dec>;
      returnedAmount: ReturnType<typeof dec>;
    }
  >();
  for (const m of movements) {
    if (m.kind === "RECEIVE" || m.kind === "RESERVE" || m.kind === "RELEASE")
      continue;
    let amount: string;
    if (m.kind === "RETURN" || m.kind === "COUNT_IN") {
      const source = valued.get(m.sourceId ?? "");
      if (!source)
        throw new AppError(
          "No se encuentra el movimiento original que se está revirtiendo.",
        );
      amount = portion(
        dec(source.amount).minus(source.returnedAmount),
        m.quantity.toString(),
        dec(source.quantity).minus(source.returned),
        source.amount,
        source.quantity,
      );
      source.returned = source.returned.plus(m.quantity.toString());
      source.returnedAmount = source.returnedAmount.plus(amount);
      available = available.plus(m.quantity.toString());
      value = value.plus(amount);
    } else {
      amount = portion(
        value,
        m.quantity.toString(),
        available,
        lot.totalValue.toString(),
        lot.received.toString(),
      );
      available = available.minus(m.quantity.toString());
      value = value.minus(amount);
      valued.set(m.id, {
        quantity: m.quantity.toString(),
        amount,
        returned: dec(0),
        returnedAmount: dec(0),
      });
    }
    if (m.amount === null || !dec(m.amount.toString()).eq(amount))
      await tx.stockMovement.update({ where: { id: m.id }, data: { amount } });
    if ((m.kind === "USE" || m.kind === "RETURN") && m.jobId) {
      const signed =
        m.kind === "RETURN" ? cents(dec(amount).negated()) : amount;
      const data = {
        companyId: lot.companyId,
        jobId: m.jobId,
        type: "Materiales",
        description: `${m.kind === "RETURN" ? "Devolución" : "Consumo"} · ${lot.description} (${m.quantity} ${lot.unit}) · ${lot.code}`,
        amount: signed,
        date: m.createdAt,
        documentId: lot.invoiceDocumentId ?? lot.documentId,
        stockMovementId: m.id,
      };
      if (!m.cost) await tx.cost.create({ data });
      else if (
        !dec(m.cost.amount.toString()).eq(signed) ||
        m.cost.documentId !== data.documentId
      )
        await tx.cost.update({ where: { id: m.cost.id }, data });
    }
  }
  if (!available.eq(lot.onHand.toString()))
    throw new AppError(
      "Las existencias no coinciden con el historial. No se ha guardado el movimiento.",
      409,
    );
  await tx.stockLot.update({
    where: { id: lot.id },
    data: { remainingValue: cents(value) },
  });
}

export async function inventoryOperation(
  u: Actor,
  action: string,
  input: unknown,
) {
  if (action === "stock-confirm") {
    admin(u);
    const d = z
      .object({
        documentId: v.id,
        supplierId: v.id,
        number: v.name,
        date: v.date,
        net: v.money.nullable().optional(),
        tax: v.money.nullable().optional(),
        valuationPending: z.boolean().default(false),
        lines: z.array(stockLine).min(1).max(500),
        reviewed: z.literal(true),
      })
      .parse(input);
    for (const l of d.lines) {
      try {
        if (!l.financial) quantityForUnit(l.quantity, l.unit);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      if (l.jobId) await accessibleJob(u, l.jobId);
    }
    const priced = !d.valuationPending && d.lines.every((l) => l.price != null);
    if (!d.valuationPending && d.lines.some((l) => l.price != null) && !priced)
      throw new AppError(
        "Valora todas las líneas o deja todos los precios pendientes.",
      );
    if (
      priced &&
      (d.net == null ||
        !sum(
          d.lines.map((l) => documentLineNet(l.quantity, l.price!, l.discount)),
        ).eq(d.net))
    )
      throw new AppError("La suma de líneas debe coincidir con la base neta.");
    if (!priced && (d.net != null || d.tax != null))
      throw new AppError(
        "Para una base conocida debes completar los precios. Si el albarán no lleva precios, deja la valoración pendiente.",
      );
    const grouped = new Map<string, typeof d.lines>();
    for (const l of d.lines.filter((l) => !l.financial)) {
      const key = stockGroupKey(l);
      grouped.set(key, [...(grouped.get(key) ?? []), l]);
    }
    if (!grouped.size)
      throw new AppError(
        "Incluye al menos un artículo físico para recibir en almacén.",
      );
    const groupValues = priced
      ? allocate(
          [...grouped.values()].map((group) =>
            cents(
              sum(group.map((l) => lineNet(l.quantity, l.price!, l.discount))),
            ),
          ),
          d.net!,
        )
      : [];
    return serial(async (tx) => {
      const doc = await tx.document.findFirst({
        where: {
          id: d.documentId,
          companyId: u.companyId,
          kind: { in: ["DELIVERY", "PURCHASE"] },
          status: { in: ["REVIEW", "FAILED"] },
        },
      });
      if (!doc)
        throw new AppError("Documento ya confirmado o no disponible.", 409);
      const supplier = await tx.supplier.findFirst({
        where: { id: d.supplierId, companyId: u.companyId },
      });
      if (!supplier) throw new AppError("Proveedor no disponible.", 404);
      const orderIds = [
        ...new Set(
          d.lines
            .filter((l) => !l.financial)
            .map((l) => l.orderLineId)
            .filter((id): id is string => !!id),
        ),
      ];
      for (const orderLineId of orderIds) {
        const ordered = await tx.purchaseOrderLine.findFirst({
          where: {
            id: orderLineId,
            order: {
              companyId: u.companyId,
              supplierId: d.supplierId,
              status: "OPEN",
            },
          },
          include: { receipts: { select: { quantity: true } } },
        });
        if (!ordered)
          throw new AppError(
            "La línea de pedido no pertenece al proveedor o está cerrada.",
            409,
          );
        const receivedLines = d.lines.filter(
          (l) => l.orderLineId === orderLineId,
        );
        if (
          receivedLines.some(
            (l) =>
              l.unit !== ordered.unit ||
              (ordered.reference &&
                l.reference.trim().toUpperCase() !==
                  ordered.reference.trim().toUpperCase()),
          )
        )
          throw new AppError(
            "Comprueba la referencia y la unidad de la línea de pedido seleccionada.",
          );
        const remaining = dec(ordered.quantity.toString())
          .minus(ordered.cancelled.toString())
          .minus(sum(ordered.receipts.map((r) => r.quantity.toString())));
        if (sum(receivedLines.map((l) => l.quantity)).gt(remaining))
          throw new AppError(
            `La recepción supera lo pendiente de ${ordered.description}: ${remaining} ${ordered.unit}.`,
            409,
          );
      }
      if (doc.kind === "PURCHASE" && !priced)
        throw new AppError(
          "Una factura de compra necesita sus precios; el albarán puede quedar pendiente de valoración.",
        );
      const lots = [];
      await tx.document.update({
        where: { id: doc.id },
        data: {
          supplierId: d.supplierId,
          number: d.number.trim().toUpperCase(),
          date: new Date(d.date),
          net: d.net ?? null,
          tax: d.tax ?? null,
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      for (const l of d.lines.filter((l) => l.financial))
        await tx.documentLine.create({
          data: {
            documentId: doc.id,
            description: l.description,
            reference: l.reference,
            unit: l.unit,
            quantity: l.quantity,
            price: l.price ?? null,
            discount: l.discount,
            net:
              priced && l.price != null
                ? documentLineNet(l.quantity, l.price, l.discount)
                : null,
          },
        });
      let groupIndex = 0;
      for (const group of grouped.values()) {
        const first = group[0],
          quantity = sum(group.map((l) => l.quantity)).toString(),
          net = priced ? groupValues[groupIndex++] : null;
        const previous = first.reference
          ? await tx.stockLot.findFirst({
              where: {
                companyId: u.companyId,
                reference: { equals: first.reference, mode: "insensitive" },
                unit: first.unit,
                alias: { not: "" },
                document: { supplierId: d.supplierId },
              },
              orderBy: { createdAt: "desc" },
              select: { alias: true },
            })
          : null;
        const lot = await tx.stockLot.create({
          data: {
            companyId: u.companyId,
            code: `LT-${randomBytes(7).toString("hex").toUpperCase()}`,
            documentId: doc.id,
            description: first.description,
            alias: previous?.alias ?? "",
            reference: first.reference,
            unit: first.unit,
            received: quantity,
            onHand: quantity,
            totalValue: net,
            remainingValue: net,
            brand: first.brand,
            model: first.model,
            location: first.location,
            family: productFamily(first.description),
          },
        });
        await tx.documentLine.createMany({
          data: group.map((l) => ({
            documentId: doc.id,
            jobId: l.jobId,
            lotId: lot.id,
            orderLineId: l.orderLineId,
            reference: l.reference,
            description: l.description,
            unit: l.unit,
            quantity: l.quantity,
            price: l.price ?? null,
            discount: l.discount,
            net:
              priced && l.price != null
                ? lineNet(l.quantity, l.price, l.discount)
                : null,
          })),
        });
        await tx.stockMovement.create({
          data: {
            companyId: u.companyId,
            lotId: lot.id,
            kind: "RECEIVE",
            quantity,
            amount: net,
            userId: u.id,
            requestKey: randomUUID(),
            notes: `Recepción · ${d.number}`,
          },
        });
        const reservations = new Map<string, ReturnType<typeof dec>>();
        for (const l of group) {
          if (l.jobId)
            reservations.set(
              l.jobId,
              (reservations.get(l.jobId) ?? dec(0)).plus(l.quantity),
            );
        }
        for (const [jobId, q] of reservations) {
          await tx.stockReservation.create({
            data: { lotId: lot.id, jobId, quantity: q.toString() },
          });
          await tx.stockMovement.create({
            data: {
              companyId: u.companyId,
              lotId: lot.id,
              jobId,
              kind: "RESERVE",
              quantity: q.toString(),
              userId: u.id,
              requestKey: randomUUID(),
              notes: "Reservado al recibir el albarán",
            },
          });
        }
        lots.push({ id: lot.id, code: lot.code });
      }
      await audit(tx, u, "Confirmar recepción en almacén", doc.id);
      return { id: doc.id, lots };
    });
  }
  if (action === "stock-reconcile") {
    admin(u);
    const d = z
      .object({
        documentId: v.id,
        supersedesId: v.id.optional(),
        receiptIds: z.array(v.id).min(1).max(100).optional(),
        supplierId: v.id,
        number: v.name,
        date: v.date,
        net: v.money,
        tax: v.money,
        reviewed: z.literal(true),
        lines: z
          .array(stockLine.extend({ lotId: v.id.optional(), price: v.price }))
          .min(1)
          .max(500),
      })
      .parse(input);
    const receiptIds = [
      ...new Set(d.receiptIds ?? (d.supersedesId ? [d.supersedesId] : [])),
    ];
    if (
      !receiptIds.length ||
      (d.supersedesId && !receiptIds.includes(d.supersedesId))
    )
      throw new AppError("Selecciona los albaranes que incluye esta factura.");
    for (const l of d.lines.filter((l) => !l.financial)) {
      try {
        quantityForUnit(l.quantity, l.unit);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
    }
    if (
      !sum(
        d.lines.map((l) => documentLineNet(l.quantity, l.price, l.discount)),
      ).eq(d.net)
    )
      throw new AppError("La suma de líneas no coincide con la base.");
    return serial(async (tx) => {
      const doc = await tx.document.findFirst({
        where: {
          id: d.documentId,
          companyId: u.companyId,
          kind: "PURCHASE",
          status: { in: ["REVIEW", "FAILED"] },
        },
      });
      const originals = await tx.document.findMany({
        where: {
          id: { in: receiptIds },
          companyId: u.companyId,
          kind: "DELIVERY",
          status: "CONFIRMED",
          supplierId: d.supplierId,
          replacedBy: null,
        },
        include: { stockLots: true },
      });
      if (
        !doc ||
        originals.length !== receiptIds.length ||
        originals.some(
          (r) =>
            !r.stockLots.length || r.stockLots.some((l) => l.invoiceDocumentId),
        )
      )
        throw new AppError(
          "Selecciona albaranes de almacén del mismo proveedor pendientes de facturar.",
          409,
        );
      const lots = originals.flatMap((r) => r.stockLots);
      if (
        d.lines.some(
          (l) => !l.financial && !lots.some((lot) => lot.id === l.lotId),
        )
      )
        throw new AppError(
          "Hay líneas que no corresponden a los albaranes seleccionados.",
        );
      for (const lot of lots) {
        const lines = d.lines.filter((l) => !l.financial && l.lotId === lot.id);
        if (
          !sum(lines.map((l) => l.quantity)).eq(lot.received.toString()) ||
          lines.some((l) => l.unit !== lot.unit)
        )
          throw new AppError(
            `Revisa ${lot.description}: la factura debe cubrir ${lot.received} ${lot.unit} del albarán completo.`,
          );
      }
      await tx.document.update({
        where: { id: doc.id },
        data: {
          supplierId: d.supplierId,
          number: d.number.trim().toUpperCase(),
          date: new Date(d.date),
          net: d.net,
          tax: d.tax,
          supersedesId: originals.length === 1 ? originals[0].id : null,
          status: "CONFIRMED",
          confirmedAt: new Date(),
          lines: {
            create: d.lines.map((l) => ({
              lotId: l.financial ? undefined : l.lotId,
              description: l.description,
              reference: l.reference,
              unit: l.unit,
              quantity: l.quantity,
              price: l.price,
              discount: l.discount,
              net: documentLineNet(l.quantity, l.price, l.discount),
            })),
          },
        },
      });
      const values = allocate(
        lots.map((lot) =>
          cents(
            sum(
              d.lines
                .filter((l) => !l.financial && l.lotId === lot.id)
                .map((l) => lineNet(l.quantity, l.price, l.discount)),
            ),
          ),
        ),
        d.net,
      );
      for (const [index, lot] of lots.entries()) {
        const value = values[index];
        const updated = await tx.stockLot.update({
          where: { id: lot.id },
          data: { totalValue: cents(value), invoiceDocumentId: doc.id },
        });
        await valueLot(tx, updated);
      }
      await audit(
        tx,
        u,
        "Valorar albarán con factura sin duplicar existencias",
        doc.id,
      );
      return { id: doc.id };
    });
  }
  if (action === "stock-move") {
    const d = z
      .object({
        lotId: v.id,
        kind: z.enum([
          "USE",
          "RETURN",
          "RESERVE",
          "RELEASE",
          "SUPPLIER_RETURN",
        ]),
        quantity: v.quantity,
        jobId: v.id.optional(),
        sourceId: v.id.optional(),
        notes: v.text,
        requestKey: v.requestKey,
      })
      .parse(input);
    if (["USE", "RESERVE", "RELEASE"].includes(d.kind)) {
      if (!d.jobId) throw new AppError("Selecciona el trabajo.");
      await accessibleJob(u, d.jobId);
    }
    if (d.kind === "SUPPLIER_RETURN") admin(u);
    return serial(async (tx) => {
      const lot = await tx.stockLot.findFirst({
        where: { id: d.lotId, companyId: u.companyId },
        include: { reservations: true },
      });
      if (!lot) throw new AppError("Artículo no disponible.", 404);
      try {
        quantityForUnit(d.quantity, lot.unit);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      let jobId = d.jobId;
      const q = dec(d.quantity),
        reserved = sum(lot.reservations.map((r) => r.quantity.toString())),
        own = lot.reservations.find((r) => r.jobId === jobId),
        ownQ = dec(own?.quantity.toString() ?? 0),
        free = dec(lot.onHand.toString()).minus(reserved);
      if (d.kind === "RETURN") {
        const source = await tx.stockMovement.findFirst({
          where: { id: d.sourceId ?? "none", lotId: lot.id, kind: "USE" },
          include: { returns: true, job: true },
        });
        if (!source?.jobId)
          throw new AppError("Selecciona el consumo original.");
        if (u.role !== "ADMIN" && source.job?.workerId !== u.worker?.id)
          throw new AppError(
            "No puedes devolver material de un trabajo ajeno.",
            403,
          );
        if (
          q.gt(
            dec(source.quantity.toString()).minus(
              sum(source.returns.map((r) => r.quantity.toString())),
            ),
          )
        )
          throw new AppError(
            "La devolución supera la cantidad consumida pendiente de devolver.",
          );
        jobId = source.jobId;
      }
      if (
        (d.kind === "USE" && q.gt(free.plus(ownQ))) ||
        (d.kind === "SUPPLIER_RETURN" && q.gt(free))
      )
        throw new AppError(
          "No hay suficiente material libre. Revisa las reservas de otros trabajos.",
          409,
        );
      if (d.kind === "RESERVE" && q.gt(free))
        throw new AppError("La reserva supera el material disponible.", 409);
      if (d.kind === "RELEASE" && q.gt(ownQ))
        throw new AppError("La cantidad supera la reserva de ese trabajo.");
      if (d.kind === "RESERVE")
        await tx.stockReservation.upsert({
          where: { lotId_jobId: { lotId: lot.id, jobId: jobId! } },
          create: { lotId: lot.id, jobId: jobId!, quantity: q.toString() },
          update: { quantity: ownQ.plus(q).toString() },
        });
      if (d.kind === "RELEASE" || (d.kind === "USE" && ownQ.gt(0))) {
        const release = d.kind === "RELEASE" ? q : q.lt(ownQ) ? q : ownQ,
          remaining = ownQ.minus(release);
        if (remaining.eq(0))
          await tx.stockReservation.delete({ where: { id: own!.id } });
        else
          await tx.stockReservation.update({
            where: { id: own!.id },
            data: { quantity: remaining.toString() },
          });
      }
      const onHand = dec(lot.onHand.toString()).plus(
        d.kind === "RETURN"
          ? q
          : ["USE", "SUPPLIER_RETURN"].includes(d.kind)
            ? q.negated()
            : 0,
      );
      const move = await tx.stockMovement.create({
        data: {
          companyId: u.companyId,
          lotId: lot.id,
          kind: d.kind,
          quantity: d.quantity,
          jobId: d.kind === "SUPPLIER_RETURN" ? null : jobId,
          sourceId: d.kind === "RETURN" ? d.sourceId : null,
          notes: d.notes,
          userId: u.id,
          requestKey: d.requestKey,
        },
      });
      const updated = await tx.stockLot.update({
        where: { id: lot.id },
        data: { onHand: onHand.toString() },
      });
      await valueLot(tx, updated);
      await audit(
        tx,
        u,
        `Almacén: ${d.kind} · ${d.quantity} ${lot.unit}`,
        lot.id,
      );
      return { id: move.id };
    });
  }
  if (action === "stock-count") {
    admin(u);
    const d = z
      .object({
        lotId: v.id,
        expected: v.stockBalance,
        counted: v.stockBalance,
        lastMovementId: v.id.nullable(),
        reason: z
          .string()
          .trim()
          .min(5, "Explica el motivo del recuento (mínimo 5 caracteres).")
          .max(2000),
        requestKey: v.requestKey,
      })
      .parse(input);
    return serial(async (tx) => {
      const lot = await tx.stockLot.findFirst({
        where: { id: d.lotId, companyId: u.companyId },
        include: {
          reservations: true,
          movements: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            include: { returns: { select: { quantity: true } } },
          },
        },
      });
      if (!lot) throw new AppError("Artículo no disponible.", 404);
      if (
        !dec(lot.onHand.toString()).eq(d.expected) ||
        (lot.movements[0]?.id ?? null) !== d.lastMovementId
      )
        throw new AppError(
          "El material ha cambiado desde que abriste el recuento. Actualiza las existencias y vuelve a contar.",
          409,
        );
      try {
        if (dec(d.counted).gt(0)) quantityForUnit(d.counted, lot.unit);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      const reserved = sum(lot.reservations.map((r) => r.quantity.toString()));
      if (dec(d.counted).lt(reserved))
        throw new AppError(
          "El recuento queda por debajo del material reservado. Revisa y libera las reservas afectadas antes de confirmar.",
          409,
        );
      const delta = dec(d.counted).minus(d.expected);
      const recoverable = lot.movements
        .filter((m) => m.kind === "COUNT_OUT")
        .map((m) => ({
          id: m.id,
          quantity: dec(m.quantity.toString()).minus(
            sum(m.returns.map((r) => r.quantity.toString())),
          ),
        }))
        .filter((m) => m.quantity.gt(0));
      if (delta.gt(sum(recoverable.map((m) => m.quantity))))
        throw new AppError(
          "Solo puedes recuperar faltantes registrados antes en este lote. Si es una compra o material de otro lote, revisa su albarán y su código.",
          409,
        );
      const count = await tx.stockCount.create({
        data: {
          lotId: lot.id,
          expected: d.expected,
          counted: d.counted,
          reason: d.reason,
          userId: u.id,
          userName: u.name,
          requestKey: d.requestKey,
        },
      });
      const movement = async (
        kind: string,
        quantity: string,
        sourceId?: string,
      ) =>
        tx.stockMovement.create({
          data: {
            companyId: u.companyId,
            lotId: lot.id,
            kind,
            quantity,
            sourceId,
            countId: count.id,
            userId: u.id,
            notes: d.reason,
            requestKey: randomUUID(),
          },
        });
      if (delta.lt(0)) await movement("COUNT_OUT", delta.abs().toString());
      let recover = delta;
      for (const source of recoverable) {
        if (!recover.gt(0)) break;
        const q = recover.lt(source.quantity) ? recover : source.quantity;
        await movement("COUNT_IN", q.toString(), source.id);
        recover = recover.minus(q);
      }
      if (!delta.eq(0)) {
        const updated = await tx.stockLot.update({
          where: { id: lot.id },
          data: { onHand: d.counted },
        });
        await valueLot(tx, updated);
      }
      await audit(
        tx,
        u,
        `Recuento: ${d.expected} → ${d.counted} ${lot.unit} · ${d.reason}`,
        lot.id,
      );
      return { id: count.id, difference: delta.toString() };
    });
  }
  if (action === "stock-edit") {
    admin(u);
    const d = z
      .object({
        lotId: v.id,
        alias: z.string().trim().max(200).optional(),
        location: v.text,
        brand: v.text,
        model: v.text,
        notes: v.text,
        minimum: v.quantity.or(z.literal("0")),
      })
      .parse(input);
    return serial(async (tx) => {
      const lot = await tx.stockLot.findFirst({
        where: { id: d.lotId, companyId: u.companyId },
        include: { document: { select: { supplierId: true } } },
      });
      if (!lot) throw new AppError("Artículo no disponible.", 404);
      const { lotId, ...fields } = d;
      await tx.stockLot.update({ where: { id: lotId }, data: fields });
      if (d.alias !== undefined && lot.reference && lot.document?.supplierId) {
        await tx.stockLot.updateMany({
          where: {
            companyId: u.companyId,
            reference: { equals: lot.reference, mode: "insensitive" },
            unit: lot.unit,
            document: { supplierId: lot.document.supplierId },
          },
          data: { alias: d.alias },
        });
      }
      await audit(tx, u, "Editar ficha de material", lot.id);
      return { id: lot.id };
    });
  }
  throw new AppError("Acción de almacén desconocida.", 404);
}

export async function inventoryState(u: Actor) {
  const adminRole = u.role === "ADMIN";
  const lots = await db.stockLot.findMany({
    where: { companyId: u.companyId },
    include: {
      counts: adminRole
        ? { orderBy: [{ createdAt: "desc" }, { id: "desc" }] }
        : false,
      document: {
        select: {
          id: true,
          number: true,
          date: true,
          supplier: { select: { name: true } },
        },
      },
      invoiceDocument: { select: { id: true, number: true } },
      reservations: {
        include: {
          job: {
            select: { id: true, name: true, workerId: true, number: true },
          },
        },
      },
      movements: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          job: {
            select: { id: true, name: true, workerId: true, number: true },
          },
          returns: { select: { quantity: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    lots: lots.map((l) => {
      const canSeeJob = (j: { workerId: string | null } | null) =>
        adminRole || j?.workerId === u.worker?.id;
      return {
        id: l.id,
        code: l.code,
        description: l.description,
        alias: l.alias,
        reference: l.reference,
        brand: l.brand,
        model: l.model,
        family: l.family,
        unit: l.unit,
        received: l.received.toString(),
        onHand: l.onHand.toString(),
        reserved: sum(
          l.reservations.map((r) => r.quantity.toString()),
        ).toString(),
        available: dec(l.onHand.toString())
          .minus(sum(l.reservations.map((r) => r.quantity.toString())))
          .toString(),
        location: l.location,
        notes: l.notes,
        minimum: l.minimum.toString(),
        createdAt: l.createdAt,
        valued: l.totalValue !== null,
        lastMovementId: l.movements[0]?.id ?? null,
        ...(adminRole
          ? {
              totalValue: l.totalValue?.toString() ?? null,
              recommendedPrice: recommendedPrice(
                l.totalValue?.toString(),
                l.received.toString(),
              ),
              remainingValue: l.remainingValue?.toString() ?? null,
              document: l.document,
              invoice: l.invoiceDocument,
              counts: l.counts.map((c) => ({
                id: c.id,
                expected: c.expected.toString(),
                counted: c.counted.toString(),
                reason: c.reason,
                userName: c.userName,
                createdAt: c.createdAt,
              })),
            }
          : {}),
        reservations: l.reservations.map((r) => ({
          id: r.id,
          quantity: r.quantity.toString(),
          job: canSeeJob(r.job)
            ? { id: r.job.id, name: r.job.name, number: r.job.number }
            : null,
        })),
        movements: l.movements.map((m) => ({
          id: m.id,
          kind: m.kind,
          quantity: m.quantity.toString(),
          returnable: dec(m.quantity.toString())
            .minus(sum(m.returns.map((r) => r.quantity.toString())))
            .toString(),
          notes: m.notes,
          createdAt: m.createdAt,
          job:
            canSeeJob(m.job) && m.job
              ? { id: m.job.id, name: m.job.name, number: m.job.number }
              : null,
          ...(adminRole ? { amount: m.amount?.toString() ?? null } : {}),
        })),
      };
    }),
    isAdmin: adminRole,
  };
}
