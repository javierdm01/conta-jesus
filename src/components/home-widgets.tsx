"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Job, Sale } from "@/lib/workspace-types";
import { collections, monthlyNet, topN } from "@/lib/sales-view";

const eur = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const eur2 = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const initials = (s: string) => s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Card({ title, pill, className = "", children, to }: { title: string; pill?: string; className?: string; children: React.ReactNode; to?: string }) {
  return (
    <section className={`hw-card ${className}`}>
      <header>
        <h3>{to ? <Link href={to}>{title}</Link> : title}</h3>
        {pill && <span>{pill}</span>}
      </header>
      {children}
    </section>
  );
}

function Ranking({ rows }: { rows: { name: string; total: number }[] }) {
  if (!rows.length) return <p className="small-note">Aún no hay facturas.</p>;
  const max = rows[0].total || 1;
  return (
    <ul className="hw-rank">
      {rows.map((r) => (
        <li key={r.name}>
          <i>{initials(r.name)}</i>
          <div>
            <span>{r.name}</span>
            <b style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }} />
          </div>
          <strong>{eur2(r.total)}</strong>
        </li>
      ))}
    </ul>
  );
}

// Panel de inicio: ventas, reparto por cliente y concepto, cobros, calidad de la deuda y resumen financiero.
export default function HomeWidgets({
  sales,
  jobs,
  overheads,
}: {
  sales: Sale[];
  jobs: Job[];
  overheads: { amount: string }[];
}) {
  const now = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const year = Number(now.slice(0, 4));
  const [clientsYear] = useState(year);
  const chart = useMemo(() => {
    const a = monthlyNet(sales, year - 1),
      b = monthlyNet(sales, year);
    return MONTHS.map((m, i) => ({ m, [String(year - 1)]: a[i], [String(year)]: b[i] }));
  }, [sales, year]);
  const inYear = sales.filter((s) => s.date.startsWith(String(clientsYear)));
  const clients = topN(inYear, (s) => s.customerName ?? "Sin cliente", (s) => Number(s.net));
  const concepts = topN(
    inYear.flatMap((s) => s.lines ?? []),
    (l) => l.description,
    (l) => Number(l.net),
  );
  const col = collections(sales, now);
  const donut = [
    { name: "Vencidos", value: col.overdue.amount, color: "#ef4444" },
    { name: "Próximos 30 días", value: col.soon.amount, color: "#f59e0b" },
    { name: "Más adelante", value: col.later.amount, color: "#14b8a6" },
  ].filter((d) => d.value > 0);
  const income = sales.reduce((a, s) => a + Number(s.net), 0),
    spent = jobs.reduce((a, j) => a + Number(j.metrics?.direct ?? 0), 0) + overheads.reduce((a, o) => a + Number(o.amount), 0),
    both = Math.max(income, spent, 1);

  return (
    <div className="hw-grid">
      <Card title="Comparativa de ventas" pill="Anual" className="wide">
        <div style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#eef2f2" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={62} tickFormatter={(v) => eur(Number(v))} />
              <Tooltip formatter={(v) => eur2(Number(v))} />
              <Legend iconType="circle" />
              <Line type="monotone" dataKey={String(year - 1)} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey={String(year)} stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Facturación por clientes" pill={String(clientsYear)} to="/facturas-venta">
        <Ranking rows={clients} />
      </Card>
      <Card title="Facturación por conceptos" pill={String(clientsYear)}>
        <Ranking rows={concepts} />
      </Card>

      <Card title="Situación de cobros" pill="A día de hoy" to="/cobros">
        <div className="hw-tiles">
          <div><small>{col.pending.n} facturas pendientes</small><strong>{eur2(col.pending.amount)}</strong></div>
          <div className="bad"><small>{col.overdue.n} cobros vencidos</small><strong>{eur2(col.overdue.amount)}</strong></div>
          <div className="warn"><small>{col.soon.n} en los próximos 30 días</small><strong>{eur2(col.soon.amount)}</strong></div>
          <div className="ok"><small>{col.later.n} más adelante</small><strong>{eur2(col.later.amount)}</strong></div>
        </div>
      </Card>
      <Card title="Calidad de la deuda" pill="A día de hoy">
        {donut.length ? (
          <div className="hw-donut">
            <div style={{ width: 150, height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" innerRadius={42} outerRadius={70} stroke="none">
                    {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul>
              {donut.map((d) => (
                <li key={d.name}><i style={{ background: d.color }} />{d.name}<b>{eur2(d.value)}</b></li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="small-note">No hay cobros pendientes. Todo al día.</p>
        )}
      </Card>
      <Card title="Resumen financiero" pill="Acumulado" className="wide-2">
        <div className="hw-fin">
          <div>
            <small>Ingresos</small>
            <strong>{eur2(income)}</strong>
            <i className="up"><b style={{ width: `${(income / both) * 100}%` }} /></i>
          </div>
          <div>
            <small>Gastos</small>
            <strong>{eur2(spent)}</strong>
            <i className="down"><b style={{ width: `${(spent / both) * 100}%` }} /></i>
          </div>
          <div>
            <small>Resultado</small>
            <strong className={income - spent < 0 ? "neg" : ""}>{eur2(income - spent)}</strong>
          </div>
        </div>
      </Card>
    </div>
  );
}
