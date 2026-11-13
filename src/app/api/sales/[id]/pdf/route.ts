import { currentUser, admin, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { dec, cents } from "@/lib/money";
import { renderDocumentPdf, pdfResponse, eur } from "@/lib/pdf-document";

export const runtime = "nodejs";

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
    const total = dec(sale.net.toString()).plus(sale.tax.toString()).minus(sale.withholding.toString());
    const totals = [
      { key: "base" as const, value: eur(sale.net.toString()) },
      { key: "tax" as const, value: eur(sale.tax.toString()) },
      ...(dec(sale.withholding.toString()).gt(0) ? [{ key: "withholding" as const, value: `-${eur(sale.withholding.toString())}` }] : []),
      { key: "total" as const, value: eur(cents(total)) },
      ...(dec(sale.collected.toString()).gt(0)
        ? [
            { key: "collected" as const, value: eur(sale.collected.toString()) },
            { key: "pending" as const, value: eur(cents(total.minus(sale.collected.toString()))) },
          ]
        : []),
    ];
    const buf = await renderDocumentPdf(
      {
        title: "FACTURA",
        number: sale.number,
        date: sale.date,
        due: sale.dueAt && { label: "Vencimiento", date: sale.dueAt },
        company,
        customer: sale.job.customer,
        job: sale.job,
        lines: sale.lines.map((l) => ({ description: l.description, unit: l.unit, quantity: l.quantity.toString(), price: l.price.toString(), discount: l.discount.toString(), net: l.net.toString() })),
        totals,
        notes: sale.notes,
      },
      company.pdfLayout,
    );
    return pdfResponse(buf, req, `Factura-${sale.number}`);
  } catch (e) {
    return apiError(e);
  }
}
