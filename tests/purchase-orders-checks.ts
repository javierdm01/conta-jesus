import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
type Context = {
  a: APIRequestContext;
  t: APIRequestContext;
  supplierId: string;
  document: (kind: string, label: string) => Promise<{ id: string }>;
};
export async function checkPurchaseOrders({
  a,
  t,
  supplierId,
  document,
}: Context) {
  const suffix = randomUUID().slice(0, 8);
  async function post(action: string, data: object) {
    const r = await a.post(`/api/operations/${action}`, {
      data: { requestKey: randomUUID(), ...data },
    });
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  }
  async function state(id: string) {
    const r = await a.get("/api/purchase-orders");
    assert.equal(r.status(), 200);
    return (await r.json()).orders.find((o: { id: string }) => o.id === id);
  }
  const payload = {
    supplierId,
    number: `PC-PRUEBA-${suffix}`,
    date: "2026-10-19",
    lines: [
      {
        description: "Material pedido · PRUEBA",
        reference: "PED-20",
        quantity: "20",
        unit: "ud",
        price: "3",
      },
    ],
  };
  assert.equal((await t.get("/api/purchase-orders")).status(), 403);
  assert.equal(
    (
      await t.post("/api/operations/order-create", {
        data: { ...payload, requestKey: randomUUID() },
      })
    ).status(),
    403,
  );
  const before = (await (await a.get("/api/inventory")).json()).lots.length;
  const order = await post("order-create", payload);
  let o = await state(order.id);
  const lineId = o.lines[0].id;
  assert.equal(
    (await (await a.get("/api/inventory")).json()).lots.length,
    before,
  );
  assert.equal(o.lines[0].pending, "20");
  const receipt = (id: string, q: string, ref = "PED-20") => ({
    documentId: id,
    supplierId,
    number: `AL-PED-${id}`,
    date: "2026-10-19",
    net: null,
    tax: null,
    reviewed: true,
    lines: [
      {
        description: "Material pedido · PRUEBA",
        reference: ref,
        quantity: q,
        unit: "ud",
        price: null,
        orderLineId: lineId,
      },
    ],
  });
  const first = await document("DELIVERY", "PEDIDO-8");
  const wrong = await a.post("/api/operations/stock-confirm", {
    data: receipt(first.id, "8", "OTRA-REF"),
  });
  assert.equal(wrong.status(), 400);
  await post("stock-confirm", receipt(first.id, "8"));
  o = await state(order.id);
  assert.equal(o.status, "PARTIAL");
  assert.equal(o.lines[0].received, "8");
  assert.equal(o.lines[0].pending, "12");
  const second = await document("DELIVERY", "PEDIDO-12-A"),
    third = await document("DELIVERY", "PEDIDO-12-B");
  const competing = await Promise.all(
    [second, third].map((d) =>
      a.post("/api/operations/stock-confirm", { data: receipt(d.id, "12") }),
    ),
  );
  assert.deepEqual(competing.map((r) => r.status()).sort(), [200, 409]);
  o = await state(order.id);
  assert.equal(o.status, "RECEIVED");
  assert.equal(o.lines[0].pending, "0");
  assert.equal(o.lines[0].received, "20");
  const cancelOrder = await post("order-create", {
    ...payload,
    number: `PC-CANCEL-${suffix}`,
  });
  await post("order-close", {
    orderId: cancelOrder.id,
    reason: "Pedido cancelado por cambio de trabajo",
  });
  const closed = await state(cancelOrder.id);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.lines[0].cancelled, "20");
  assert.equal(closed.lines[0].pending, "0");
  const loser = [second, third][competing.findIndex((r) => r.status() === 409)];
  const closedReceipt = receipt(loser.id, "1");
  closedReceipt.lines[0].orderLineId = closed.lines[0].id;
  assert.equal(
    (
      await a.post("/api/operations/stock-confirm", { data: closedReceipt })
    ).status(),
    409,
  );
  assert.equal((await t.get("/api/system")).status(), 403);
  const health = await a.get("/api/system");
  assert.equal(health.status(), 200);
  const h = await health.json();
  assert.equal(h.database, true);
  assert.ok(h.ocr.lastSeen);
  assert.equal(h.ocr.recent, true);
  console.log(
    "OK pedidos: entrega 8 de 20, dos recepciones concurrentes de 12, cierre de pendiente, referencias, permisos y estado OCR",
  );
}
