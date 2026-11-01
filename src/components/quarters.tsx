"use client";
import { useState } from "react";
import useSWR from "swr";
import { Download, FileArchive, TriangleAlert } from "lucide-react";
import { Button } from "./ui/button";
import type { QuarterReport } from "@/lib/quarters";

const euro = (v: string) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    Number(v),
  );
const fmt = (d: string) => d.split("-").reverse().join("/");
// Por defecto, el último trimestre terminado: es el que se declara.
function previous() {
  const n = new Date(),
    q = Math.floor(n.getMonth() / 3);
  return q === 0
    ? { year: n.getFullYear() - 1, quarter: 4 }
    : { year: n.getFullYear(), quarter: q };
}
function Card({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{euro(value)}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
export default function Quarters() {
  const [downloadError, setDownloadError] = useState(""),
    [preparing, setPreparing] = useState(false);
  const [period, setPeriod] = useState(previous);
  const key = `year=${period.year}&quarter=${period.quarter}`;
  const { data, error } = useSWR<QuarterReport>(
    `/api/quarters?${key}`,
    async (url: string) => {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    },
  );
  const thisYear = new Date().getFullYear();
  const t = data?.totals;
  const vat = Number(t?.vatBalance ?? 0);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">CIERRE TRIMESTRAL</div>
          <h1>Trimestres</h1>
          <p className="subtitle">
            Ventas, compras e IVA del periodo, con las facturas listas para la
            asesoría.
          </p>
        </div>
      </div>
      <div className="inventory-toolbar">
        <select
          aria-label="Año"
          value={period.year}
          onChange={(e) =>
            setPeriod({ ...period, year: Number(e.target.value) })
          }
        >
          {[
            thisYear + 1,
            thisYear,
            thisYear - 1,
            thisYear - 2,
            thisYear - 3,
          ].map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select
          aria-label="Trimestre"
          value={period.quarter}
          onChange={(e) =>
            setPeriod({ ...period, quarter: Number(e.target.value) })
          }
        >
          <option value={1}>1.º trimestre (ene–mar)</option>
          <option value={2}>2.º trimestre (abr–jun)</option>
          <option value={3}>3.º trimestre (jul–sep)</option>
          <option value={4}>4.º trimestre (oct–dic)</option>
        </select>
        <Button
          disabled={!data || preparing}
          onClick={async () => {
            setPreparing(true);
            setDownloadError("");
            try {
              const r = await fetch(`/api/quarters?${key}&format=check`);
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              window.location.assign(`/api/quarters?${key}&format=zip`);
            } catch (e) {
              setDownloadError((e as Error).message);
            } finally {
              setPreparing(false);
            }
          }}
        >
          <FileArchive size={16} />
          {preparing ? "Comprobando archivos…" : "Descargar paquete (ZIP)"}
        </Button>
        <Button asChild variant="outline" disabled={!data}>
          <a
            href={`/api/quarters?${key}&format=csv`}
            download
            aria-disabled={!data}
            onClick={(e) => {
              if (!data) e.preventDefault();
            }}
          >
            <Download size={16} />
            Resumen CSV
          </a>
        </Button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}
      {downloadError && (
        <p className="error" role="alert">
          {downloadError}
        </p>
      )}
      {!data && !error && (
        <p className="small-note" role="status">
          Calculando el trimestre…
        </p>
      )}
      {data && t && (
        <>
          {data.warnings.map((w) => (
            <p className="inventory-notice" key={w} role="status">
              <TriangleAlert size={16} />
              {w}
            </p>
          ))}
          <div className="stats">
            <Card
              label="IVA repercutido"
              value={t.outputTax}
              note={`Sobre ventas de ${euro(t.salesNet)}`}
            />
            <Card
              label="IVA soportado"
              value={t.inputTax}
              note={`Compras ${euro(t.purchasesNet)} · gastos ${euro(t.overheadNet)}`}
            />
            <div className="stat highlight">
              <div className="stat-label">
                {vat >= 0
                  ? "IVA a ingresar (aprox.)"
                  : "IVA a compensar (aprox.)"}
              </div>
              <div className="stat-value">{euro(String(Math.abs(vat)))}</div>
              <div className="stat-note">Repercutido menos soportado</div>
            </div>
            <Card
              label="Resultado aproximado"
              value={t.approxResult}
              note={`Tras ${euro(t.labor)} de mano de obra propia`}
            />
          </div>
          <p className="small-note pb-4">
            Retenciones practicadas por clientes: {euro(t.withheld)} · Cobrado:{" "}
            {euro(t.collected)} · Pendiente de cobro:{" "}
            {euro(t.pendingCollection)}. Cifras aproximadas a partir de lo
            confirmado en la aplicación; no sustituyen la liquidación de tu
            asesoría.
          </p>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Facturas recibidas ({data.received.length})</h2>
                <p>
                  Facturas de proveedores confirmadas con fecha del trimestre.
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Proveedor</th>
                    <th>Nº</th>
                    <th>Base</th>
                    <th>IVA</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.received.map((d) => (
                    <tr key={d.id}>
                      <td>{fmt(d.date)}</td>
                      <td>{d.supplier}</td>
                      <td>{d.number}</td>
                      <td>{euro(d.net)}</td>
                      <td>{euro(d.tax)}</td>
                      <td>{euro(d.total)}</td>
                    </tr>
                  ))}
                  {!data.received.length && (
                    <tr>
                      <td colSpan={6}>
                        Sin facturas recibidas en este trimestre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Facturas emitidas ({data.issued.length})</h2>
                <p>Ventas registradas con fecha del trimestre.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Nº</th>
                    <th>Base</th>
                    <th>IVA</th>
                    <th>Retención</th>
                    <th>Cobrado</th>
                    <th>Archivo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.issued.map((s) => (
                    <tr key={s.id}>
                      <td>{fmt(s.date)}</td>
                      <td>{s.customer}</td>
                      <td>{s.number}</td>
                      <td>{euro(s.net)}</td>
                      <td>{euro(s.tax)}</td>
                      <td>{euro(s.withholding)}</td>
                      <td>{euro(s.collected)}</td>
                      <td>
                        {s.documentId ? (
                          <span className="pill green">Incluido</span>
                        ) : (
                          <span className="pill orange">Falta</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data.issued.length && (
                    <tr>
                      <td colSpan={8}>
                        Sin facturas emitidas en este trimestre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
