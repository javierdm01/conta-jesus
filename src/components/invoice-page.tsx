"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock, FileStack, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cents, dec, lineNet } from "@/lib/money";
import type { Customer, Job, Sale, State } from "@/lib/workspace-types";
import { newLine, type Line } from "./lines-editor";
import { CatalogPicker } from "./quote-builder";
import { PersonPicker } from "./person-picker";

type InvLine = Line & { discount: string; tax: string };
const eur = (n: string | number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
// shortcut: IVA por defecto en una variable de módulo (se fija al montar la página) para no pasarlo a cada línea; sirve mientras haya una sola factura abierta.
let defaultTax = "21";
const inv = (p: Partial<InvLine> = {}): InvLine => ({ ...newLine(p), discount: "0", tax: defaultTax, ...p });
const net = (l: InvLine) => {
  try {
    return l.quantity && l.price ? lineNet(l.quantity, l.price, l.discount || 0) : "0.00";
  } catch {
    return "0.00";
  }
};
const HOURS_DESC = "Mano de obra";
// Las horas ya cobradas no se guardan aparte: se reconocen en facturas anteriores como líneas manuales de mano de obra / instalación.
// shortcut: una línea «Instalación» a tanto alzado en «ud» cuenta como 1 h; sube a un vínculo real hora↔línea si molesta.
const billedHours = (j?: Job, skipSaleId?: string) =>
  (j?.sales ?? []).filter((s) => s.id !== skipSaleId).flatMap((s) => s.lines ?? [])
    .filter((l) => !l.lotId && !l.costId && !l.serviceId && (/^(h|hora|horas)$/i.test(l.unit.trim()) || /instalaci|mano de obra/i.test(l.description)))
    .reduce((a, l) => a.plus(l.quantity), dec(0));
/** Una línea con las horas facturables aún sin cobrar del trabajo. shortcut: precio sugerido = coste medio/hora + 30 % (como el material), editable. */
const hoursLine = (j?: Job, rate?: string, skipSaleId?: string): InvLine | null => {
  const h = (j?.hours ?? []).filter((x) => x.billable !== false).reduce((a, x) => a.plus(x.hours), dec(0)).minus(billedHours(j, skipSaleId));
  if (h.lte(0)) return null;
  const m = j?.metrics;
  const price = Number(rate) > 0 ? cents(rate!) : m && Number(m.hours) > 0 ? cents(dec(m.labor).div(m.hours).mul("1.30")) : "0.00";
  return inv({ description: HOURS_DESC, unit: "h", quantity: h.toString(), price });
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
  quoteId,
  saleId,
  sales,
  defaultRate,
  defaultTax: taxProp,
  mode = "invoice",
  templates,
  refresh,
  onDone,
  onCancel,
}: {
  jobs: Job[];
  customers: Customer[];
  jobId?: string;
  quoteId?: string;
  /** Si viene, se edita esa factura en vez de crear una. */
  saleId?: string;
  sales: Sale[];
  defaultRate?: string;
  defaultTax?: string;
  mode?: "invoice" | "quote";
  templates: State["templates"];
  refresh: () => Promise<void>;
  onDone: (id?: string) => void;
  onCancel: () => void;
}) {
  defaultTax = String(Number(taxProp ?? 21));
  const isQuote = mode === "quote";
  const year = new Date().getFullYear();
  const editing = sales.find((x) => x.id === saleId);
  const startJob = jobs.find((j) => j.id === (editing?.jobId ?? jobId));
  // shortcut: la línea no guarda su IVA; al editar se usa el tipo medio de la factura.
  const editTax = editing && Number(editing.net) > 0 ? String(Math.round((Number(editing.tax) / Number(editing.net)) * 100 * 100) / 100) : defaultTax;
  const editNo = editing?.number.match(/^(.*)-(\d+)$/);
  const [customerId, setCustomerId] = useState(startJob?.customer.id ?? ""),
    [job, setJob] = useState(startJob?.id ?? ""),
    [serie, setSerie] = useState(editing ? (editNo?.[1] ?? editing.number) : `${isQuote ? "P" : "F"}-${year}`),
    [numero, setNumero] = useState(() => editing ? (editNo?.[2] ?? "1") : String((isQuote ? jobs.flatMap((j) => j.quotes) : sales).filter((s) => (s.date ?? "").startsWith(String(year))).length + 1).padStart(3, "0")),
    [date, setDate] = useState(editing?.date.slice(0, 10) ?? today()),
    [dueAt, setDueAt] = useState(editing?.dueAt?.slice(0, 10) ?? ""),
    [notes, setNotes] = useState(editing?.notes ?? ""),
    [ret, setRet] = useState(editing && Number(editing.net) > 0 ? String(Math.round((Number(editing.withholding) / Number(editing.net)) * 100 * 100) / 100) : "0"),
    [collected, setCollected] = useState(editing?.collected ?? "0"),
    [lines, setLines] = useState<InvLine[]>(() =>
      (editing?.lines ?? []).map((l) => inv({ lotId: l.lotId ?? undefined, costId: l.costId ?? undefined, serviceId: l.serviceId ?? undefined, description: l.description, unit: l.unit, quantity: String(Number(l.quantity)), price: String(Number(l.price)), discount: String(Number(l.discount ?? 0)), tax: editTax })),
    ),
    [catalogPicker, setCatalogPicker] = useState(false),
    [tplName, setTplName] = useState<string | null>(null),
    [info, setInfo] = useState(""),
    [busy, setBusy] = useState(false),
    [loadingMat, setLoadingMat] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  const synced = useRef(false);
  const customerJobs = jobs.filter((j) => j.customer.id === customerId);
  const current = jobs.find((j) => j.id === job);
  const base = cents(lines.reduce((a, l) => a.plus(net(l)), dec(0))),
    tax = cents(lines.reduce((a, l) => a.plus(dec(net(l)).mul(l.tax || 0).div(100)), dec(0))),
    withholding = cents(dec(base).mul(ret || 0).div(100)),
    total = cents(dec(base).plus(tax).minus(withholding));
  const set = (k: string, patch: Partial<InvLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const first = jobs.find((j) => j.customer.id === id)?.id ?? "";
    setJob(first);
    if (first && !isQuote && !editing && !lines.length) void loadMaterials(first);
  };
  const loadMaterials = async (jobToLoad = job) => {
    setLoadingMat(true);
    setError("");
    try {
      const { items } = await post(`/api/jobs/${jobToLoad}/materials`);
      if (!items.length) setInfo(editing ? "La factura ya incluye todo lo del trabajo." : "No hay material del trabajo pendiente de facturar.");
      else {
        setInfo(editing ? "Se han añadido a la factura las novedades del trabajo." : "");
        setLines((cur) => {
          const next = [...cur];
          for (const it of items as Omit<Line, "key">[]) {
            const at = next.findIndex((l) => (it.lotId ? l.lotId === it.lotId : it.serviceId ? l.serviceId === it.serviceId : l.costId === it.costId));
            // Al rehacer una factura lo pendiente es solo lo nuevo: se suma a lo que ya tenía la línea.
            if (at >= 0) next[at] = { ...next[at], quantity: editing ? dec(next[at].quantity || 0).plus(it.quantity).toString() : it.quantity };
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
  const addHours = () => {
    const l = hoursLine(current, [customers.find((c) => c.id === customerId)?.hourlyRate, defaultRate].find((r) => Number(r) > 0));
    if (!l) return;
    setLines((cur) => {
      const at = cur.findIndex((x) => x.description === HOURS_DESC);
      if (at < 0) return [...cur, l];
      const next = [...cur];
      // Rehaciendo una factura, las horas pendientes son solo las nuevas y se suman; en una nueva se reemplazan.
      next[at] = { ...next[at], quantity: editing ? dec(next[at].quantity || 0).plus(l.quantity).toString() : l.quantity };
      return next;
    });
  };
  // Al facturar desde un trabajo se cargan su material y sus horas pendientes (descontando las ya facturadas).
  useEffect(() => {
    if (!startJob) return;
    // Rehaciendo una factura se traen solo las novedades del trabajo (material, servicios y horas aún sin facturar).
    if (editing) {
      if (!synced.current) {
        synced.current = true; // en desarrollo React monta dos veces y lo pendiente se sumaría doble
        void loadMaterials();
        addHours();
      }
      return;
    }
    // Facturar desde un presupuesto aprobado: se cargan sus líneas tal cual.
    const fromQuote = quoteId ? startJob.quotes.find((x) => x.id === quoteId) : undefined;
    if (fromQuote) {
      const ql = fromQuote.lines?.length ? fromQuote.lines.map((l) => inv({ description: l.description, unit: l.unit, quantity: l.quantity, price: l.price, discount: l.discount ?? "0" })) : quoteLines(fromQuote.id);
      setLines(ql);
      return;
    }
    void loadMaterials();
    addHours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      let saved: { id?: string } = {};
      if (isQuote)
        saved = await post("/api/operations/quote-save", {
          jobId: job,
          number,
          date,
          validUntil: dueAt || undefined,
          net: base,
          tax,
          notes,
          requestKey: key,
          lines: lines.map(({ description, unit, quantity, price, discount }) => ({ description, unit, quantity, price, discount: discount || "0" })),
        });
      else
      saved = await post(editing ? "/api/operations/sale-update" : "/api/operations/sale", {
        id: editing?.id,
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
        requestKey: editing ? undefined : key,
        lines: lines.map(({ lotId, costId, serviceId, description, unit, quantity, price, discount }) => ({ lotId, costId, serviceId, description, unit, quantity, price, discount: discount || "0" })),
      });
      await refresh();
      onDone(saved.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const quotesWithLines = current?.quotes.filter((q) => q.inputs?.lines?.length) ?? [];

  return (
    <div className="inv-page">
      <nav className="inv-crumbs" aria-label="Ruta">
        <Link href={isQuote ? "/presupuestos" : "/facturas"}>{isQuote ? "Presupuestos" : "Facturas"}</Link>
        <ChevronRight size={14} />
        <span>{isQuote ? "Nuevo presupuesto" : editing ? `Editar ${editing.number}` : "Nueva factura"}</span>
        <div className="inv-top">
          <span className="inv-pill"><Clock size={14} /> {isQuote ? "Pendiente de aprobar" : "Pendiente de cobro"}</span>
          <span className="inv-pill">Total: <b>{eur(total)}</b></span>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button loading={busy} disabled={!valid} onClick={submit}>
            {!busy && <Save size={16} />} {busy ? "Guardando…" : isQuote ? "Guardar presupuesto" : "Guardar factura"}
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
            <label>{isQuote ? "Fecha presupuesto" : "Fecha factura"}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Trabajo
              <select value={job} onChange={(e) => { setJob(e.target.value); if (!isQuote && !editing && !lines.length) void loadMaterials(e.target.value); }} disabled={!customerJobs.length}>
                {!customerJobs.length && <option value="">{customerId ? "Sin trabajos" : "Elige cliente"}</option>}
                {customerJobs.map((j) => <option key={j.id} value={j.id}>{j.number} · {j.name}</option>)}
              </select>
            </label>
            <label>Serie<input value={serie} onChange={(e) => setSerie(e.target.value)} /></label>
            <label>{isQuote ? "Válido hasta" : "Vencimiento"}<input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
            {!isQuote && <label>Retención IRPF (%)<input type="number" min="0" max="100" step="any" value={ret} onChange={(e) => setRet(e.target.value)} /></label>}
            <label>Número<input value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
          </div>
        </div>

        <div className="inv-tools">
          <Button type="button" size="sm" variant="outline" onClick={() => setCatalogPicker(true)}>Añadir del catálogo</Button>
          {templates.length > 0 && (
            <select className="lines-select" aria-label="Aplicar plantilla" value="" onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) setLines((ls) => [...ls, ...t.lines.map((l) => inv(l))]);
            }}>
              <option value="">Plantilla…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {!isQuote && quotesWithLines.length > 0 && (
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
                      {[...new Set(["21", "10", "4", "0", l.tax])].map((x) => <option key={x} value={x}>{x} %</option>)}
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
            <div>
              <dt>
                Impuestos
                <input
                  className="tax-all"
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  aria-label="Porcentaje de impuestos de todas las líneas"
                  placeholder="Mixto"
                  disabled={!lines.length}
                  value={lines.length && lines.every((l) => l.tax === lines[0].tax) ? lines[0].tax : ""}
                  onChange={(e) => setLines((ls) => ls.map((l) => ({ ...l, tax: e.target.value })))}
                />
                %
              </dt>
              <dd>{eur(tax)}</dd>
            </div>
            {Number(withholding) > 0 && <div><dt>Retención {ret} %</dt><dd>−{eur(withholding)}</dd></div>}
            <div className="grand"><dt>Total</dt><dd>{eur(total)}</dd></div>
            {!isQuote && <div className="paid"><dt>Ya cobrado (€)</dt><dd><input type="number" min="0" step="any" value={collected} onChange={(e) => setCollected(e.target.value)} /></dd></div>}
          </dl>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {catalogPicker && (
        <CatalogPicker
          close={() => setCatalogPicker(false)}
          onAdd={(i) => {
            const description = [i.description, i.reference && `(${i.reference})`].filter(Boolean).join(" ");
            setLines((ls) => {
              const at = ls.findIndex((l) => l.description === description && l.price === i.price);
              return at >= 0 ? ls.map((l, n) => (n === at ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l)) : [...ls, inv({ description, unit: i.unit, price: i.price })];
            });
          }}
        />
      )}
    </div>
  );
}
