import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { company, db, origin } from "./docs-harness";

const fixturePath = "data/products-fixture.json";
async function clearCompanies(ids: string[]) {
  for (const id of ids) {
    const co = await db.company.findUnique({ where: { id } });
    if (!co) continue;
    assert.ok(co.name.startsWith("EMPRESA DE PRUEBA PRODUCTOS-"));
    await db.$transaction(async (tx) => {
      await tx.sale.deleteMany({ where: { companyId: id } });
      await tx.documentLine.deleteMany({
        where: { document: { companyId: id } },
      });
      await tx.stockMovement.deleteMany({ where: { companyId: id } });
      await tx.stockLot.deleteMany({ where: { companyId: id } });
      await tx.document.deleteMany({ where: { companyId: id } });
      await tx.supplier.deleteMany({ where: { companyId: id } });
      await tx.audit.deleteMany({ where: { companyId: id } });
      await tx.job.deleteMany({ where: { companyId: id } });
      await tx.worker.deleteMany({ where: { companyId: id } });
      await tx.user.deleteMany({ where: { companyId: id } });
      await tx.customer.deleteMany({ where: { companyId: id } });
      await tx.company.delete({ where: { id } });
    });
  }
}
async function main() {
  if (process.argv.includes("--cleanup")) {
    const f = JSON.parse(await readFile(fixturePath, "utf8"));
    await clearCompanies(f.companies);
    await unlink(fixturePath);
    console.log("Empresas de prueba de artículos eliminadas.");
    return;
  }
  const ids: string[] = [],
    contexts: Awaited<ReturnType<typeof company>>["admin"][] = [];
  let keep = false;
  try {
    const a = await company("PRODUCTOS-A");
    ids.push(a.id);
    contexts.push(a.admin);
    const b = await company("PRODUCTOS-B");
    ids.push(b.id);
    contexts.push(b.admin);
    const tech = await a.technician();
    contexts.push(tech);
    const supplier = await db.supplier.create({
      data: { companyId: a.id, name: "Proveedor PRUEBA ARTÍCULOS" },
    });
    const owner = await db.user.findFirstOrThrow({
      where: { companyId: a.id, role: "ADMIN" },
    });
    const doc = await db.document.create({
      data: {
        companyId: a.id,
        uploaderId: owner.id,
        kind: "DELIVERY",
        originalName: "PRUEBA-ARTICULOS",
        filename: randomUUID() + ".jpg",
        hash: randomUUID(),
        mime: "image/jpeg",
        status: "CONFIRMED",
        supplierId: supplier.id,
        number: "ALB-PRODUCTOS",
      },
    });
    const lot = await db.stockLot.create({
      data: {
        companyId: a.id,
        documentId: doc.id,
        code: `LT-${randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`,
        description: "DOBLE CONMUTADOR NIESSEN",
        reference: "ABC-8122",
        brand: "NIESSEN",
        unit: "ud",
        received: "20",
        onHand: "20",
        totalValue: "200",
        remainingValue: "200",
        location: "Cajón 3",
      },
    });
    const pending = await db.stockLot.create({
      data: {
        companyId: a.id,
        documentId: doc.id,
        code: `LT-${randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`,
        description: "DOBLE CONMUTADOR NIESSEN",
        reference: "abc-8122",
        unit: "ud",
        received: "2",
        onHand: "0",
      },
    });
    const payload = {
      lotId: lot.id,
      alias: "Enchufe salón PRUEBA",
      location: "Cajón 3",
      brand: "NIESSEN",
      model: "8122",
      notes: "",
      minimum: "0",
    };
    assert.equal(
      (
        await tech.post("/api/operations/stock-edit", { data: payload })
      ).status(),
      403,
    );
    assert.equal(
      (
        await b.admin.post("/api/operations/stock-edit", { data: payload })
      ).status(),
      404,
    );
    assert.equal(
      (
        await a.admin.post("/api/operations/stock-edit", { data: payload })
      ).status(),
      200,
    );
    assert.equal(
      (await db.stockLot.findUniqueOrThrow({ where: { id: pending.id } }))
        .alias,
      payload.alias,
    );
    const hits = await (
      await a.admin.get("/api/search/products?q=salon%20niessen")
    ).json();
    assert.equal(hits.total, 2);
    assert.equal(
      hits.items.find((l: { id: string }) => l.id === lot.id).recommendedPrice,
      "13.00",
    );
    assert.equal(
      hits.items.find((l: { id: string }) => l.id === pending.id)
        .recommendedPrice,
      null,
    );
    assert.equal(
      (await (await b.admin.get("/api/search/products?q=salon")).json()).total,
      0,
    );
    const techHits = await (
      await tech.get("/api/search/products?q=salon")
    ).json();
    assert.equal(techHits.total, 2);
    assert.ok(techHits.items.every((x: object) => !("recommendedPrice" in x)));
    const receipt = await db.document.create({
      data: {
        companyId: a.id,
        uploaderId: owner.id,
        kind: "DELIVERY",
        originalName: "PRUEBA-NUEVA-COMPRA",
        filename: randomUUID() + ".jpg",
        hash: randomUUID(),
        mime: "image/jpeg",
        status: "REVIEW",
      },
    });
    const received = await a.admin.post("/api/operations/stock-confirm", {
      data: {
        documentId: receipt.id,
        supplierId: supplier.id,
        number: "ALB-NUEVO-PRODUCTO",
        date: "2026-11-06",
        net: "10",
        tax: "2.10",
        reviewed: true,
        lines: [
          {
            description: lot.description,
            reference: lot.reference,
            unit: "ud",
            quantity: "1",
            price: "10",
            discount: "0",
          },
        ],
      },
    });
    assert.equal(received.status(), 200, await received.text());
    const created = await received.json();
    assert.equal(
      (
        await db.stockLot.findUniqueOrThrow({
          where: { id: created.lots[0].id },
        })
      ).alias,
      payload.alias,
    );
    const sale = {
      jobId: a.jobId,
      number: `F-ALIAS-${randomUUID().slice(0, 8)}`,
      description: payload.alias,
      date: "2026-11-06",
      net: "26",
      tax: "5.46",
      withholding: "0",
      collected: "0",
      requestKey: randomUUID(),
      lines: [
        {
          lotId: lot.id,
          description: payload.alias,
          quantity: "2",
          price: "13",
        },
      ],
    };
    assert.equal(
      (
        await a.admin.post("/api/operations/sale", {
          data: { ...sale, net: "25" },
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await a.admin.post("/api/operations/sale", {
          data: {
            ...sale,
            lines: [{ ...sale.lines[0], quantity: "0.5" }],
            net: "6.50",
          },
        })
      ).status(),
      400,
    );
    const confirmed = await a.admin.post("/api/operations/sale", {
      data: sale,
    });
    assert.equal(confirmed.status(), 200, await confirmed.text());
    const invoice = await confirmed.json();
    assert.equal(
      (await a.admin.post("/api/operations/sale", { data: sale })).status(),
      409,
    );
    assert.equal(
      (
        await b.admin.post("/api/operations/sale", {
          data: { ...sale, jobId: b.jobId, requestKey: randomUUID() },
        })
      ).status(),
      404,
    );
    assert.equal((await a.admin.post("/api/operations/stock-edit", {
      data: { lotId: lot.id, alias: "Enchufe salón actualizado" },
    })).status(), 200);
    const edited = await db.stockLot.findUniqueOrThrow({ where: { id: lot.id } });
    assert.equal(edited.code, lot.code);
    assert.equal(edited.location, payload.location);
    assert.equal(edited.brand, payload.brand);
    assert.equal(edited.model, payload.model);
    const snapshot = await db.saleLine.findFirstOrThrow({
      where: { saleId: invoice.id },
    });
    assert.equal(snapshot.description, payload.alias);
    assert.equal(
      (
        await db.stockLot.findUniqueOrThrow({ where: { id: lot.id } })
      ).onHand.toString(),
      "20",
    );
    await a.admin.post("/api/operations/stock-edit", { data: payload });
    console.log(
      "OK alias compartido y heredado, búsqueda normalizada/agotados, precios +30 %, permisos, factura con alias histórico e importes verificados, stock conservado.",
    );
    if (process.env.KEEP_FIXTURE === "1") {
      await writeFile(
        fixturePath,
        JSON.stringify({
          companies: ids,
          storageState: await a.admin.storageState(),
          origin,
          lotId: lot.id,
          code: lot.code,
          pendingCode: pending.code,
          alias: payload.alias,
          jobId: a.jobId,
          supplierId: supplier.id,
        }),
        { mode: 0o600 },
      );
      keep = true;
    }
  } finally {
    for (const c of contexts) await c.dispose();
    if (!keep) await clearCompanies(ids);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
