"use client";
import { useState } from "react";
import useSWR from "swr";
import { Dialog } from "@/components/ui/dialog";

type Sum = { calls: number; promptTokens: number; completionTokens: number; costUsd: number };
type Row = { id: string; createdAt: string; user: string; kind: string; transcript: string; result: string; model: string; promptTokens: number; completionTokens: number; costUsd: number; ms: number; ok: boolean; error: string };
type Data = { total: Sum; month: Sum; byKind: Record<string, number>; rows: Row[] };
const KIND: Record<string, string> = { OPENAI: "OpenAI", RULES: "Reglas (0 tokens)", STT: "Transcripción local", REPLY: "Respuesta del asistente", CONFIRM: "Acción confirmada" };
const usd = (n: number) => `${n.toFixed(n < 0.01 ? 5 : 3)} US$`;
const LAST = 10;
const fetcher = (u: string) => fetch(u).then((r) => r.json());

// Gasto de IA del asistente de voz y registro de cada llamada (para el responsable).
export default function VoiceUsage() {
  const [all, setAll] = useState(false);
  const { data, error } = useSWR<Data>("/api/voice-usage", fetcher, { refreshInterval: 30000 });
  if (error || !data || "error" in data) return null;
  const card = (title: string, s: Sum) => (
    <div className="kpi">
      <span>{title}</span>
      <strong>{usd(s.costUsd)}</strong>
      <small>{s.calls} llamadas · {(s.promptTokens + s.completionTokens).toLocaleString("es-ES")} tokens ({s.promptTokens.toLocaleString("es-ES")} entrada + {s.completionTokens.toLocaleString("es-ES")} salida)</small>
    </div>
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Asistente de voz: gasto de IA y trazabilidad</h2>
      </div>
      <div className="kpi-grid">
        {card("Este mes (OpenAI)", data.month)}
        {card("Total acumulado (OpenAI)", data.total)}
        <div className="kpi">
          <span>Órdenes resueltas</span>
          <strong>{data.byKind.RULES ?? 0} sin IA</strong>
          <small>{data.byKind.OPENAI ?? 0} con OpenAI · {data.byKind.STT ?? 0} audios transcritos en local · {data.byKind.CONFIRM ?? 0} acciones confirmadas</small>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Lo que se dijo</th><th>Resultado</th><th>Tokens</th><th>Coste</th><th>Tiempo</th></tr>
          </thead>
          <tbody>
            {data.rows.slice(0, LAST).map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString("es-ES")}</td>
                <td>{r.user}</td>
                <td>{KIND[r.kind] ?? r.kind}{r.model ? ` · ${r.model}` : ""}</td>
                <td>{r.transcript}</td>
                <td>{r.ok ? r.result : <span className="error">{r.error || "Error"}</span>}</td>
                <td>{r.kind === "OPENAI" ? `${r.promptTokens} + ${r.completionTokens}` : "—"}</td>
                <td>{r.kind === "OPENAI" ? usd(r.costUsd) : "0"}</td>
                <td>{r.ms} ms</td>
              </tr>
            ))}
            {!data.rows.length && <tr><td colSpan={8}>Aún no hay actividad del asistente.</td></tr>}
          </tbody>
        </table>
      </div>
      {data.rows.length > LAST && <button className="text-button" onClick={() => setAll(true)}>Ver más ({data.rows.length} registros)</button>}
      <Dialog open={all} onOpenChange={setAll} title="Registros del asistente de voz" wide>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Lo que se dijo</th><th>Resultado</th><th>Coste</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString("es-ES")}</td>
                  <td>{r.user}</td>
                  <td>{KIND[r.kind] ?? r.kind}</td>
                  <td>{r.transcript}</td>
                  <td>{r.ok ? r.result : <span className="error">{r.error || "Error"}</span>}</td>
                  <td>{r.kind === "OPENAI" ? usd(r.costUsd) : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>
      <p className="subtitle">El coste es una estimación con las tarifas de gpt-4o-mini; la factura real está en tu panel de OpenAI. Las llamadas anteriores a hoy no se registraron.</p>
    </section>
  );
}
