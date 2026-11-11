"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, ChevronRight, Eye, FileDown, Mail, Plus, Printer, Search, Trash2 } from "lucide-react";
import type { Sale } from "@/lib/workspace-types";
import { saleDue, saleStatus, saleTotal, type SaleStatus } from "@/lib/sales-view";

export const eur = (n: string | number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));
export const fmt = (d?: string) => (d ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" }).format(new Date(d)) : "—");
export const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

export const StatusPill = ({ status }: { status: SaleStatus }) => (
  <span className={`st-pill ${status === "Cobrada" ? "ok" : status === "Vencida" ? "bad" : "warn"}`}>{status}</span>
);

// Barra de acciones sobre una factura: se usa en la lista (sobre la seleccionada) y dentro de la factura.
export function InvoiceActions({ sale, onNew, onPayment, onDelete, open = true }: { sale?: Sale; onNew?: () => void; onPayment: (s: Sale) => void; onDelete?: (s: Sale) => void; open?: boolean }) {
  const router = useRouter();
  const off = !sale;
  const btn = (label: string, icon: React.ReactNode, onClick: () => void, disabled = off) => (
    <button type="button" className="inv-act" title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div className="inv-actions" role="toolbar" aria-label="Acciones de la factura">
      {onNew && btn("Nueva", <Plus size={18} />, onNew, false)}
      {open && btn("Ver", <Eye size={18} />, () => sale && router.push(`/facturas-venta/${sale.id}`))}
      {btn("PDF", <FileDown size={18} />, () => sale && (location.href = `/api/sales/${sale.id}/pdf`))}
      {btn("Imprimir", <Printer size={18} />, () => sale && window.open(`/api/sales/${sale.id}/pdf?inline=1`, "_blank"))}
      {btn("Enviar", <Mail size={18} />, () =>
        sale &&
        (location.href = `mailto:${sale.customerEmail ?? ""}?subject=${encodeURIComponent(`Factura ${sale.number}`)}&body=${encodeURIComponent(
          `Hola,\n\nTe envío la factura ${sale.number} por importe de ${eur(saleTotal(sale).toString())}.\nAdjunto el PDF.\n\nUn saludo.`,
        )}`),
      )}
      {btn("Cobro", <Banknote size={18} />, () => sale && onPayment(sale))}
      {onDelete && (
        <button type="button" className="ib danger inv-trash" title="Eliminar factura" aria-label="Eliminar factura" disabled={off} onClick={() => sale && onDelete(sale)}>
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
}

type Filter = "all" | "pending" | "overdue" | "paid";
const FILTERS: [Filter, string][] = [["all", "Todas"], ["pending", "Pendientes"], ["overdue", "Vencidas"], ["paid", "Cobradas"]];

// Listado de facturas de venta con filtros, selección y acciones (PDF, imprimir, enviar, cobro).
export default function InvoiceList({
  sales,
  preset = "all",
  title = "Facturas de venta",
  onNew,
  onPayment,
  onDelete,
}: {
  sales: Sale[];
  preset?: Filter;
  title?: string;
  onNew: () => void;
  onPayment: (s: Sale) => void;
  onDelete?: (s: Sale) => void;
}) {
  const router = useRouter();
  const today = todayIso();
  const [filter, setFilter] = useState<Filter>(preset),
    [q, setQ] = useState(""),
    [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...sales]
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
      .filter((s) => {
        const st = saleStatus(s, today);
        if (filter === "pending" && st === "Cobrada") return false;
        if (filter === "overdue" && st !== "Vencida") return false;
        if (filter === "paid" && st !== "Cobrada") return false;
        return !needle || [s.number, s.customerName, s.jobName, s.description].join(" ").toLowerCase().includes(needle);
      });
  }, [sales, filter, q, today]);
  const selected = sales.find((s) => s.id === sel);
  const totalShown = rows.reduce((a, s) => a.plus(saleTotal(s)), saleTotal({ net: "0", tax: "0", withholding: "0" }));

  return (
    <>
      <nav className="inv-crumbs" aria-label="Ruta">
        <Link href="/ventas">Ventas</Link>
        <ChevronRight size={14} />
        <span>{title}</span>
      </nav>
      <div className="list-head">
        <h1>{title}</h1>
        <InvoiceActions sale={selected} onNew={onNew} onPayment={onPayment} onDelete={onDelete} />
        <label className="list-search">
          <Search size={16} />
          <input type="search" placeholder="Buscar factura, cliente o trabajo" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="expense-filters">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{label}</button>
        ))}
        <small className="muted">{rows.length} facturas · {eur(totalShown.toString())}</small>
      </div>
      <div className="panel">
        {rows.length ? (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th />
                  <th>Número</th><th>Fecha</th><th>Cliente</th><th>Trabajo</th>
                  <th className="r">Base</th><th className="r">Impuestos</th><th className="r">Total</th><th className="r">Pendiente</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    className={`row-link${sel === s.id ? " sel" : ""}`}
                    onClick={() => setSel(sel === s.id ? null : s.id)}
                    onDoubleClick={() => router.push(`/facturas-venta/${s.id}`)}
                  >
                    <td><input type="checkbox" aria-label={`Seleccionar ${s.number}`} checked={sel === s.id} onChange={() => setSel(sel === s.id ? null : s.id)} onClick={(e) => e.stopPropagation()} /></td>
                    <td><Link href={`/facturas-venta/${s.id}`} className="job-link" onClick={(e) => e.stopPropagation()}>{s.number}</Link></td>
                    <td>{fmt(s.date)}</td>
                    <td>{s.customerName ?? "—"}</td>
                    <td>{s.jobName ?? "—"}</td>
                    <td className="r">{eur(s.net)}</td>
                    <td className="r">{eur(s.tax)}</td>
                    <td className="r"><strong>{eur(saleTotal(s).toString())}</strong></td>
                    <td className="r">{eur(saleDue(s).toString())}</td>
                    <td><StatusPill status={saleStatus(s, today)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>{sales.length ? "No hay facturas con ese filtro" : "Aún no hay facturas"}</h3>
            <p>{sales.length ? "Prueba con otro filtro o búsqueda." : "Crea la primera con el botón «Nueva»."}</p>
          </div>
        )}
      </div>
      <p className="small-note mt-3">Selecciona una factura para descargarla en PDF, imprimirla, enviarla o registrar un cobro. Doble clic para abrirla.</p>
    </>
  );
}
