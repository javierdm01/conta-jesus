"use client";
import { jobPath } from "@/lib/job-path";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Eye, FileDown, FileText, Mail, Plus, Printer, Search } from "lucide-react";
import type { Job, Quote } from "@/lib/workspace-types";
import { dec } from "@/lib/money";
import { eur, fmt } from "./invoice-list";

export const quoteTotal = (q: Pick<Quote, "net" | "tax">) => dec(q.net).plus(q.tax ?? 0);
export const quoteLabel = (q: Quote) => q.number || q.name;
export const QuotePill = ({ approved }: { approved: boolean }) => (
  <span className={`st-pill ${approved ? "ok" : "warn"}`}>{approved ? "Aprobado" : "Pendiente"}</span>
);

async function approveQuote(id: string) {
  const res = await fetch("/api/operations/approveQuote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: id }) });
  const body = await res.json();
  if (!res.ok) throw Error(body.error ?? "No se pudo aprobar.");
}

// Barra de acciones sobre un presupuesto (misma que la de facturas): Ver, PDF, Imprimir, Enviar y Aprobar / Facturar.
export function QuoteActions({ quote, job, onNew, open = true, refresh, onError }: { quote?: Quote; job?: Job; onNew?: () => void; open?: boolean; refresh: () => Promise<void>; onError: (m: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const off = !quote;
  const btn = (label: string, icon: React.ReactNode, onClick: () => void, disabled = off) => (
    <button type="button" className="inv-act" title={label} aria-label={label} disabled={disabled || busy} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div className="inv-actions" role="toolbar" aria-label="Acciones del presupuesto">
      {onNew && btn("Nuevo", <Plus size={18} />, onNew, false)}
      {open && btn("Ver", <Eye size={18} />, () => quote && router.push(`/presupuestos/${quote.id}`))}
      {btn("PDF", <FileDown size={18} />, () => quote && (location.href = `/api/quotes/${quote.id}/pdf`))}
      {btn("Imprimir", <Printer size={18} />, () => quote && window.open(`/api/quotes/${quote.id}/pdf?inline=1`, "_blank"))}
      {btn("Enviar", <Mail size={18} />, () =>
        quote &&
        (location.href = `mailto:${job?.customer.email ?? ""}?subject=${encodeURIComponent(`Presupuesto ${quoteLabel(quote)}`)}&body=${encodeURIComponent(
          `Hola,\n\nTe envío el presupuesto ${quoteLabel(quote)} por importe de ${eur(quoteTotal(quote).toString())}.\nAdjunto el PDF.\n\nUn saludo.`,
        )}`),
      )}
      {quote?.approved
        ? btn("Facturar", <FileText size={18} />, () => job && quote && router.push(`/nueva-factura/${job.id}/${quote.id}`))
        : btn("Aprobar", <Check size={18} />, async () => {
            if (!quote) return;
            setBusy(true);
            try {
              await approveQuote(quote.id);
              await refresh();
            } catch (e) {
              onError((e as Error).message);
            } finally {
              setBusy(false);
            }
          })}
    </div>
  );
}

type Filter = "all" | "pending" | "approved";
const FILTERS: [Filter, string][] = [["all", "Todos"], ["pending", "Pendientes"], ["approved", "Aprobados"]];

// Presupuestos de todos los trabajos, con el mismo aspecto que el listado de facturas.
export default function QuotesList({ jobs, onNew, refresh }: { jobs: Job[]; onNew: () => void; refresh: () => Promise<void> }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all"),
    [q, setQ] = useState(""),
    [sel, setSel] = useState<string | null>(null),
    [error, setError] = useState("");
  const all = useMemo(() => jobs.flatMap((j) => j.quotes.map((x) => ({ x, j }))), [jobs]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...all]
      .sort((a, b) => (b.x.date ?? "").localeCompare(a.x.date ?? "") || quoteLabel(b.x).localeCompare(quoteLabel(a.x)))
      .filter(({ x, j }) => {
        if (filter === "pending" && x.approved) return false;
        if (filter === "approved" && !x.approved) return false;
        return !needle || [x.number, x.name, j.customer.name, j.name].join(" ").toLowerCase().includes(needle);
      });
  }, [all, filter, q]);
  const selected = all.find(({ x }) => x.id === sel);
  const totalShown = rows.reduce((a, { x }) => a.plus(quoteTotal(x)), dec(0));

  return (
    <>
      <nav className="inv-crumbs" aria-label="Ruta">
        <Link href="/ventas">Ventas</Link>
        <ChevronRight size={14} />
        <span>Presupuestos</span>
      </nav>
      <div className="list-head">
        <h1>Presupuestos</h1>
        <QuoteActions quote={selected?.x} job={selected?.j} onNew={onNew} refresh={refresh} onError={setError} />
        <label className="list-search">
          <Search size={16} />
          <input type="search" placeholder="Buscar presupuesto, cliente o trabajo" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="expense-filters">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{label}</button>
        ))}
        <small className="muted">{rows.length} presupuestos · {eur(totalShown.toString())}</small>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="panel">
        {rows.length ? (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th />
                  <th>Número</th><th>Fecha</th><th>Cliente</th><th>Trabajo</th>
                  <th className="r">Base</th><th className="r">Impuestos</th><th className="r">Total</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ x, j }) => (
                  <tr
                    key={x.id}
                    className={`row-link${sel === x.id ? " sel" : ""}`}
                    onClick={() => setSel(sel === x.id ? null : x.id)}
                    onDoubleClick={() => router.push(`/presupuestos/${x.id}`)}
                  >
                    <td><input type="checkbox" aria-label={`Seleccionar ${quoteLabel(x)}`} checked={sel === x.id} onChange={() => setSel(sel === x.id ? null : x.id)} onClick={(e) => e.stopPropagation()} /></td>
                    <td><Link href={`/presupuestos/${x.id}`} className="job-link" onClick={(e) => e.stopPropagation()}>{quoteLabel(x)}</Link></td>
                    <td>{fmt(x.date)}</td>
                    <td>{j.customer.name}</td>
                    <td><Link href={jobPath(j)} className="job-link" onClick={(e) => e.stopPropagation()}>{j.number} · {j.name}</Link></td>
                    <td className="r">{eur(x.net)}</td>
                    <td className="r">{eur(x.tax ?? 0)}</td>
                    <td className="r"><strong>{eur(quoteTotal(x).toString())}</strong></td>
                    <td><QuotePill approved={x.approved} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>{all.length ? "No hay presupuestos con ese filtro" : "Aún no hay presupuestos"}</h3>
            <p>{all.length ? "Prueba con otro filtro o búsqueda." : "Crea el primero con el botón «Nuevo»."}</p>
          </div>
        )}
      </div>
      <p className="small-note mt-3">Selecciona un presupuesto para descargarlo en PDF, imprimirlo, enviarlo, aprobarlo o facturarlo. Doble clic para abrirlo.</p>
    </>
  );
}
