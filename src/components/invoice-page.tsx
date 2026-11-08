"use client";
import { useState } from "react";
import Link from "next/link";
import { Boxes, ChevronRight, Clock, FileStack, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cents, dec, lineNet } from "@/lib/money";
import type { Customer, Job, Sale, State } from "@/lib/workspace-types";
import { newLine, type Line } from "./lines-editor";
import { MaterialPicker } from "./material-picker";
import { PersonPicker } from "./person-picker";

type InvLine = Line & { discount: string; tax: string };
const eur = (n: string | number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const inv = (p: Partial<InvLine> = {}): InvLine => ({ ...newLine(p), discount: "0", tax: "21", ...p });
const net = (l: InvLine) => {
  try {
    return l.quantity && l.price ? lineNet(l.quantity, l.price, l.discount || 0) : "0.00";
  } catch {
    return "0.00";
  }
};
async function post(url: string, body?: unknown) {
  const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json();
  if (!res.ok) throw Error(data.error ?? "No se pudo completar la operación.");
  return data;
}

// Factura de cliente a pantalla completa (estilo a3factura): cliente y datos arriba, líneas en tabla y totales abajo.
export default function InvoicePage({
  jobs,
  customers,
  jobId,
  sales,
  templates,
  refresh,
  onDone,
}: {
  jobs: Job[];
  customers: Customer[];
  jobId?: string;
  sales: Sale[];
  templates: State["templates"];
  refresh: () => Promise<void>;
  onDone: () => void;
}) {
  const year = new Date().getFullYear();
  const startJob = jobs.find((j) => j.id === jobId);
  const [customerId, setCustomerId] = useState(startJob?.customer.id ?? ""),
    [job, setJob] = useState(startJob?.id ?? ""),
    [serie, setSerie] = useState(`F-${year}`),
    [numero, setNumero] = useState(() => String(sales.filter((s) => s.date.startsWith(String(year))).length + 1).padStart(3, "0")),
    [date, setDate] = useState(today()),
    [dueAt, setDueAt] = useState(""),
    [notes, setNotes] = useState(""),
    [ret, setRet] = useState("0"),
    [collected, setCollected] = useState("0"),
    [lines, setLines] = useState<InvLine[]>([]),
    [picker, setPicker] = useState(false),
    [tplName, setTplName] = useState<string | null>(null),
    [info, setInfo] = useState(""),
    [busy, setBusy] = useState(false),
    [loadingMat, setLoadingMat] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  const customerJobs = jobs.filter((j) => j.customer.id === customerId);
  const current = jobs.find((j) => j.id === job);
  const base = cents(lines.reduce((a, l) => a.plus(net(l)), dec(0))),
    tax = cents(lines.reduce((a, l) => a.plus(dec(net(l)).mul(l.tax || 0).div(100)), dec(0))),
    withholding = cents(dec(base).mul(ret || 0).div(100)),
    total = cents(dec(base).plus(tax).minus(withholding));
  const set = (k: string, patch: Partial<InvLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    setJob(jobs.find((j) => j.customer.id === id)?.id ?? "");
  };
  const loadMaterials = async () => {
    setLoadingMat(true);
    setError("");
    try {
      const { items } = await post(`/api/jobs/${job}/materials`);
      if (!items.length) setInfo("No hay material del trabajo pendiente de facturar.");
      else {
        setInfo("");
        setLines((cur) => {
          const next = [...cur];
          for (const it of items as Omit<Line, "key">[]) {
            const at = next.findIndex((l) => l.lotId === it.lotId);
            if (at >= 0) next[at] = { ...next[at], quantity: it.quantity };
            else next.push(inv(it));
          }
          return next;
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMat(false);
    }
  };
  const quoteLines = (id: string) => {
    const q = current?.quotes.find((x) => x.id === id);
    const factor = dec(1).minus(dec(q?.inputs?.margin || 0).div(100));
    // El presupuesto guarda el coste; el precio de venta es coste / (1 − margen).
    return (q?.inputs?.lines ?? []).map((l) => inv({ ...l, price: dec(l.price).div(factor.gt(0) ? factor : 1).toDecimalPlaces(4).toString() }));
  };
  const number = `${serie.trim()}-${numero.trim()}`;
  const valid =
    job && serie.trim() && numero.trim() && lines.length > 0 && Number(base) > 0 &&
    lines.every((l) => l.description.trim() && Number(l.quantity) > 0 && l.price !== "");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await post("/api/operations/sale", {
        jobId: job,
        number,
        description: lines.map((l) => l.description).join("; ").slice(0, 200),
        date,
        dueAt: dueAt || undefined,
        net: base,
        tax,
        withholding,
        collected,
        notes,
        requestKey: key,
        lines: lines.map(({ lotId, description, unit, quantity, price, discount }) => ({ lotId, description, unit, quantity, price, discount: discount || "0" })),
      });
      await refresh();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const quotesWithLines = current?.quotes.filter((q) => q.inputs?.lines?.length) ?? [];

  return (
    <div className="inv-page">
      <nav className="inv-crumbs" aria-label="Ruta">
        <Link href="/facturas">Facturas</Link>
        <ChevronRight size={14} />
        <span>Nueva factura</span>
        <div className="inv-top">
          <span className="inv-pill"><Clock size={14} /> Pendiente de cobro</span>
          <span className="inv-pill">Total: <b>{eur(total)}</b></span>
          <Button variant="outline" onClick={onDone} disabled={busy}>Cancelar</Button>
          <Button loading={busy} disabled={!valid} onClick={submit}>
            {!busy && <Save size={16} />} {busy ? "Guardando…" : "Guardar factura"}
          </Button>
        </div>
      </nav>

      <section className="inv-card">
        <div className="inv-head">
          <div className="inv-customer">
            <small>Cliente</small>
            <PersonPicker
              kind="customer"
              people={customers.map((c) => ({ id: c.id, name: c.name, sub: [c.taxId, c.phone, c.email, c.address] }))}
              value={customerId}
              onChange={pickCustomer}
              onCreate={async (d) => {
                const r = await post("/api/operations/customer", Object.fromEntries(Object.entries(d).filter(([, v]) => v)));
                await refresh();
                return r;
              }}
            />
          </div>
          <div className="inv-fields">
            <label>Fecha factura<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Trabajo
              <select value={job} onChange={(e) => setJob(e.target.value)} disabled={!customerJobs.length}>
                {!customerJobs.length && <option value="">{customerId ? "Sin trabajos" : "Elige cliente"}</option>}
                {customerJobs.map((j) => <option key={j.id} value={j.id}>{j.number} · {j.name}</option>)}
              </select>
            </label>
            <label>Serie<input value={serie} onChange={(e) => setSerie(e.target.value)} /></label>
            <label>Vencimiento<input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
            <label>Retención IRPF (%)<input type="number" min="0" max="100" step="any" value={ret} onChange={(e) => setRet(e.target.value)} /></label>
            <label>Número<input value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
          </div>
        </div>

        <div className="inv-tools">
          <Button type="button" size="sm" variant="outline" loading={loadingMat} disabled={!job} onClick={loadMaterials}>
            <Boxes size={15} /> Material del trabajo
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!job} onClick={() => setPicker(true)}>Añadir del almacén</Button>
          {templates.length > 0 && (
            <select className="lines-select" aria-label="Aplicar plantilla" value="" onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) setLines((ls) => [...ls, ...t.lines.map((l) => inv(l))]);
            }}>
              <option value="">Plantilla…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {quotesWithLines.length > 0 && (
            <select className="lines-select" aria-label="Usar presupuesto" value="" onChange={(e) => e.target.value && setLines((ls) => [...ls, ...quoteLines(e.target.value)])}>
              <option value="">Desde presupuesto…</option>
              {quotesWithLines.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          )}
          {info && <span className="small-note">{info}</span>}
        </div>

        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Descripción</th><th className="num">Unidades</th><th className="num">Precio sin IVA</th>
                <th className="num">Dto. %</th><th className="num">Impto. %</th><th className="num">Base</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td><input aria-label="Descripción" placeholder="Descripción" value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} /></td>
                  <td className="num"><input aria-label="Unidades" type="number" min="0" step="any" value={l.quantity} onChange={(e) => set(l.key, { quantity: e.target.value })} /></td>
                  <td className="num"><input aria-label="Precio sin IVA" type="number" min="0" step="any" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} /></td>
                  <td className="num"><input aria-label="Descuento" type="number" min="0" max="100" step="any" value={l.discount} onChange={(e) => set(l.key, { discount: e.target.value })} /></td>
                  <td className="num">
                    <select aria-label="Impuesto" value={l.tax} onChange={(e) => set(l.key, { tax: e.target.value })}>
                      {["21", "10", "4", "0"].map((x) => <option key={x} value={x}>{x} %</option>)}
                    </select>
                  </td>
                  <td className="num"><strong>{eur(net(l))}</strong></td>
                  <td><button type="button" aria-label="Borrar línea" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 size={16} /></button></td>
                </tr>
              ))}
              {!lines.length && (
                <tr><td colSpan={7} className="inv-empty">Aún no hay líneas. Pulsa «Nueva línea» o usa los botones de arriba.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="inv-line-actions">
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, inv()])}><Plus size={14} /> Nueva línea</Button>
          {lines.length > 0 && (tplName === null ? (
            <button type="button" className="text-button" onClick={() => setTplName("")}><FileStack size={14} className="inline" /> Guardar como plantilla</button>
          ) : (
            <>
              <input autoFocus placeholder="Nombre de la plantilla" value={tplName} onChange={(e) => setTplName(e.target.value)} style={{ margin: 0, maxWidth: 240 }} />
              <Button type="button" size="sm" disabled={!tplName.trim()} onClick={async () => {
                try {
                  await post("/api/operations/template-save", { name: tplName.trim(), lines: lines.map(({ description, unit, quantity, price }) => ({ description, unit, quantity, price })) });
                  setTplName(null);
                  setInfo("Plantilla guardada.");
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}>Guardar</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setTplName(null)}>Cancelar</Button>
            </>
          ))}
        </div>

        <div className="inv-bottom">
          <div>
            <h2>Anotaciones</h2>
            <textarea aria-label="Anotaciones" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <dl className="inv-totals">
            <div><dt>Base imponible</dt><dd>{eur(base)}</dd></div>
            <div><dt>Impuestos</dt><dd>{eur(tax)}</dd></div>
            {Number(withholding) > 0 && <div><dt>Retención {ret} %</dt><dd>−{eur(withholding)}</dd></div>}
            <div className="grand"><dt>Total</dt><dd>{eur(total)}</dd></div>
            <div className="paid"><dt>Ya cobrado (€)</dt><dd><input type="number" min="0" step="any" value={collected} onChange={(e) => setCollected(e.target.value)} /></dd></div>
          </dl>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {picker && (
        <MaterialPicker
          jobs={jobs}
          jobId={job}
          close={() => setPicker(false)}
          onManual={() => {
            setPicker(false);
            setLines((ls) => [...ls, inv()]);
          }}
          saved={async () => {
            setPicker(false);
            await refresh();
            await loadMaterials();
          }}
        />
      )}
    </div>
  );
}
