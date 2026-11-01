import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink, rename, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { request, type APIRequestContext } from "@playwright/test";

// Cierre trimestral por HTTP: totales, avisos, permisos y paquete ZIP. Limpia sus datos.
const db = new PrismaClient(),
  origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  suffix = randomUUID().slice(0, 8),
  password = randomUUID() + "-Prueba";
const files: string[] = [];
async function login(email: string) {
  const c = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const r = await c.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  assert.equal(r.status(), 200, await r.text());
  return c;
}
async function post(c: APIRequestContext, action: string, data: object) {
  const r = await c.post(`/api/operations/${action}`, {
    data: { ...data, requestKey: randomUUID() },
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function main() {
  const company = await db.company.create({
    data: { name: `EMPRESA TRIMESTRE ${suffix}`, taxId: "B00000000" },
  });
  try {
    const hash = await hashPassword(password);
    async function user(role: string) {
      const id = randomUUID(),
        email = `${role.toLowerCase()}-${suffix}@prueba.invalid`;
      await db.user.create({
        data: {
          id,
          name: `${role} PRUEBA`,
          email,
          emailVerified: true,
          companyId: company.id,
          role,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: id,
              providerId: "credential",
              password: hash,
            },
          },
        },
      });
      return email;
    }
    const a = await login(await user("ADMIN")),
      t = await login(await user("TECHNICIAN"));
    const customer = await post(a, "customer", {
      name: "Cliente TRIM",
      taxId: "A11111111",
    });
    const supplier = await post(a, "supplier", {
      name: "Proveedor TRIM",
      taxId: "B22222222",
    });
    const job = await post(a, "job", {
      name: "TRIM · obra",
      customerId: customer.id,
      service: "Otros",
    });
    // Factura recibida con archivo real.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="white"/><text x="30" y="80" font-size="36" font-family="Arial">Factura TRIM ${suffix}</text></svg>`;
    const up = await a.post("/api/documents", {
      multipart: {
        kind: "PURCHASE",
        jobId: job.id,
        file: {
          name: "f.png",
          mimeType: "image/png",
          buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
        },
      },
    });
    assert.equal(up.status(), 201, await up.text());
    const { id: docId } = await up.json();
    files.push(
      (await db.document.findUniqueOrThrow({ where: { id: docId } })).filename,
    );
    await db.document.update({
      where: { id: docId },
      data: { status: "REVIEW" },
    });
    await post(a, "review", {
      documentId: docId,
      supplierId: supplier.id,
      number: `R-${suffix}`,
      date: "2026-02-10",
      net: "100",
      tax: "21",
      reviewed: true,
      lines: [
        {
          jobId: job.id,
          reference: "",
          description: "Material",
          unit: "ud",
          quantity: "1",
          price: "100",
          discount: "0",
        },
      ],
    });
    // Venta (sin archivo), gasto general con IVA y una fuera de trimestre.
    await post(a, "sale", {
      jobId: job.id,
      number: `V-${suffix}`,
      description: "Obra",
      date: "2026-03-31",
      net: "500",
      tax: "105",
      withholding: "0",
      collected: "105",
    });
    await post(a, "sale", {
      jobId: job.id,
      number: `V2-${suffix}`,
      description: "Otra",
      date: "2026-04-01",
      net: "999",
      tax: "209.79",
      withholding: "0",
      collected: "0",
    });
    await post(a, "overhead", {
      description: "Gasolina",
      amount: "50",
      tax: "10.50",
      date: "2026-01-15",
    });

    const r = await a.get("/api/quarters?year=2026&quarter=1");
    assert.equal(r.status(), 200, await r.text());
    const q = await r.json();
    assert.equal(q.totals.salesNet, "500.00");
    assert.equal(q.totals.outputTax, "105.00");
    assert.equal(q.totals.purchasesNet, "100.00");
    assert.equal(q.totals.overheadNet, "50.00");
    assert.equal(q.totals.inputTax, "31.50");
    assert.equal(q.totals.vatBalance, "73.50");
    assert.equal(q.totals.approxResult, "350.00");
    assert.equal(q.received.length, 1);
    assert.equal(q.issued.length, 1);
    assert.ok(q.warnings.some((w: string) => w.includes("sin archivo")));
    const q2 = await (await a.get("/api/quarters?year=2026&quarter=2")).json();
    assert.equal(q2.totals.salesNet, "999.00");
    assert.equal(
      (await t.get("/api/quarters?year=2026&quarter=1")).status(),
      403,
    );
    assert.equal(
      (await a.get("/api/quarters?year=2026&quarter=5")).status(),
      400,
    );
    // Nombres distintos de proveedor pueden coincidir al sanearlos para el ZIP.
    const secondSupplier = await db.supplier.create({
      data: {
        companyId: company.id,
        name: "Proveedor/TRIM",
        taxId: "B33333333",
      },
    });
    const firstDoc = await db.document.findUniqueOrThrow({
      where: { id: docId },
    });
    const secondFilename = `${randomUUID()}.png`;
    await writeFile(
      path.resolve(
        process.env.DOCUMENT_DIR ?? "data/documents",
        secondFilename,
      ),
      await readFile(
        path.resolve(
          process.env.DOCUMENT_DIR ?? "data/documents",
          firstDoc.filename,
        ),
      ),
    );
    files.push(secondFilename);
    await db.document.create({
      data: {
        companyId: company.id,
        uploaderId: firstDoc.uploaderId,
        supplierId: secondSupplier.id,
        kind: "PURCHASE",
        status: "CONFIRMED",
        originalName: "PRUEBA-collision.png",
        filename: secondFilename,
        mime: "image/png",
        hash: randomUUID(),
        number: firstDoc.number,
        date: firstDoc.date,
        net: "1",
        tax: "0.21",
      },
    });
    const zip = await a.get("/api/quarters?year=2026&quarter=1&format=zip");
    assert.equal(zip.status(), 200);
    const buf = await zip.body();
    assert.equal(buf.readUInt32LE(0), 0x04034b50);
    const text = buf.toString("latin1");
    for (const name of ["resumen.csv", "facturas_recibidas.csv", "LEEME.txt"])
      assert.ok(text.includes(name), name);
    assert.ok(text.includes("recibidas/2026-02-10_Proveedor_TRIM_R-"));
    let central = buf.readUInt32LE(buf.length - 6);
    const names: string[] = [];
    for (let i = 0; i < buf.readUInt16LE(buf.length - 12); i++) {
      const len = buf.readUInt16LE(central + 28);
      names.push(
        buf.subarray(central + 46, central + 46 + len).toString("utf8"),
      );
      central +=
        46 +
        len +
        buf.readUInt16LE(central + 30) +
        buf.readUInt16LE(central + 32);
    }
    const originals = names.filter((n) => n.startsWith("recibidas/"));
    assert.equal(originals.length, 2);
    assert.notEqual(originals[0], originals[1]);
    for (const name of originals)
      assert.ok(
        buf.includes(Buffer.from(`"${name}"`)),
        `El CSV debe apuntar al archivo real: ${name}`,
      );
    const csv = await a.get("/api/quarters?year=2026&quarter=1&format=csv");
    assert.equal(csv.status(), 200);
    const summary = (await csv.body()).toString("utf8");
    assert.equal([...summary.matchAll(/\uFEFF/g)].length, 1);
    assert.ok(summary.includes('"Concepto";"Importe (€)"'));
    assert.equal(summary.includes('"Fecha";"Proveedor"'), false);
    const ready = await a.get("/api/quarters?year=2026&quarter=1&format=check");
    assert.equal(ready.status(), 200);
    const original = path.resolve(
      process.env.DOCUMENT_DIR ?? "data/documents",
      files[0],
    );
    await rename(original, `${original}.test-missing`);
    try {
      const missing = await a.get(
        "/api/quarters?year=2026&quarter=1&format=zip",
      );
      assert.equal(missing.status(), 409);
      assert.match((await missing.json()).error, /paquete completo/);
      assert.equal(
        (
          await a.get("/api/quarters?year=2026&quarter=1&format=check")
        ).status(),
        409,
      );
    } finally {
      await rename(`${original}.test-missing`, original);
    }
    assert.equal(
      (await t.get("/api/quarters?year=2026&quarter=1&format=check")).status(),
      403,
    );
    console.log("OK trimestre: totales, IVA, avisos, permisos, CSV y ZIP");
  } finally {
    const where = { companyId: company.id };
    await db.cost.deleteMany({ where });
    await db.documentLine.deleteMany({ where: { document: where } });
    await db.document.updateMany({ where, data: { supersedesId: null } });
    await db.document.deleteMany({ where });
    await db.sale.deleteMany({ where });
    await db.overhead.deleteMany({ where });
    await db.audit.deleteMany({ where });
    await db.job.deleteMany({ where });
    await db.customer.deleteMany({ where });
    await db.supplier.deleteMany({ where });
    await db.worker.deleteMany({ where });
    const users = await db.user.findMany({ where, select: { id: true } });
    await db.session.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.account.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.user.deleteMany({ where });
    await db.company.delete({ where: { id: company.id } });
    for (const f of files)
      await unlink(
        path.resolve(process.env.DOCUMENT_DIR ?? "data/documents", f),
      ).catch(() => {});
    await db.$disconnect();
    console.log("Datos de prueba retirados.");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
