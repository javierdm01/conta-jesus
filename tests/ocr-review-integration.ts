import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { request } from "@playwright/test";
import sharp from "sharp";
import { cents, sum } from "../src/lib/money";
const db = new PrismaClient();
const fixturePath = "data/ocr-review-fixture.json";
async function cleanup(companyId: string, filename: string) {
  const files = [
    ...new Set([
      filename,
      ...(
        await db.document.findMany({
          where: { companyId },
          select: { filename: true },
        })
      ).map((d) => d.filename),
    ]),
  ];
  await db.$transaction(async (tx) => {
    await tx.cost.deleteMany({ where: { companyId } });
    await tx.stockMovement.deleteMany({ where: { companyId } });
    await tx.documentLine.deleteMany({ where: { document: { companyId } } });
    await tx.stockReservation.deleteMany({ where: { lot: { companyId } } });
    await tx.stockLot.deleteMany({ where: { companyId } });
    await tx.document.updateMany({
      where: { companyId },
      data: { supersedesId: null },
    });
    await tx.document.deleteMany({ where: { companyId } });
    await tx.job.deleteMany({ where: { companyId } });
    await tx.customer.deleteMany({ where: { companyId } });
    await tx.supplier.deleteMany({ where: { companyId } });
    await tx.audit.deleteMany({ where: { companyId } });
    await tx.user.deleteMany({ where: { companyId } });
    await tx.company.delete({ where: { id: companyId } });
  });
  for (const file of files) {
    if (path.basename(file) !== file) throw Error("Ruta de prueba no válida.");
    await unlink(
      path.join(process.env.DOCUMENT_DIR ?? "data/documents", file),
    ).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  await unlink(fixturePath).catch(() => {});
}
async function main() {
  if (process.argv.includes("--cleanup")) {
    const f = JSON.parse(await readFile(fixturePath, "utf8"));
    await cleanup(f.companyId, f.filename);
    console.log("OK limpieza de empresa de prueba OCR.");
    return;
  }
  const suffix = randomUUID(),
    password = randomUUID() + "-Test",
    email = `ocr-${suffix}@prueba.invalid`,
    id = randomUUID();
  const company = await db.company.create({
    data: { name: `PRUEBA OCR ${suffix}` },
  });
  const filename = `ocr-test-${suffix}.png`;
  let keep = false;
  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const api = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  try {
    await db.user.create({
      data: {
        id,
        email,
        name: "Responsable PRUEBA OCR",
        role: "ADMIN",
        emailVerified: true,
        companyId: company.id,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
      },
    });
    assert.equal(
      (
        await api.post("/api/auth/sign-in/email", { data: { email, password } })
      ).status(),
      200,
    );
    const post = async (action: string, data: object) => {
      const r = await api.post(`/api/operations/${action}`, { data });
      assert.equal(r.status(), 200, await r.text());
      return r.json();
    };
    const supplier = await post("supplier", {
      name: "Proveedor OCR de prueba",
      taxId: "B12345678",
    });
    const customer = await post("customer", { name: "Cliente OCR de prueba" });
    const job = await post("job", {
      name: "Trabajo OCR de prueba",
      customerId: customer.id,
      service: "Otros",
    });
    const lines = [
      {
        reference: "EQ-12",
        description: "SET SPLIT MURAL",
        quantity: "1.00",
        price: "319.00",
        financial: false,
      },
      {
        reference: "TASA01",
        description: "TASA R32",
        quantity: "0.57",
        price: "0.00",
        financial: true,
      },
      {
        reference: "SOP-45",
        description: "Juego soporte",
        quantity: "1.00",
        price: "8.00",
        financial: false,
      },
      {
        reference: "AMORT01",
        description: "Juego amortiguador",
        quantity: "1.00",
        price: "1.50",
        financial: false,
      },
      {
        reference: "REG-01",
        description: "REGALO SOPORTE",
        quantity: "-1.00",
        price: "9.50",
        financial: true,
      },
    ].map((l) => ({ ...l, unit: "ud", discount: "0", jobId: job.id }));
    const suggestion = {
      number: "F-95151",
      date: "2026-09-28",
      net: "319.00",
      tax: "66.99",
      total: "385.99",
      lines,
      warnings: [],
      supplier: {
        name: "Proveedor propuesto",
        taxId: "B87654321",
        phone: "900 111 222",
        email: "",
      },
    };
    await sharp(
      Buffer.from(
        '<svg width="800" height="400"><rect width="800" height="400" fill="white"/><text x="30" y="70" font-size="35">FACTURA DE PRUEBA OCR</text></svg>',
      ),
    )
      .png()
      .toFile(
        path.join(process.env.DOCUMENT_DIR ?? "data/documents", filename),
      );
    const doc = async (label: string, kind = "PURCHASE") =>
      db.document.create({
        data: {
          companyId: company.id,
          uploaderId: id,
          filename,
          mime: "image/png",
          hash: randomUUID(),
          originalName: `PRUEBA ${label}.png`,
          kind,
          status: "REVIEW",
          suggestion,
        },
      });
    const stockDoc = await doc("almacén");
    const data = {
      supplierId: supplier.id,
      date: "2026-09-28",
      net: "319.00",
      tax: "66.99",
      reviewed: true,
      lines,
    };
    const stock = await post("stock-confirm", {
      ...data,
      documentId: stockDoc.id,
      number: "F-STOCK",
    });
    assert.equal(stock.lots.length, 3);
    const lots = await db.stockLot.findMany({
      where: { documentId: stockDoc.id },
    });
    assert.equal(
      cents(sum(lots.map((l) => l.totalValue!.toString()))),
      "319.00",
    );
    assert.ok(lots.every((l) => l.received.eq(1)));
    assert.equal(
      await db.documentLine.count({ where: { documentId: stockDoc.id } }),
      5,
    );
    for (const lot of lots)
      await post("stock-move", {
        lotId: lot.id,
        kind: "USE",
        quantity: "1",
        jobId: job.id,
        requestKey: randomUUID(),
      });
    assert.equal(
      cents(
        sum(
          (await db.cost.findMany({ where: { documentId: stockDoc.id } })).map(
            (c) => c.amount.toString(),
          ),
        ),
      ),
      "319.00",
    );
    assert.equal(
      (
        await api.post("/api/operations/retry", {
          data: { documentId: stockDoc.id },
        })
      ).status(),
      409,
    );
    const jobDoc = await doc("costes");
    await post("review", { ...data, documentId: jobDoc.id, number: "F-JOB" });
    assert.equal(
      cents(
        sum(
          (await db.cost.findMany({ where: { documentId: jobDoc.id } })).map(
            (c) => c.amount.toString(),
          ),
        ),
      ),
      "319.00",
    );
    const delivery = await doc("albarán", "DELIVERY");
    const receipt = await post("stock-confirm", {
      ...data,
      documentId: delivery.id,
      number: "A-TEST",
      net: null,
      tax: null,
      lines: lines
        .filter((l) => !l.financial)
        .map((l) => ({ ...l, price: null })),
    });
    const receiptLots = await db.stockLot.findMany({
      where: { documentId: delivery.id },
    });
    const invoice = await doc("valoración");
    await post("stock-reconcile", {
      ...data,
      documentId: invoice.id,
      number: "F-RECONCILE",
      supersedesId: delivery.id,
      lines: lines.map((l) => ({
        ...l,
        lotId: l.financial
          ? undefined
          : receiptLots.find((r) => r.reference === l.reference)!.id,
      })),
    });
    assert.equal(receipt.lots.length, 3);
    assert.equal(
      cents(
        sum(
          (
            await db.stockLot.findMany({ where: { documentId: delivery.id } })
          ).map((l) => l.totalValue!.toString()),
        ),
      ),
      "319.00",
    );
    const review = await doc("revisión de campos");
    if (process.env.KEEP_TEST_DATA === "1") {
      await writeFile(
        fixturePath,
        JSON.stringify({
          companyId: company.id,
          filename,
          email,
          password,
          reviewId: review.id,
          jobId: job.id,
          origin,
        }),
      );
      keep = true;
    }
    console.log(
      "OK OCR: proveedor por API, cinco líneas, tres lotes físicos, ajuste negativo, coste 319, valoración sin duplicados y bloqueo de releer confirmados.",
    );
  } finally {
    await api.dispose();
    if (!keep) await cleanup(company.id, filename);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
