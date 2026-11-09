"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Doc, Job, Sale } from "@/lib/workspace-types";
import InvoiceAttachments from "./invoice-attachments";
import { saleDue, saleStatus, saleTotal } from "@/lib/sales-view";
import { InvoiceActions, StatusPill, eur, fmt, todayIso } from "./invoice-list";

// Dentro de una factura: todas las acciones arriba, datos, líneas y totales.
export default function InvoiceDetail({ sale, job, onPayment, documents, refresh }: { sale?: Sale; job?: Job; onPayment: (s: Sale) => void; documents: Doc[]; refresh: () => Promise<void> }) {
  if (!sale)
    return (
      <div className="empty">
        <h3>Factura no encontrada</h3>
        <p><Link href="/facturas-venta" className="text-button">Volver a las facturas</Link></p>
      </div>
    );
  const status = saleStatus(sale, todayIso());
  return (
    <>
      <nav className="inv-crumbs" aria-label="Ruta">
        <Link href="/ventas">Ventas</Link>
        <ChevronRight size={14} />
        <Link href="/facturas-venta">Facturas de venta</Link>
        <ChevronRight size={14} />
        <span>{sale.number}</span>
      </nav>
      <div className="list-head">
        <h1>Factura {sale.number}</h1>
        <InvoiceActions sale={sale} onPayment={onPayment} open={false} />
        <StatusPill status={status} />
      </div>

      <section className="inv-card">
        <div className="inv-head">
          <div>
            <small className="muted">Cliente</small>
            <h2 style={{ fontSize: 20, margin: "4px 0" }}>{sale.customerName ?? "—"}</h2>
            {sale.customerEmail && <p className="small-note">{sale.customerEmail}</p>}
            {job && (
              <p className="small-note">
                Trabajo: <Link href={`/trabajos/${job.id}`} className="text-button">{job.number} · {job.name}</Link>
              </p>
            )}
          </div>
          <dl className="det-facts">
            <div><dt>Fecha</dt><dd>{fmt(sale.date)}</dd></div>
            <div><dt>Vencimiento</dt><dd>{fmt(sale.dueAt)}</dd></div>
            <div><dt>Total</dt><dd>{eur(saleTotal(sale).toString())}</dd></div>
            <div><dt>Cobrado</dt><dd>{eur(sale.collected)}</dd></div>
            <div><dt>Pendiente</dt><dd>{eur(saleDue(sale).toString())}</dd></div>
          </dl>
        </div>
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr><th>Descripción</th><th className="num">Unidades</th><th className="num">Precio sin IVA</th><th className="num">Dto.</th><th className="num">Base</th></tr>
            </thead>
            <tbody>
              {(sale.lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td style={{ padding: "10px 6px" }}>{l.description}</td>
                  <td className="num">{Number(l.quantity)} {l.unit}</td>
                  <td className="num">{eur(l.price)}</td>
                  <td className="num">{Number(l.discount) ? `${Number(l.discount)} %` : ""}</td>
                  <td className="num"><strong>{eur(l.net)}</strong></td>
                </tr>
              ))}
              {!sale.lines?.length && <tr><td colSpan={5} className="inv-empty">{sale.description}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="inv-bottom">
          <div>
            {sale.notes && (
              <>
                <h2>Anotaciones</h2>
                <p style={{ whiteSpace: "pre-wrap" }}>{sale.notes}</p>
              </>
            )}
          </div>
          <dl className="inv-totals">
            <div><dt>Base imponible</dt><dd>{eur(sale.net)}</dd></div>
            <div><dt>Impuestos</dt><dd>{eur(sale.tax)}</dd></div>
            {Number(sale.withholding) > 0 && <div><dt>Retención</dt><dd>−{eur(sale.withholding)}</dd></div>}
            <div className="grand"><dt>Total</dt><dd>{eur(saleTotal(sale).toString())}</dd></div>
          </dl>
        </div>
      </section>
      <InvoiceAttachments key={sale.id} sale={sale} documents={documents} refresh={refresh} />
    </>
  );
}
