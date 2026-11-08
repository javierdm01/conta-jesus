import PDFDocument from "pdfkit";
import { currentUser, admin, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { dec, cents } from "@/lib/money";

export const runtime = "nodejs";
const eur = (n: string | number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));
const day = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" }).format(d);

// Factura de cliente en PDF. ?inline=1 la abre en el navegador (para imprimir); sin él, se descarga.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    admin(u);
    const { id } = await params;
    const sale = await db.sale.findFirst({
      where: { id, companyId: u.companyId },
      include: { lines: true, job: { include: { customer: true } } },
    });
    if (!sale) throw new AppError("Factura no encontrada.", 404);
    const company = await db.company.findUniqueOrThrow({ where: { id: u.companyId } });
    const c = sale.job.customer;

    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Factura ${sale.number}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
    const teal = "#0f766e",
      grey = "#64748b",
      W = doc.page.width - 96,
      right = 48 + W;

    doc.fillColor(teal).fontSize(20).font("Helvetica-Bold").text(company.name, 48, 48, { width: 260 });
    doc.fillColor(grey).fontSize(9).font("Helvetica");
    if (company.taxId) doc.text(`NIF/CIF: ${company.taxId}`, 48);
    doc.fillColor("#0f172a").fontSize(24).font("Helvetica-Bold").text("FACTURA", 48, 48, { align: "right", width: W });
    doc.fontSize(10).font("Helvetica").fillColor(grey).text(`Nº ${sale.number}`, 48, 78, { align: "right", width: W });
    doc.text(`Fecha: ${day(sale.date)}`, 48, 92, { align: "right", width: W });
    if (sale.dueAt) doc.text(`Vencimiento: ${day(sale.dueAt)}`, 48, 106, { align: "right", width: W });

    doc.moveTo(48, 130).lineTo(right, 130).strokeColor("#e2e8f0").stroke();
    doc.fillColor(grey).fontSize(8).text("CLIENTE", 48, 142);
    doc.fillColor("#0f172a").fontSize(12).font("Helvetica-Bold").text(c.name, 48, 154, { width: 260 });
    doc.font("Helvetica").fontSize(9).fillColor(grey);
    for (const line of [c.taxId && `NIF/CIF: ${c.taxId}`, c.address, c.phone, c.email].filter(Boolean) as string[]) doc.text(line, 48, undefined, { width: 260 });
    doc.fillColor(grey).fontSize(8).text("TRABAJO", 330, 142);
    doc.fillColor("#0f172a").fontSize(10).text(`${sale.job.number} · ${sale.job.name}`, 330, 154, { width: 215 });

    // Tabla de líneas
    const cols = [48, 300, 355, 420, 470];
    let y = 245;
    doc.rect(48, y - 6, W, 22).fill("#f1f5f9");
    doc.fillColor(grey).fontSize(8).font("Helvetica-Bold");
    doc.text("DESCRIPCIÓN", cols[0] + 6, y);
    doc.text("UDS.", cols[1], y, { width: 45, align: "right" });
    doc.text("PRECIO", cols[2], y, { width: 55, align: "right" });
    doc.text("DTO.", cols[3], y, { width: 40, align: "right" });
    doc.text("BASE", cols[4], y, { width: right - cols[4] - 6, align: "right" });
    y += 24;
    doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
    for (const l of sale.lines) {
      const h = Math.max(16, doc.heightOfString(l.description, { width: 240 }) + 6);
      if (y + h > doc.page.height - 190) {
        doc.addPage();
        y = 60;
      }
      doc.fillColor("#0f172a");
      doc.text(l.description, cols[0] + 6, y, { width: 240 });
      doc.text(`${Number(l.quantity)} ${l.unit}`, cols[1], y, { width: 45, align: "right" });
      doc.text(eur(l.price.toString()), cols[2], y, { width: 55, align: "right" });
      doc.text(Number(l.discount) ? `${Number(l.discount)} %` : "", cols[3], y, { width: 40, align: "right" });
      doc.text(eur(l.net.toString()), cols[4], y, { width: right - cols[4] - 6, align: "right" });
      y += h;
      doc.moveTo(48, y - 2).lineTo(right, y - 2).strokeColor("#f1f5f9").stroke();
    }

    // Totales (a la derecha) y anotaciones (a la izquierda)
    const total = dec(sale.net.toString()).plus(sale.tax.toString()).minus(sale.withholding.toString());
    y += 22;
    if (y > doc.page.height - 170) {
      doc.addPage();
      y = 60;
    }
    const top = y;
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 13 : 10).fillColor(bold ? teal : "#0f172a");
      doc.text(label, 330, y, { width: 120 });
      doc.text(value, 440, y, { width: right - 440, align: "right" });
      y += bold ? 24 : 18;
    };
    row("Base imponible", eur(sale.net.toString()));
    row("Impuestos", eur(sale.tax.toString()));
    if (dec(sale.withholding.toString()).gt(0)) row("Retención", `-${eur(sale.withholding.toString())}`);
    row("TOTAL", eur(cents(total)), true);
    if (dec(sale.collected.toString()).gt(0)) {
      row("Cobrado", eur(sale.collected.toString()));
      row("Pendiente", eur(cents(total.minus(sale.collected.toString()))));
    }
    if (sale.notes) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(grey).text("ANOTACIONES", 48, top);
      doc.font("Helvetica").fontSize(9).fillColor("#0f172a").text(sale.notes, 48, top + 14, { width: 250 });
    }
    doc.end();
    const buf = await done;
    const inline = new URL(req.url).searchParams.has("inline");
    const safe = sale.number.replace(/[^\w.-]+/g, "_");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="Factura-${safe}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
