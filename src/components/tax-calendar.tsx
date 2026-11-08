"use client";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { upcoming } from "@/lib/tax-calendar";

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
const when = (n: number) => (n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`);
const tone = (n: number) => (n <= 7 ? "urgent" : n <= 30 ? "soon" : "");

export default function TaxCalendar() {
  // Mediodía UTC: evita que la zona horaria cambie el día.
  const now = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })}T12:00:00Z`);
  const list = upcoming(now, 12);
  // La cuota mensual no es una presentación: se muestra aparte para no tapar los modelos.
  const filings = list.filter((d) => d.model !== "RETA");
  // Lo destacado es lo que afecta a casi todos los autónomos; 111/115/180/347 dependen de cada caso.
  const next = filings.find((d) => ["303", "130", "100"].includes(d.model)) ?? filings[0];
  const reta = list.find((d) => d.model === "RETA");
  const byMonth = new Map<string, typeof filings>();
  for (const d of filings) {
    const month = new Date(d.end).toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" });
    const key = `${month[0].toUpperCase()}${month.slice(1)} ${d.end.slice(0, 4)}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), d]);
  }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">CUÁNDO PRESENTAR</div>
          <h1 className="mt-2">Calendario fiscal</h1>
          <p className="subtitle">Los plazos de Hacienda para un autónomo, con los días que quedan.</p>
        </div>
      </div>
      {next && (
        <div className={`tax-next ${tone(next.daysLeft)}`}>
          <CalendarDays size={28} />
          <div>
            <small>Lo siguiente</small>
            <strong>Modelo {next.model} · {next.period}</strong>
            <span>
              Hasta el {fmt(next.end)} ({when(next.daysLeft)})
              {next.bankEnd && ` · si domicilias el pago, hasta el ${fmt(next.bankEnd)}`}
            </span>
          </div>
          {next.quarter && (
            <Link href="/trimestres" className="text-button">
              Preparar trimestre <ChevronRight size={14} className="inline" />
            </Link>
          )}
        </div>
      )}
      {reta && (
        <p className="small-note mb-4">
          Cuota de autónomos: se cobra el último día de cada mes. La próxima, el {fmt(reta.end)}.
        </p>
      )}
      {[...byMonth].map(([month, items]) => (
        <section className="tax-month" key={month}>
          <h2>{month}</h2>
          {items.map((d) => (
            <div className={`tax-item ${tone(d.daysLeft)}`} key={d.id}>
              <span className="tax-model">{d.model}</span>
              <div>
                <strong>{d.title}</strong>
                <small>{d.period} · {d.note}</small>
              </div>
              <div className="tax-when">
                <strong>{fmt(d.end)}</strong>
                <small>{when(d.daysLeft)}</small>
              </div>
            </div>
          ))}
        </section>
      ))}
      <p className="small-note mt-6">
        Fechas orientativas del calendario general de la AEAT. Si el último día cae en fin de semana, pasa al lunes; no se
        tienen en cuenta festivos. Confírmalas con tu asesoría: no todos los modelos te afectan.
      </p>
    </>
  );
}
