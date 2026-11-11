"use client";
import { jobPath } from "@/lib/job-path";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Job, Quote } from "@/lib/workspace-types";
import { eur, fmt } from "./invoice-list";
import { QuoteActions, QuotePill, quoteLabel, quoteTotal } from "./quotes-list";

// Dentro de un presupuesto: acciones arriba, datos, líneas y totales (como una factura).
export default function QuoteDetail({ quote, job, refresh }: { quote?: Quote; job?: Job; refresh: () => Promise<void> }) {
  const [error, setError] = useState("");
  if (!quote)
    return (
      <div className="empty">
        <h3>Presupuesto no encontrado</h3>
        <p><Link href="/presupuestos" className="text-button">Volver a los presupuestos</Link></p>
      </div>
    );
  return (
    <>
      <nav className="inv-crumbs" aria-label="Ruta">
        <Link href="/ventas">Ventas</Link>
        <ChevronRight size={14} />
        <Link href="/presupuestos">Presupuestos</Link>
        <ChevronRight size={14} />
        <span>{quoteLabel(quote)}</span>
      </nav>
      <div className="list-head">
        <h1>Presupuesto {quoteLabel(quote)}</h1>
        <QuoteActions quote={quote} job={job} open={false} refresh={refresh} onError={setError} />
        <QuotePill approved={quote.approved} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="inv-card">
        <div className="inv-head">
          <div>
            <small className="muted">Cliente</small>
            <h2 style={{ fontSize: 20, margin: "4px 0" }}>{job?.customer.name ?? "—"}</h2>
            {job && (
              <p className="small-note">
                Trabajo: <Link href={jobPath(job)} className="text-button">{job.number} · {job.name}</Link>
              </p>
            )}
          </div>
          <dl className="det-facts">
            <div><dt>Fecha</dt><dd>{fmt(quote.date)}</dd></div>
            <div><dt>Válido hasta</dt><dd>{fmt(quote.validUntil ?? undefined)}</dd></div>
            <div><dt>Total</dt><dd>{eur(quoteTotal(quote).toString())}</dd></div>
          </dl>
        </div>
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr><th>Descripción</th><th className="num">Unidades</th><th className="num">Precio sin IVA</th><th className="num">Dto.</th><th className="num">Base</th></tr>
            </thead>
            <tbody>
              {(quote.lines ?? []).map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: "10px 6px" }}>{l.description}</td>
                  <td className="num">{Number(l.quantity)} {l.unit}</td>
                  <td className="num">{eur(l.price)}</td>
                  <td className="num">{Number(l.discount) ? `${Number(l.discount)} %` : ""}</td>
                  <td className="num"><strong>{eur(l.net)}</strong></td>
                </tr>
              ))}
              {!quote.lines?.length && <tr><td colSpan={5} className="inv-empty">{quote.name}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="inv-bottom">
          <div>
            {quote.notes && (
              <>
                <h2>Anotaciones</h2>
                <p style={{ whiteSpace: "pre-wrap" }}>{quote.notes}</p>
              </>
            )}
          </div>
          <dl className="inv-totals">
            <div><dt>Base imponible</dt><dd>{eur(quote.net)}</dd></div>
            <div><dt>Impuestos</dt><dd>{eur(quote.tax ?? 0)}</dd></div>
            <div className="grand"><dt>Total</dt><dd>{eur(quoteTotal(quote).toString())}</dd></div>
          </dl>
        </div>
      </section>
    </>
  );
}
