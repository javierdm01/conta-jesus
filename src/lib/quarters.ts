import path from "node:path";
import { stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { AppError } from "./access";
import { db } from "./db";
import { cents, dec, sum } from "./money";
import { csvCell } from "./inventory-view";
import { EXPENSE_LABEL } from "./expenses";
import { safeName, type ZipEntry } from "./zip";

export type Period = { year: number; quarter: 1 | 2 | 3 | 4 };
export function parsePeriod(year: unknown, quarter: unknown): Period {
  const y = Number(year),
    q = Number(quarter);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || ![1, 2, 3, 4].includes(q))
    throw new Error("Trimestre no válido.");
  return { year: y, quarter: q as Period["quarter"] };
}
// Las fechas de documento se guardan a medianoche UTC: los límites también.
export const range = ({ year, quarter }: Period) => ({
  gte: new Date(Date.UTC(year, (quarter - 1) * 3, 1)),
  lt: new Date(Date.UTC(year, quarter * 3, 1)),
});
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const money = (v: { toString(): string } | null | undefined) =>
  v == null ? "0.00" : cents(v.toString());
const ext = (mime: string) =>
  mime === "application/pdf"
    ? "pdf"
    : (mime.split("/")[1]?.replace("jpeg", "jpg") ?? "bin");

// Un abono de proveedor resta de las compras y del IVA soportado.
const sign = (d: { kind: string }) => (d.kind === "CREDIT" ? -1 : 1);

export async function quarterReport(companyId: string, period: Period) {
  const between = range(period);
  const [received, issued, deliveries, overheads, hours, pending, company] =
    await Promise.all([
      db.document.findMany({
        where: {
          companyId,
          kind: { in: ["PURCHASE", "CREDIT"] },
          status: "CONFIRMED",
          date: between,
        },
        include: { supplier: { select: { name: true, taxId: true } } },
        orderBy: [{ date: "asc" }, { number: "asc" }],
      }),
      db.sale.findMany({
        where: { companyId, date: between },
        include: {
          job: {
            select: {
              name: true,
              number: true,
              customer: { select: { name: true, taxId: true } },
            },
          },
        },
        orderBy: [{ date: "asc" }, { number: "asc" }],
      }),
      db.document.count({
        where: {
          companyId,
          kind: "DELIVERY",
          status: "CONFIRMED",
          date: between,
          replacedBy: null,
        },
      }),
      db.overhead.findMany({
        where: { companyId, date: between },
        include: { document: { select: { filename: true, mime: true } } },
        orderBy: { date: "asc" },
      }),
      db.timeEntry.findMany({
        where: { companyId, date: between },
        select: { hours: true, hourlyCost: true },
      }),
      db.document.count({
        where: {
          companyId,
          kind: { in: ["PURCHASE", "SALE"] },
          status: { in: ["QUEUED", "PROCESSING", "REVIEW", "FAILED"] },
          createdAt: {
            gte: between.gte,
            lt: new Date(between.lt.getTime() + 45 * 86400000),
          },
        },
      }),
      db.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true, taxId: true },
      }),
    ]);
  const issuedFiles = await db.document.findMany({
    where: {
      companyId,
      id: {
        in: issued.map((s) => s.documentId).filter((id): id is string => !!id),
      },
    },
    select: { id: true, filename: true, mime: true },
  });
  const fileById = new Map(issuedFiles.map((d) => [d.id, d]));
  const salesNet = sum(issued.map((s) => s.net.toString())),
    salesTax = sum(issued.map((s) => s.tax.toString())),
    withheld = sum(issued.map((s) => s.withholding.toString())),
    collected = sum(issued.map((s) => s.collected.toString())),
    buyNet = sum(received.map((d) => dec(d.net?.toString() ?? 0).mul(sign(d)))),
    buyTax = sum(received.map((d) => dec(d.tax?.toString() ?? 0).mul(sign(d)))),
    ovNet = sum(overheads.map((o) => o.amount.toString())),
    ovTax = sum(overheads.map((o) => o.tax.toString())),
    labor = sum(
      hours.map((h) =>
        dec(h.hours.toString()).mul(h.hourlyCost.toString()).toDecimalPlaces(2),
      ),
    );
  const inputTax = buyTax.plus(ovTax);
  const warnings: string[] = [];
  const noFile = issued.filter(
    (s) => !s.documentId || !fileById.has(s.documentId),
  ).length;
  if (noFile)
    warnings.push(
      `${noFile} factura(s) emitida(s) sin archivo adjunto: no se incluirán en el paquete.`,
    );
  if (deliveries)
    warnings.push(
      `${deliveries} albarán(es) del trimestre sin factura del proveedor: su IVA no se cuenta hasta que llegue la factura.`,
    );
  if (pending)
    warnings.push(
      `${pending} documento(s) sin confirmar (en cola, revisión o con error): revísalos antes de cerrar.`,
    );
  if (received.some((d) => d.net == null || d.tax == null))
    warnings.push("Hay facturas recibidas sin base o IVA completos.");
  return {
    period,
    company,
    totals: {
      salesNet: cents(salesNet),
      outputTax: cents(salesTax),
      purchasesNet: cents(buyNet),
      overheadNet: cents(ovNet),
      inputTax: cents(inputTax),
      vatBalance: cents(salesTax.minus(inputTax)),
      withheld: cents(withheld),
      collected: cents(collected),
      pendingCollection: cents(
        salesNet.plus(salesTax).minus(withheld).minus(collected),
      ),
      labor: cents(labor),
      approxResult: cents(salesNet.minus(buyNet).minus(ovNet).minus(labor)),
    },
    warnings,
    received: received.map((d) => ({
      id: d.id,
      date: day(d.date),
      supplier: d.supplier?.name ?? "",
      supplierTaxId: d.supplier?.taxId ?? "",
      number: d.kind === "CREDIT" ? `${d.number ?? ""} (abono)` : (d.number ?? ""),
      net: cents(dec(money(d.net)).mul(sign(d))),
      tax: cents(dec(money(d.tax)).mul(sign(d))),
      total: cents(dec(money(d.net)).plus(money(d.tax)).mul(sign(d))),
      file: d.filename,
      mime: d.mime,
    })),
    issued: issued.map((s) => ({
      id: s.id,
      date: day(s.date),
      customer: s.job.customer.name,
      customerTaxId: s.job.customer.taxId,
      number: s.number,
      job: `${s.job.number} · ${s.job.name}`,
      net: money(s.net),
      tax: money(s.tax),
      withholding: money(s.withholding),
      total: cents(
        dec(s.net.toString())
          .plus(s.tax.toString())
          .minus(s.withholding.toString()),
      ),
      collected: money(s.collected),
      documentId: s.documentId,
      file: s.documentId
        ? (fileById.get(s.documentId)?.filename ?? null)
        : null,
      mime: s.documentId ? (fileById.get(s.documentId)?.mime ?? null) : null,
    })),
    overheads: overheads.map((o) => ({
      id: o.id,
      date: day(o.date),
      description: o.description,
      category: o.category,
      net: money(o.amount),
      tax: money(o.tax),
      file: o.document?.filename ?? null,
      mime: o.document?.mime ?? null,
    })),
  };
}
export type QuarterReport = Awaited<ReturnType<typeof quarterReport>>;

const comma = (v: string) => v.replace(".", ",");
const csv = (rows: string[][]) =>
  "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
const archiveName = (
  folder: string,
  who: string,
  date: string,
  number: string,
  mime: string,
  id: string,
) =>
  `${folder}/${date}_${safeName(who) || "sin-nombre"}_${safeName(number) || "sin-numero"}_${safeName(id)}.${ext(mime)}`;

export function quarterCsvs(r: QuarterReport) {
  const t = r.totals;
  return {
    "resumen.csv": csv([
      ["Concepto", "Importe (€)"],
      [
        `Resumen aproximado ${r.period.year} T${r.period.quarter} · ${r.company.name} ${r.company.taxId}`,
        "",
      ],
      ["Ventas (base)", comma(t.salesNet)],
      ["IVA repercutido", comma(t.outputTax)],
      ["Compras (base, facturas recibidas)", comma(t.purchasesNet)],
      ["Gastos generales (base)", comma(t.overheadNet)],
      ["IVA soportado", comma(t.inputTax)],
      ["IVA a ingresar (+) / compensar (-)", comma(t.vatBalance)],
      ["Retenciones soportadas en ventas", comma(t.withheld)],
      ["Mano de obra propia (horas × coste)", comma(t.labor)],
      ["Resultado aproximado", comma(t.approxResult)],
      ["Cobrado de ventas del trimestre", comma(t.collected)],
      ["Pendiente de cobro", comma(t.pendingCollection)],
    ]),
    "facturas_recibidas.csv": csv([
      [
        "Fecha",
        "Proveedor",
        "NIF",
        "Nº factura",
        "Base",
        "IVA",
        "Total",
        "Archivo",
      ],
      ...r.received.map((d) => [
        d.date,
        d.supplier,
        d.supplierTaxId,
        d.number,
        comma(d.net),
        comma(d.tax),
        comma(d.total),
        archiveName("recibidas", d.supplier, d.date, d.number, d.mime, d.id),
      ]),
    ]),
    "facturas_emitidas.csv": csv([
      [
        "Fecha",
        "Cliente",
        "NIF",
        "Nº factura",
        "Trabajo",
        "Base",
        "IVA",
        "Retención",
        "Total",
        "Cobrado",
        "Archivo",
      ],
      ...r.issued.map((s) => [
        s.date,
        s.customer,
        s.customerTaxId,
        s.number,
        s.job,
        comma(s.net),
        comma(s.tax),
        comma(s.withholding),
        comma(s.total),
        comma(s.collected),
        s.documentId && s.file && s.mime
          ? archiveName(
              "emitidas",
              s.customer,
              s.date,
              s.number,
              s.mime,
              s.documentId,
            )
          : "sin archivo",
      ]),
    ]),
    "gastos_generales.csv": csv([
      ["Fecha", "Categoría", "Descripción", "Base", "IVA", "Justificante"],
      ...r.overheads.map((o) => [
        o.date,
        EXPENSE_LABEL[o.category] ?? o.category,
        o.description,
        comma(o.net),
        comma(o.tax),
        o.file
          ? archiveName("gastos", EXPENSE_LABEL[o.category] ?? o.category, o.date, o.description, o.mime ?? "", o.id)
          : "sin justificante",
      ]),
    ]),
  };
}

export async function quarterZip(
  companyId: string,
  r: QuarterReport,
): Promise<ZipEntry[]> {
  const dir = path.resolve(/* turbopackIgnore: true */ process.env.DOCUMENT_DIR ?? "data/documents");
  const entries: ZipEntry[] = Object.entries(quarterCsvs(r)).map(
    ([name, text]) => ({ name, text }),
  );
  entries.push({
    name: "LEEME.txt",
    text:
      `Paquete del trimestre ${r.period.year} T${r.period.quarter} · ${r.company.name}\r\n` +
      "Cifras aproximadas para preparar la declaración con tu asesoría; no son una liquidación oficial.\r\n" +
      (r.warnings.length
        ? "\r\nAvisos:\r\n- " + r.warnings.join("\r\n- ") + "\r\n"
        : ""),
  });
  for (const d of r.received)
    entries.push({
      name: archiveName(
        "recibidas",
        d.supplier,
        d.date,
        d.number,
        d.mime,
        d.id,
      ),
      file: path.join(/* turbopackIgnore: true */ dir, path.basename(d.file)),
    });
  for (const o of r.overheads)
    if (o.file)
      entries.push({
        name: archiveName("gastos", EXPENSE_LABEL[o.category] ?? o.category, o.date, o.description, o.mime ?? "", o.id),
        file: path.join(/* turbopackIgnore: true */ dir, path.basename(o.file)),
      });
  const files = await db.document.findMany({
    where: {
      companyId,
      id: {
        in: r.issued.map((s) => s.documentId).filter((x): x is string => !!x),
      },
    },
    select: { id: true, filename: true, mime: true },
  });
  for (const s of r.issued) {
    const f = files.find((x) => x.id === s.documentId);
    if (f)
      entries.push({
        name: archiveName(
          "emitidas",
          s.customer,
          s.date,
          s.number,
          f.mime,
          f.id,
        ),
        file: path.join(/* turbopackIgnore: true */ dir, path.basename(f.filename)),
      });
  }
  return entries;
}

export async function verifyQuarterFiles(entries: ZipEntry[]) {
  const files = entries.filter(
    (e): e is Extract<ZipEntry, { file: string }> => "file" in e,
  );
  const results = await Promise.allSettled(
    files.map(async (e) => {
      const info = await stat(e.file);
      if (!info.isFile() || info.size === 0)
        throw new Error("Archivo no disponible");
      await access(e.file, constants.R_OK);
    }),
  );
  const missing = files.filter((_, i) => results[i].status === "rejected");
  if (missing.length)
    throw new AppError(
      `No se puede preparar un paquete completo: faltan ${missing.length} archivo(s). Revisa los originales o restaura la copia antes de descargar.`,
      409,
    );
  return files.length;
}
