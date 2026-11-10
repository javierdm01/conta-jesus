"use client";
import { jobPath } from "@/lib/job-path";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/workspace-types";
import { eur } from "./invoice-list";

// Presupuestos de todos los trabajos, con su estado y el paso siguiente (aprobar → facturar).
export default function QuotesList({ jobs, onNew, refresh }: { jobs: Job[]; onNew: () => void; refresh: () => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const rows = useMemo(() => jobs.flatMap((j) => j.quotes.map((q) => ({ q, j }))), [jobs]);
  const approve = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/operations/approveQuote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: id }) });
      const body = await res.json();
      if (!res.ok) throw Error(body.error ?? "No se pudo aprobar.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <nav className="inv-crumbs" aria-label="Ruta">
        <Link href="/ventas">Ventas</Link>
        <ChevronRight size={14} />
        <span>Presupuestos</span>
      </nav>
      <div className="list-head">
        <h1>Presupuestos</h1>
        <div className="inv-actions">
          <button type="button" className="inv-act" onClick={onNew}><Plus size={18} /><span>Nuevo</span></button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="panel">
        {rows.length ? (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr><th>Presupuesto</th><th>Trabajo</th><th>Cliente</th><th className="r">Coste</th><th className="r">Precio</th><th className="r">Horas</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {rows.map(({ q, j }) => (
                  <tr key={q.id}>
                    <td><strong>{q.name}</strong></td>
                    <td><Link href={jobPath(j)} className="job-link">{j.number} · {j.name}</Link></td>
                    <td>{j.customer.name}</td>
                    <td className="r">{eur(q.cost)}</td>
                    <td className="r"><strong>{eur(q.net)}</strong></td>
                    <td className="r">{Number(q.plannedHours)}</td>
                    <td><span className={`st-pill ${q.approved ? "ok" : "warn"}`}>{q.approved ? "Aprobado" : "Pendiente"}</span></td>
                    <td className="r">
                      {q.approved ? (
                        <Button size="sm" variant="outline" onClick={() => router.push(`/nueva-factura/${j.id}`)}><FileText size={14} /> Facturar</Button>
                      ) : (
                        <Button size="sm" loading={busy === q.id} onClick={() => approve(q.id)}>{busy !== q.id && <Check size={14} />} Aprobar</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>Aún no hay presupuestos</h3>
            <p>Crea el primero con el botón «Nuevo»: puedes usar tu catálogo de materiales.</p>
          </div>
        )}
      </div>
    </>
  );
}
