import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { PdfLayoutEditor } from "@/components/pdf-layout-editor";
export const dynamic = "force-dynamic";

// Editor de la plantilla PDF en su propia pestaña (se abre desde Configuración).
export default async function TemplatePage() {
  let u;
  try {
    u = await currentUser();
  } catch (e) {
    if (e instanceof AppError && e.status === 401) redirect("/login");
    throw e;
  }
  if (u.role !== "ADMIN") redirect("/");
  const [company, last] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: u.companyId } }),
    db.sale.findFirst({ where: { companyId: u.companyId }, orderBy: { date: "desc" }, include: { lines: true, job: { include: { customer: true } } } }),
  ]);
  // La vista del editor reproduce la última factura; los importes nunca salen de aquí.
  const c = last?.job.customer;
  const sample = last && c && {
    title: "FACTURA",
    number: last.number,
    date: last.date.toISOString(),
    due: last.dueAt && { label: "Vencimiento", date: last.dueAt.toISOString() },
    company: { name: company.name, taxId: company.taxId },
    customer: { name: c.name, taxId: c.taxId, address: c.address, phone: c.phone, email: c.email },
    job: { number: last.job.number, name: last.job.name },
    lines: last.lines.map((l) => ({ description: l.description, quantity: l.quantity.toString(), unit: l.unit })),
    totals: [
      "base", "tax",
      ...(Number(last.withholding) > 0 ? ["withholding"] : []),
      "total",
      ...(Number(last.collected) > 0 ? ["collected", "pending"] : []),
    ],
    notes: last.notes,
  };
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1 className="mt-2">Plantilla de facturas y presupuestos</h1>
          <p className="subtitle">Arrastra los elementos, cambia su tamaño o añade textos y cajas. Guarda para aplicarlo a los PDF.</p>
        </div>
        <Link className="text-button" href="/configuracion">Volver a Configuración</Link>
      </div>
      <section className="panel" style={{ paddingTop: 16 }}>
        <PdfLayoutEditor value={JSON.parse(JSON.stringify(company.pdfLayout ?? null))} sample={sample || undefined} previewUrl={last ? `/api/sales/${last.id}/pdf?inline=1` : undefined} />
      </section>
    </main>
  );
}
