import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { APIRequestContext } from "@playwright/test";

export async function checkReceiptInvoices(
  api: APIRequestContext,
  db: PrismaClient,
  companyId: string,
  uploaderId: string,
  supplierId: string,
  jobId: string,
) {
  const suffix = randomUUID().slice(0, 8);
  const doc = async (kind: string, label: string) =>
    db.document.create({
      data: {
        companyId,
        uploaderId,
        kind,
        originalName: `PRUEBA-${label}.png`,
        filename: `prueba-${randomUUID()}.png`,
        mime: "image/png",
        hash: randomUUID(),
        status: "REVIEW",
      },
    });
  const post = async (action: string, data: object, status = 200) => {
    const r = await api.post(`/api/operations/${action}`, {
      data: { requestKey: randomUUID(), ...data },
    });
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };
  const receive = async (
    label: string,
    quantity: string,
    price: string | null,
  ) => {
    const d = await doc("DELIVERY", label),
      number = `ALB-${suffix}-${label}`;
    const r = await post("stock-confirm", {
      documentId: d.id,
      supplierId,
      number,
      date: "2026-10-27",
      net: null,
      tax: null,
      valuationPending: true,
      reviewed: true,
      lines: [
        {
          description: "Material común de dos albaranes",
          reference: "REF-COMUN",
          unit: "ud",
          quantity,
          price,
          discount: "0",
        },
      ],
    });
    return { id: d.id, number, lotId: r.lots[0].id };
  };
  const first = await receive("A", "3", "9.99"),
    second = await receive("B", "2", null);
  const line = await db.documentLine.findFirstOrThrow({
    where: { documentId: first.id },
  });
  assert.equal(line.price?.toString(), "9.99");
  assert.equal(line.net, null);
  const uses: { id: string }[] = [];
  for (const r of [first, second]) {
    assert.equal(
      (await db.stockLot.findUniqueOrThrow({ where: { id: r.lotId } }))
        .totalValue,
      null,
    );
    uses.push(
      await post("stock-move", {
        lotId: r.lotId,
        kind: "USE",
        quantity: "1",
        jobId,
      }),
    );
  }
  const invoice = await doc("PURCHASE", "FACTURA-DOS-ALBARANES");
  const payload = {
    documentId: invoice.id,
    receiptIds: [first.id, second.id],
    supplierId,
    number: `FAC-${suffix}`,
    date: "2026-10-27",
    net: "20",
    tax: "4.20",
    reviewed: true,
    lines: [
      {
        description: "Material común de dos albaranes",
        reference: "REF-COMUN",
        unit: "ud",
        quantity: "3",
        price: "4",
        discount: "0",
        lotId: first.lotId,
      },
      {
        description: "Material común de dos albaranes",
        reference: "REF-COMUN",
        unit: "ud",
        quantity: "2",
        price: "4",
        discount: "0",
        lotId: second.lotId,
      },
    ],
  };
  await post("stock-reconcile", { ...payload, receiptIds: [first.id] }, 400);
  await post(
    "stock-reconcile",
    { ...payload, receiptIds: [first.id, "otro-albaran"] },
    409,
  );
  await post(
    "stock-reconcile",
    {
      ...payload,
      lines: [
        { ...payload.lines[0], quantity: "2" },
        { ...payload.lines[1], quantity: "3" },
      ],
    },
    400,
  );
  assert.equal(
    (await db.document.findUniqueOrThrow({ where: { id: invoice.id } })).status,
    "REVIEW",
  );
  await post("stock-reconcile", payload);
  for (const [i, r] of [first, second].entries()) {
    const lot = await db.stockLot.findUniqueOrThrow({ where: { id: r.lotId } });
    assert.equal(lot.invoiceDocumentId, invoice.id);
    assert.equal(lot.received.toString(), i ? "2" : "3");
    assert.equal(lot.onHand.toString(), i ? "1" : "2");
    assert.equal(lot.totalValue?.toString(), i ? "8" : "12");
    assert.equal(lot.remainingValue?.toString(), i ? "4" : "8");
    const movement = await db.stockMovement.findUniqueOrThrow({
      where: { id: uses[i].id },
      include: { cost: true },
    });
    assert.equal(movement.amount?.toString(), "4");
    assert.equal(movement.cost?.amount.toString(), "4");
  }
  assert.equal(
    await db.stockLot.count({
      where: { documentId: { in: [first.id, second.id] } },
    }),
    2,
  );
  assert.equal(
    (
      await db.documentLine.findFirstOrThrow({
        where: { documentId: first.id },
      })
    ).price?.toString(),
    "9.99",
  );
  const other = await doc("PURCHASE", "OTRA-FACTURA");
  await post(
    "stock-reconcile",
    { ...payload, documentId: other.id, number: `FAC-OTRA-${suffix}` },
    409,
  );
  await post("stock-reconcile", payload, 409);
  const state = await (await api.get("/api/state")).json();
  assert.equal(
    state.documents.find((d: { id: string }) => d.id === invoice.id).valuedLots
      .length,
    2,
  );
  console.log(
    "OK varios albaranes → una factura: tarifa provisional conservada, coste definitivo, consumos actualizados, mismos lotes y bloqueo de doble facturación.",
  );

  // Empresa temporal: caso pendiente para comprobar selección y confirmación en navegador.
  const uiFirst = await receive("UI-A", "3", "7.50"),
    uiSecond = await receive("UI-B", "2", null);
  const uiInvoice = await doc("PURCHASE", "FACTURA-UI-DOS-ALBARANES");
  const invoiceNumber = `FAC-UI-${suffix}`;
  await db.document.update({
    where: { id: uiInvoice.id },
    data: {
      suggestion: {
        supplierId,
        number: invoiceNumber,
        date: "2026-10-27",
        net: "20.00",
        tax: "4.20",
        total: "24.20",
        lines: [
          {
            reference: "REF-COMUN",
            description: "Material común de dos albaranes",
            unit: "ud",
            quantity: "5",
            price: "4",
            discount: "0",
            family: "Sin clasificar",
          },
        ],
        warnings: [],
      },
    },
  });
  return {
    first: uiFirst,
    second: uiSecond,
    invoiceId: uiInvoice.id,
    invoiceNumber,
  };
}
