"use client";
import { useMemo, useState } from "react";
import type { Job } from "@/lib/workspace-types";

const h = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} h`;

// Dónde se fueron las horas: por técnico y por trabajo, filtrado por año y mes.
export default function Hours({ jobs, onAdd }: { jobs: Job[]; onAdd: () => void }) {
  const year = new Date().getFullYear();
  const [y, setY] = useState(year);
  const [month, setMonth] = useState(0); // 0 = todo el año
  const rows = useMemo(
    () =>
      jobs.flatMap((j) =>
        j.hours
          .filter((e) => {
            const d = new Date(e.date);
            return d.getUTCFullYear() === y && (!month || d.getUTCMonth() + 1 === month);
          })
          .map((e) => ({ job: j.name, worker: e.worker?.name ?? "Sin asignar", hours: Number(e.hours) })),
      ),
    [jobs, y, month],
  );
  const group = (key: "job" | "worker") => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + r.hours);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const total = rows.reduce((a, r) => a + r.hours, 0);
  const block = (title: string, list: [string, number][]) => (
    <section className="panel mb-4" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>{title}</h2>
      {list.length ? (
        list.map(([name, v]) => (
          <div className="expense-bar" key={name}>
            <span>{name}</span>
            <i><b style={{ width: `${(v / list[0][1]) * 100}%` }} /></i>
            <em>{h(v)}</em>
          </div>
        ))
      ) : (
        <p className="small-note">Sin horas en este periodo.</p>
      )}
    </section>
  );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">TIEMPO</div>
          <h1 className="mt-2">Horas</h1>
          <p className="subtitle">En qué trabajos y con qué técnicos se ha ido el tiempo.</p>
        </div>
        <button className="btn primary" onClick={onAdd}>Registrar horas</button>
      </div>
      <div className="expense-filters">
        <select value={y} onChange={(e) => setY(Number(e.target.value))} aria-label="Año">
          {[year, year - 1, year - 2].map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Mes">
          <option value={0}>Todo el año</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {new Date(2000, i, 1).toLocaleDateString("es-ES", { month: "long" })}
            </option>
          ))}
        </select>
        <strong>{h(total)}</strong>
      </div>
      {block("Por trabajo", group("job"))}
      {block("Por técnico", group("worker"))}
    </>
  );
}
