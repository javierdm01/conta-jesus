"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight } from "lucide-react";
import type { buildAccounts } from "@/lib/supplier-accounts";

type Detail = ReturnType<typeof buildAccounts> & { supplier: { id: string; name: string; taxId: string } };
type Ranking = { years: number[]; suppliers: { id: string; name: string; invoiced: number; credits: number; net: number; invoices: number }[] };
const eur = (n: number | null) => (n == null ? "sin valorar" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n));
const fmt = (d: string) => d.split("-").reverse().join("/");
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b;
};

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <span>{note}</span>}
    </div>
  );
}

// Cuánto se le ha comprado a un proveedor: facturas, abonos, neto, albaranes pendientes, artículos y subidas de precio.
export default function SupplierAccounts({ supplierId }: { supplierId?: string }) {
  const router = useRouter();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const ranking = useSWR<Ranking>(`/api/suppliers/accounts?year=${year}`, fetcher);
  const detail = useSWR<Detail>(supplierId ? `/api/suppliers/accounts?supplierId=${supplierId}&year=${year}` : null, fetcher);
  const years = [...new Set([new Date().getFullYear(), ...(ranking.data?.years ?? [])])].sort((a, b) => b - a);
  const d = detail.data;

  return (
    <>
      <nav className="inv-crumbs" aria-label="Ruta">
        <Link href="/proveedores">Proveedores</Link>
        <ChevronRight size={14} />
        {supplierId ? <Link href="/cuentas">Cuentas</Link> : <span>Cuentas</span>}
        {d && (
          <>
            <ChevronRight size={14} />
            <span>{d.supplier.name}</span>
          </>
        )}
      </nav>
      <div className="list-head">
        <h1>{d ? `Cuentas de ${d.supplier.name}` : "Cuentas de proveedores"}</h1>
        <label className="list-search" style={{ minWidth: 0 }}>
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año" style={{ margin: 0, border: 0, minWidth: 110 }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
            <option value="all">Todos los años</option>
          </select>
        </label>
        {ranking.data && supplierId && (
          <select value={supplierId} onChange={(e) => router.push(`/cuentas/${e.target.value}`)} aria-label="Proveedor" style={{ width: "auto", margin: 0 }}>
            {ranking.data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {!ranking.data.suppliers.some((s) => s.id === supplierId) && d && <option value={supplierId}>{d.supplier.name}</option>}
          </select>
        )}
      </div>

      {!supplierId &&
        (ranking.data ? (
          ranking.data.suppliers.length ? (
            <div className="panel">
              <div className="table-wrap">
                <table className="list-table">
                  <thead>
                    <tr><th>Proveedor</th><th className="r">Facturas</th><th className="r">Facturado (base)</th><th className="r">Abonos</th><th className="r">Compras netas</th></tr>
                  </thead>
                  <tbody>
                    {ranking.data.suppliers.map((s) => (
                      <tr key={s.id} className="row-link" onClick={() => router.push(`/cuentas/${s.id}`)}>
                        <td><Link href={`/cuentas/${s.id}`} className="job-link">{s.name}</Link></td>
                        <td className="r">{s.invoices}</td>
                        <td className="r">{eur(s.invoiced)}</td>
                        <td className="r">{s.credits ? `−${eur(s.credits)}` : "—"}</td>
                        <td className="r"><strong>{eur(s.net)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty"><h3>Aún no hay compras confirmadas</h3><p>Sube y confirma facturas y albaranes de un proveedor para ver sus cuentas.</p></div>
          )
        ) : (
          <div className="skeleton" style={{ height: 220, borderRadius: 16 }} role="status" aria-label="Cargando" />
        ))}

      {supplierId && !d && <div className="skeleton" style={{ height: 320, borderRadius: 16 }} role="status" aria-label="Cargando" />}
      {d && (
        <>
          <div className="kpi-grid">
            <Kpi label="Facturado (base)" value={eur(d.totals.invoicedNet)} note={`${d.totals.invoiceCount} facturas · IVA ${eur(d.totals.invoicedTax)}`} />
            <Kpi label="Abonos" value={d.totals.creditNet ? `−${eur(d.totals.creditNet)}` : eur(0)} note={`${d.totals.creditCount} ${d.totals.creditCount === 1 ? "abono" : "abonos"} · ${d.totals.creditPct} % de lo facturado`} tone={d.totals.creditNet ? "warn" : ""} />
            <Kpi label="Compras netas" value={eur(d.totals.netPurchases)} note={`Con IVA: ${eur(d.totals.netTotal)}`} tone="hero" />
            <Kpi label="Albaranes sin facturar" value={String(d.pending.count)} note={d.pending.count ? `${eur(d.pending.net)}${d.pending.unvalued ? ` + ${d.pending.unvalued} sin valorar` : ""}` : "Todo facturado"} tone={d.pending.count ? "warn" : ""} />
            <Kpi label="Factura media" value={eur(d.totals.avgInvoice)} note={d.totals.biggest ? `Mayor: ${d.totals.biggest.number} · ${eur(d.totals.biggest.net)}` : ""} />
            <Kpi label="Albaranes facturados" value={String(d.totals.invoicedDeliveries + d.totals.deliveryCount)} note="Citados en las facturas y albaranes del periodo" />
          </div>

          <section className="hw-card" style={{ marginBottom: 18 }}>
            <header><h3>Compras por mes (base)</h3><span>{year === "all" ? "Todos los años" : year}</span></header>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.months.map((m) => ({ mes: MONTHS[m.month - 1], Facturado: m.invoiced, Abonos: m.credits }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#eef2f2" vertical={false} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={70} tickFormatter={(v) => eur(Number(v)).replace(",00", "")} />
                  <Tooltip formatter={(v) => eur(Number(v))} />
                  <Legend iconType="circle" />
                  <Bar dataKey="Facturado" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Abonos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {year === "all" && <p className="small-note">Con «Todos los años» los meses suman todos los años.</p>}
          </section>

          <div className="acct-cols">
            <section className="panel">
              <h2 className="acct-h">Facturas ({d.invoices.length})</h2>
              <div className="table-wrap">
                <table className="list-table">
                  <thead><tr><th>Número</th><th>Fecha</th><th>Albaranes</th><th className="r">Base</th><th className="r">Total</th></tr></thead>
                  <tbody>
                    {d.invoices.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.number}</strong></td>
                        <td>{fmt(r.date)}</td>
                        <td style={{ whiteSpace: "normal" }}>{r.linked.length ? r.linked.join(", ") : <span className="muted">—</span>}</td>
                        <td className="r">{eur(r.net)}</td>
                        <td className="r">{eur(r.total)}</td>
                      </tr>
                    ))}
                    {!d.invoices.length && <tr><td colSpan={5} className="inv-empty">Sin facturas en este periodo.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <h2 className="acct-h">Abonos ({d.credits.length})</h2>
              <div className="table-wrap">
                <table className="list-table">
                  <thead><tr><th>Número</th><th>Fecha</th><th>Corrige</th><th className="r">Base</th><th className="r">Total</th></tr></thead>
                  <tbody>
                    {d.credits.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.number}</strong></td>
                        <td>{fmt(r.date)}</td>
                        <td style={{ whiteSpace: "normal" }}>{r.linked.length ? r.linked.join(", ") : <span className="muted">Sin asociar</span>}</td>
                        <td className="r">−{eur(r.net)}</td>
                        <td className="r">−{eur(r.total)}</td>
                      </tr>
                    ))}
                    {!d.credits.length && <tr><td colSpan={5} className="inv-empty">Sin abonos en este periodo.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {d.pendingDeliveries.length > 0 && (
            <section className="panel">
              <h2 className="acct-h">Albaranes pendientes de factura ({d.pendingDeliveries.length})</h2>
              <div className="table-wrap">
                <table className="list-table">
                  <thead><tr><th>Albarán</th><th>Fecha</th><th className="r">Importe</th></tr></thead>
                  <tbody>
                    {d.pendingDeliveries.map((r) => (
                      <tr key={r.id}><td><strong>{r.number}</strong></td><td>{fmt(r.date)}</td><td className="r">{eur(r.net)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="acct-cols">
            <section className="panel">
              <h2 className="acct-h">Lo que más compras</h2>
              <div className="table-wrap">
                <table className="list-table">
                  <thead><tr><th>Artículo</th><th className="r">Uds.</th><th className="r">Precio medio</th><th className="r">Importe</th></tr></thead>
                  <tbody>
                    {d.articles.map((a, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "normal" }}>{a.description}{a.reference && <small className="muted"> · {a.reference}</small>}</td>
                        <td className="r">{a.quantity} {a.unit}</td>
                        <td className="r">{eur(a.avgPrice)}</td>
                        <td className="r"><strong>{eur(a.net)}</strong></td>
                      </tr>
                    ))}
                    {!d.articles.length && <tr><td colSpan={4} className="inv-empty">Sin líneas de artículos en las facturas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <h2 className="acct-h">Cambios de precio</h2>
              <div className="table-wrap">
                <table className="list-table">
                  <thead><tr><th>Artículo</th><th className="r">Antes</th><th className="r">Ahora</th><th className="r">Variación</th></tr></thead>
                  <tbody>
                    {d.priceChanges.map((c, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "normal" }}>{c.description}{c.reference && <small className="muted"> · {c.reference}</small>}</td>
                        <td className="r">{eur(c.from)}</td>
                        <td className="r">{eur(c.to)}</td>
                        <td className="r"><span className={`st-pill ${c.pct > 0 ? "bad" : "ok"}`}>{c.pct > 0 ? "+" : ""}{c.pct} %</span></td>
                      </tr>
                    ))}
                    {!d.priceChanges.length && <tr><td colSpan={4} className="inv-empty">Aún no hay artículos comprados dos veces para comparar.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
