import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { request, type APIRequestContext } from "@playwright/test";
import { checkPurchaseOrders } from "./purchase-orders-checks";
import { checkMixedPdf } from "./mixed-pdf-checks";
import { checkReceiptInvoices } from "./receipt-invoice-checks";
const db = new PrismaClient(),
  origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  password = randomUUID() + "-Prueba",
  suffix = randomUUID().slice(0, 8);
const contexts: APIRequestContext[] = [],
  files: string[] = [];
let companyId = "",
  completed = false;
const fixturePath = "data/inventory-fixture.json";
async function login(email: string) {
  const c = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  contexts.push(c);
  const r = await c.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  assert.equal(r.status(), 200, await r.text());
  return c;
}
async function post(c: APIRequestContext, action: string, data: object) {
  const r = await c.post(`/api/operations/${action}`, {
    data: { requestKey: randomUUID(), ...data },
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function inventory(c: APIRequestContext) {
  const r = await c.get("/api/inventory");
  assert.equal(r.status(), 200);
  return r.json();
}
async function metrics(c: APIRequestContext, jobId: string) {
  const r = await c.get("/api/state");
  assert.equal(r.status(), 200);
  return (await r.json()).jobs.find((j: { id: string }) => j.id === jobId);
}
async function document(c: APIRequestContext, kind: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1700" height="800"><rect width="1700" height="800" fill="white"/><g font-family="Arial" font-size="42"><text x="65" y="85">ALBARAN NUMERO PRUEBA-${suffix}-${label}</text><text x="65" y="180">Proveedor PRUEBA B12345678</text><text x="65" y="275">Fecha: 18/10/2026</text><text x="65" y="370">Magnetotermico 16 A 20 ud</text><text x="65" y="465">DOCUMENTO DE PRUEBA DE ALMACEN</text></g></svg>`;
  const r = await c.post("/api/documents", {
    multipart: {
      kind,
      file: {
        name: `PRUEBA-${label}.png`,
        mimeType: "image/png",
        buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
      },
    },
  });
  assert.equal(r.status(), 201, await r.text());
  const { id } = await r.json();
  const doc = await db.document.findUniqueOrThrow({ where: { id } });
  files.push(doc.filename);
  for (let i = 0; i < 80; i++) {
    const d = await db.document.findUniqueOrThrow({ where: { id } });
    if (d.status === "FAILED") throw Error(d.error ?? "OCR fallido");
    if (d.status === "REVIEW") {
      assert.match(d.text, /PRUEBA/i);
      return d;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("OCR no completado");
}
async function cleanup(id: string, filenames: string[]) {
  filenames = [
    ...new Set([
      ...filenames,
      ...(
        await db.document.findMany({
          where: { companyId: id },
          select: { filename: true },
        })
      ).map((d) => d.filename),
    ]),
  ];
  await db.$transaction(
    async (tx) => {
      await tx.cost.deleteMany({ where: { companyId: id } });
      await tx.documentLine.deleteMany({
        where: { document: { companyId: id } },
      });
      await tx.purchaseOrderLine.deleteMany({
        where: { order: { companyId: id } },
      });
      await tx.purchaseOrder.deleteMany({ where: { companyId: id } });
      await tx.stockReservation.deleteMany({
        where: { lot: { companyId: id } },
      });
      await tx.stockMovement.updateMany({
        where: { companyId: id },
        data: { sourceId: null },
      });
      await tx.stockMovement.deleteMany({ where: { companyId: id } });
      await tx.stockCount.deleteMany({ where: { lot: { companyId: id } } });
      await tx.stockLot.deleteMany({ where: { companyId: id } });
      await tx.timeEntry.deleteMany({ where: { companyId: id } });
      await tx.sale.deleteMany({ where: { companyId: id } });
      await tx.quote.deleteMany({ where: { companyId: id } });
      await tx.document.updateMany({
        where: { companyId: id },
        data: { supersedesId: null },
      });
      await tx.document.deleteMany({ where: { companyId: id } });
      await tx.job.deleteMany({ where: { companyId: id } });
      await tx.worker.deleteMany({ where: { companyId: id } });
      await tx.user.deleteMany({ where: { companyId: id } });
      await tx.customer.deleteMany({ where: { companyId: id } });
      await tx.supplier.deleteMany({ where: { companyId: id } });
      await tx.audit.deleteMany({ where: { companyId: id } });
      await tx.company.delete({ where: { id } });
    },
    { timeout: 20000 },
  );
  for (const file of filenames)
    await unlink(
      path.join(
        path.resolve(process.env.DOCUMENT_DIR ?? "data/documents"),
        file,
      ),
    ).catch(() => {});
}
async function main() {
  if (process.argv.includes("--cleanup")) {
    const f = JSON.parse(await readFile(fixturePath, "utf8"));
    await cleanup(f.companyId, f.files);
    await unlink(fixturePath);
    console.log("Empresa, documentos y lotes de prueba retirados.");
    return;
  }
  const anonymous = await request.newContext({ baseURL: origin });
  contexts.push(anonymous);
  assert.equal((await anonymous.get("/api/inventory")).status(), 401);
  companyId = (
    await db.company.create({ data: { name: `PRUEBA · Almacén ${suffix}` } })
  ).id;
  const hashed = await hashPassword(password);
  async function user(role: string) {
    const id = randomUUID(),
      email = `${role.toLowerCase()}-stock-${suffix}@prueba.invalid`;
    await db.user.create({
      data: {
        id,
        email,
        name: `${role} PRUEBA`,
        companyId,
        role,
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: hashed,
          },
        },
      },
    });
    return { id, email };
  }
  const owner = await user("ADMIN"),
    tech = await user("TECHNICIAN"),
    a = await login(owner.email),
    t = await login(tech.email);
  const worker = await db.worker.create({
      data: {
        companyId,
        userId: tech.id,
        name: "Técnico de prueba",
        hourlyCost: 30,
      },
    }),
    customer = await post(a, "customer", { name: "Cliente de prueba" }),
    supplier = await post(a, "supplier", {
      name: "Proveedor de prueba",
      taxId: "B12345678",
    });
  const job = await post(a, "job", {
      name: "PRUEBA · Reforma eléctrica",
      customerId: customer.id,
      service: "Instalaciones eléctricas",
      workerId: worker.id,
    }),
    other = await post(a, "job", {
      name: "PRUEBA · Material reservado",
      customerId: customer.id,
      service: "Otros",
    });
  const delivery = await document(a, "DELIVERY", "ALBARAN-20");
  const line = {
    description: "Magnetotérmico 2P 16 A · PRUEBA",
    reference: "MAG-2P16",
    unit: "ud",
    quantity: "10",
    price: "5",
    discount: "0",
    location: "Estantería A · cajón 3",
    brand: "Marca de prueba",
    model: "Modelo de prueba",
  };
  const received = await post(a, "stock-confirm", {
    documentId: delivery.id,
    supplierId: supplier.id,
    number: `ALB-${suffix}`,
    date: "2026-10-18",
    net: "100",
    tax: "21",
    reviewed: true,
    lines: [line, { ...line }],
  });
  assert.equal(received.lots.length, 1);
  const lotId = received.lots[0].id,
    code = received.lots[0].code;
  let lot = (await inventory(a)).lots.find(
    (l: { id: string }) => l.id === lotId,
  );
  assert.equal(lot.received, "20");
  assert.equal(lot.onHand, "20");
  assert.equal((await metrics(a, job.id)).metrics.direct, "0.00");
  console.log(
    "OK albarán con OCR real: 20 unidades iguales, un lote/código y cero coste antes de consumir",
  );
  await post(a, "stock-move", {
    lotId,
    kind: "RESERVE",
    quantity: "5",
    jobId: job.id,
  });
  await post(a, "stock-move", {
    lotId,
    kind: "RESERVE",
    quantity: "4",
    jobId: other.id,
  });
  const first = await post(t, "stock-move", {
    lotId,
    kind: "USE",
    quantity: "3",
    jobId: job.id,
  });
  lot = (await inventory(a)).lots.find((l: { id: string }) => l.id === lotId);
  assert.equal(lot.onHand, "17");
  assert.equal(lot.reserved, "6");
  assert.equal(lot.available, "11");
  assert.equal((await metrics(a, job.id)).metrics.direct, "15.00");
  await post(t, "stock-move", {
    lotId,
    kind: "RETURN",
    quantity: "1",
    sourceId: first.id,
  });
  assert.equal((await metrics(a, job.id)).metrics.direct, "10.00");
  await post(t, "stock-move", {
    lotId,
    kind: "RELEASE",
    quantity: "2",
    jobId: job.id,
  });
  const key = randomUUID();
  await post(t, "stock-move", {
    lotId,
    kind: "USE",
    quantity: "1",
    jobId: job.id,
    requestKey: key,
  });
  const duplicate = await t.post("/api/operations/stock-move", {
    data: { lotId, kind: "USE", quantity: "1", jobId: job.id, requestKey: key },
  });
  assert.equal(duplicate.status(), 409);
  const over = await t.post("/api/operations/stock-move", {
    data: {
      lotId,
      kind: "USE",
      quantity: "17",
      jobId: job.id,
      requestKey: randomUUID(),
    },
  });
  assert.equal(over.status(), 409);
  const foreign = await t.post("/api/operations/stock-move", {
    data: {
      lotId,
      kind: "USE",
      quantity: "1",
      jobId: other.id,
      requestKey: randomUUID(),
    },
  });
  assert.equal(foreign.status(), 404);
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      a.post("/api/operations/stock-move", {
        data: {
          lotId,
          kind: "USE",
          quantity: "10",
          jobId: job.id,
          requestKey: randomUUID(),
        },
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status()).sort(), [200, 409]);
  const winner = await concurrent.find((r) => r.status() === 200)!.json();
  await post(a, "stock-move", {
    lotId,
    kind: "RETURN",
    quantity: "10",
    sourceId: winner.id,
  });
  lot = (await inventory(a)).lots.find((l: { id: string }) => l.id === lotId);
  assert.equal(lot.onHand, "17");
  assert.equal((await metrics(a, job.id)).metrics.direct, "15.00");
  console.log(
    "OK reservas, consumos, devoluciones, idempotencia y dos salidas concurrentes sin sobreventa",
  );
  const countSnapshot = lot;
  const countPayload = (l: typeof lot, counted: string) => ({
    lotId: l.id,
    expected: l.onHand,
    counted,
    lastMovementId: l.lastMovementId,
    reason: "Revisión física de prueba",
    requestKey: randomUUID(),
  });
  const deniedCount = await t.post("/api/operations/stock-count", {
    data: countPayload(lot, "15"),
  });
  assert.equal(deniedCount.status(), 403);
  const fractionCount = await a.post("/api/operations/stock-count", {
    data: countPayload(lot, "16.5"),
  });
  assert.equal(fractionCount.status(), 400);
  const reservedCount = await a.post("/api/operations/stock-count", {
    data: countPayload(lot, "3"),
  });
  assert.equal(reservedCount.status(), 409);
  await post(a, "stock-count", countPayload(lot, "15"));
  lot = (await inventory(a)).lots.find((l: { id: string }) => l.id === lotId);
  assert.equal(lot.onHand, "15");
  assert.equal(lot.remainingValue, "75");
  assert.equal(lot.counts[0].counted, "15");
  assert.equal((await metrics(a, job.id)).metrics.direct, "15.00");
  const staleCount = await a.post("/api/operations/stock-count", {
    data: countPayload(countSnapshot, "16"),
  });
  assert.equal(staleCount.status(), 409);
  const excessCount = await a.post("/api/operations/stock-count", {
    data: countPayload(lot, "18"),
  });
  assert.equal(excessCount.status(), 409);
  const checked = countPayload(lot, "15");
  await post(a, "stock-count", checked);
  assert.equal(
    (await a.post("/api/operations/stock-count", { data: checked })).status(),
    409,
  );
  console.log(
    "OK recuento: faltante sin coste de obra, comprobación sin diferencia, repetición, permisos, reservas y conflicto obsoleto",
  );
  const invoice = await document(a, "PURCHASE", "FACTURA-20");
  const linked = {
    documentId: invoice.id,
    supersedesId: delivery.id,
    supplierId: supplier.id,
    number: `F-${suffix}`,
    date: "2026-10-18",
    net: "120",
    tax: "25.20",
    reviewed: true,
    lines: [{ ...line, quantity: "20", price: "6", lotId }],
  };
  const legacy = await a.post("/api/operations/review", {
    data: {
      ...linked,
      lines: linked.lines.map((l) => ({ ...l, jobId: job.id })),
    },
  });
  assert.equal(legacy.status(), 400);
  await post(a, "stock-reconcile", linked);
  lot = (await inventory(a)).lots.find((l: { id: string }) => l.id === lotId);
  assert.equal(lot.onHand, "15");
  assert.equal(lot.received, "20");
  assert.equal(lot.totalValue, "120");
  assert.equal(lot.remainingValue, "90");
  await post(a, "stock-count", countPayload(lot, "17"));
  lot = (await inventory(a)).lots.find((l: { id: string }) => l.id === lotId);
  assert.equal(lot.onHand, "17");
  assert.equal(lot.remainingValue, "102");
  assert.equal(
    lot.movements.find((m: { kind: string }) => m.kind === "COUNT_IN").amount,
    "12",
  );
  assert.equal((await metrics(a, job.id)).metrics.direct, "18.00");
  assert.equal(
    (await inventory(a)).lots.filter((l: { id: string }) => l.id === lotId)
      .length,
    1,
  );
  const repeated = await a.post("/api/operations/stock-reconcile", {
    data: linked,
  });
  assert.equal(repeated.status(), 409);
  console.log(
    "OK factura del albarán: mismos códigos/stock, coste de 3 unidades actualizado de 15 a 18 €",
  );
  const unknown = await document(a, "DELIVERY", "SIN-PRECIO");
  const pending = await post(a, "stock-confirm", {
    documentId: unknown.id,
    supplierId: supplier.id,
    number: `SIN-P-${suffix}`,
    date: "2026-10-18",
    net: null,
    tax: null,
    reviewed: true,
    lines: [
      {
        description: "Conectores · PRUEBA",
        reference: "CON-5",
        unit: "ud",
        quantity: "5",
        price: null,
        discount: "0",
        location: "Cajón 4",
      },
    ],
  });
  const pendingId = pending.lots[0].id,
    pendingUse = await post(t, "stock-move", {
      lotId: pendingId,
      kind: "USE",
      quantity: "2",
      jobId: job.id,
    });
  assert.equal((await metrics(a, job.id)).pendingStockCosts, 1);
  const unpricedBeforeInvoice = (await inventory(a)).lots.find(
    (l: { id: string }) => l.id === pendingId,
  );
  await post(a, "stock-count", countPayload(unpricedBeforeInvoice, "2"));
  const valued = await document(a, "PURCHASE", "VALORA-PENDIENTE");
  await post(a, "stock-reconcile", {
    documentId: valued.id,
    supersedesId: unknown.id,
    supplierId: supplier.id,
    number: `VAL-${suffix}`,
    date: "2026-10-18",
    net: "10",
    tax: "2.10",
    reviewed: true,
    lines: [
      {
        description: "Conectores · PRUEBA",
        reference: "CON-5",
        unit: "ud",
        quantity: "5",
        price: "2",
        discount: "0",
        lotId: pendingId,
      },
    ],
  });
  assert.equal((await metrics(a, job.id)).pendingStockCosts, 0);
  assert.equal((await metrics(a, job.id)).metrics.direct, "22.00");
  const countedAfterInvoice = (await inventory(a)).lots.find(
    (l: { id: string }) => l.id === pendingId,
  );
  assert.equal(countedAfterInvoice.remainingValue, "4");
  assert.equal(
    countedAfterInvoice.movements.find(
      (m: { kind: string }) => m.kind === "COUNT_OUT",
    ).amount,
    "2",
  );
  await post(a, "stock-count", countPayload(countedAfterInvoice, "3"));
  await post(t, "stock-move", {
    lotId: pendingId,
    kind: "RETURN",
    quantity: "2",
    sourceId: pendingUse.id,
  });
  assert.equal((await metrics(a, job.id)).metrics.direct, "18.00");
  console.log(
    "OK albarán sin precio: salida física, aviso provisional, valoración posterior y devolución con coste exacto",
  );
  let pendingLot = (await inventory(a)).lots.find(
    (l: { id: string }) => l.id === pendingId,
  );
  await post(a, "stock-count", countPayload(pendingLot, "0"));
  pendingLot = (await inventory(a)).lots.find(
    (l: { id: string }) => l.id === pendingId,
  );
  assert.equal(pendingLot.remainingValue, "0");
  const competingCounts = await Promise.all(
    ["4", "5"].map((counted) =>
      a.post("/api/operations/stock-count", {
        data: countPayload(pendingLot, counted),
      }),
    ),
  );
  assert.deepEqual(competingCounts.map((r) => r.status()).sort(), [200, 409]);
  pendingLot = (await inventory(a)).lots.find(
    (l: { id: string }) => l.id === pendingId,
  );
  if (pendingLot.onHand !== "5")
    await post(a, "stock-count", countPayload(pendingLot, "5"));
  assert.equal((await metrics(a, job.id)).metrics.direct, "18.00");
  console.log(
    "OK recuento a cero, recuperación y dos recuentos concurrentes; factura revalora faltantes y recuperaciones sin afectar obras",
  );
  const centsDoc = await document(a, "DELIVERY", "CENTIMOS");
  const tiny = await post(a, "stock-confirm", {
    documentId: centsDoc.id,
    supplierId: supplier.id,
    number: `CENT-${suffix}`,
    date: "2026-10-18",
    net: "0.04",
    tax: "0",
    reviewed: true,
    lines: [
      {
        description: "Terminales · PRUEBA céntimos",
        reference: "CENT-6",
        unit: "ud",
        quantity: "6",
        price: "0.0067",
        discount: "0",
      },
    ],
  });
  const tinyId = tiny.lots[0].id;
  const tinyUse = await post(a, "stock-move", {
    lotId: tinyId,
    kind: "USE",
    quantity: "6",
    jobId: job.id,
  });
  for (let i = 0; i < 6; i++) {
    await post(a, "stock-move", {
      lotId: tinyId,
      kind: "RETURN",
      quantity: "1",
      sourceId: tinyUse.id,
    });
    const tinyState = (await inventory(a)).lots.find(
      (l: { id: string }) => l.id === tinyId,
    );
    assert.ok(
      tinyState.movements
        .filter((m: { kind: string }) => m.kind === "RETURN")
        .every((m: { amount: string }) => Number(m.amount) >= 0),
    );
    assert.ok(Number(tinyState.remainingValue) <= 0.04);
  }
  assert.equal((await metrics(a, job.id)).metrics.direct, "18.00");
  console.log(
    "OK seis devoluciones parciales de un consumo de cuatro céntimos: ningún importe negativo ni reversión excesiva",
  );
  const techStock = await inventory(t),
    techLot = techStock.lots.find((l: { id: string }) => l.id === lotId);
  assert.equal(techLot.totalValue, undefined);
  assert.equal(techLot.remainingValue, undefined);
  assert.equal(techLot.document, undefined);
  assert.equal(techLot.counts, undefined);
  assert.equal(techLot.movements[0].amount, undefined);
  const denied = await t.post("/api/operations/stock-edit", {
    data: { lotId, location: "Ataque", minimum: "0" },
  });
  assert.equal(denied.status(), 403);
  const print = await a.get(`/etiquetas?items=${code}:3`);
  assert.equal(print.status(), 200);
  assert.match(await print.text(), /data-testid="printed-label"/);
  const invalid = await a.get(`/etiquetas?items=${code}:501`);
  assert.match(await invalid.text(), /500/);
  console.log(
    "OK permisos, datos financieros ocultos al técnico y preparación de tres etiquetas del mismo identificador",
  );
  await checkPurchaseOrders({
    a,
    t,
    supplierId: supplier.id,
    document: (kind, label) => document(a, kind, label),
  });
  await checkMixedPdf(a, db);
  const multiReceipt=await checkReceiptInvoices(a,db,companyId,owner.id,supplier.id,job.id);
  if (process.env.KEEP_FIXTURE === "1") {
    await mkdir("data", { recursive: true });
    await writeFile(
      fixturePath,
      JSON.stringify(
        {
          companyId,
          email: owner.email,
          password,
          code,
          lotId,
          jobId: job.id,
          supplierId: supplier.id,
          files,
          origin,
          multiReceipt,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Fixture de navegador preparado en data/inventory-fixture.json.",
    );
  }
  completed = true;
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const c of contexts) await c.dispose();
    if (companyId && (!completed || process.env.KEEP_FIXTURE !== "1"))
      await cleanup(companyId, files);
    await db.$disconnect();
  });
