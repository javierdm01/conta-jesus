import { currentUser, admin, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { dec, cents } from "@/lib/money";
import { renderDocumentPdf, pdfResponse, eur } from "@/lib/pdf-document";

export const runtime = "nodejs";

// Presupuesto en PDF. ?inline=1 la abre en el navegador (para imprimir); sin él, se descarga.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    admin(u);
    const { id } = await params;
    const quote = await db.quote.findFirst({
      where: { id, companyId: u.companyId },
      include: { job: { include: { customer: true } } },
    });
    if (!quote) throw new AppError("Presupuesto no encontrado.", 404);
    type QLine = { description: string; unit: string; quantity: string; price: string; discount?: string; net: string };
    // Los presupuestos antiguos (solo coste y precio) se muestran con una única línea.
    const lines: QLine[] = Array.isArray(quote.lines) && quote.lines.length ? (quote.lines as unknown as QLine[]) : [{ description: quote.name, unit: "ud", quantity: "1", price: quote.net.toString(), discount: "0", net: quote.net.toString() }];
    const company = await db.company.findUniqueOrThrow({ where: { id: u.companyId } });
    const number = quote.number || quote.name;
    const buf = await renderDocumentPdf(
      {
        title: "PRESUPUESTO",
        number,
        date: quote.date,
        due: quote.validUntil && { label: "Válido hasta", date: quote.validUntil },
        company,
        customer: quote.job.customer,
        job: quote.job,
        lines,
        totals: [
          { key: "base", value: eur(quote.net.toString()) },
          { key: "tax", value: eur(quote.tax.toString()) },
          { key: "total", value: eur(cents(dec(quote.net.toString()).plus(quote.tax.toString()))) },
        ],
        notes: quote.notes,
      },
      company.pdfLayout,
    );
    return pdfResponse(buf, req, `Presupuesto-${number}`);
  } catch (e) {
    return apiError(e);
  }
}
