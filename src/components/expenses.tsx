"use client";
import { uploadDocument } from "@/lib/optimize-upload";
import { useMemo, useState } from "react";
import { Car, FileText, Fuel, IdCard, Paperclip, Plus, Receipt, ShieldCheck, Trash2, Utensils } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { EXPENSE_CATEGORIES, EXPENSE_LABEL, splitVat } from "@/lib/expenses";
import { dec, sum } from "@/lib/money";
import type { State } from "@/lib/workspace-types";

type Overhead = State["overheads"][number];
const ICONS = { AUTONOMO: IdCard, SEGURO: ShieldCheck, VEHICULO: Car, COMBUSTIBLE: Fuel, DIETAS: Utensils, OTHER: Receipt } as const;
const euro = (v: string | number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(v));
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const fmt = (d: string) => new Date(d).toLocaleDateString("es-ES", { timeZone: "UTC" });

async function post(url: string, body: BodyInit, json = true) {
  const res = await fetch(url, {
    method: "POST",
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body,
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error ?? "No se pudo guardar.");
  return data;
}

/** Registrar un gasto en 3 pasos: tipo → importe → guardar. El justificante es opcional. */
export function ExpenseForm({ close, saved, defaultTax }: { close: () => void; saved: () => Promise<void>; defaultTax?: string }) {
  const [category, setCategory] = useState<(typeof EXPENSE_CATEGORIES)[number]["key"]>("COMBUSTIBLE"),
    [total, setTotal] = useState(""),
    [vat, setVat] = useState(Number(defaultTax ?? 21)),
    [date, setDate] = useState(today()),
    [concept, setConcept] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const meta = EXPENSE_CATEGORIES.find((c) => c.key === category)!;
  let split = { net: "0.00", tax: "0.00" };
  try {
    split = splitVat(total, vat);
  } catch {}
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && close()} title="Registrar gasto">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            let documentId: string | undefined;
            if (file) {
              documentId = (await uploadDocument(file, { kind: "EXPENSE" })).id;
            }
            await post(
              "/api/operations/overhead",
              JSON.stringify({
                description: concept.trim() || meta.label,
                amount: split.net,
                tax: split.tax,
                date,
                category,
                documentId,
              }),
            );
            await saved();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="expense-types" role="radiogroup" aria-label="Tipo de gasto">
          {EXPENSE_CATEGORIES.map((c) => {
            const Icon = ICONS[c.key];
            return (
              <button
                type="button"
                key={c.key}
                role="radio"
                aria-checked={category === c.key}
                className={category === c.key ? "on" : ""}
                onClick={() => {
                  setCategory(c.key);
                  setVat(c.vat);
                }}
              >
                <Icon size={22} />
                {c.label}
              </button>
            );
          })}
        </div>
        {meta.hint && <p className="small-note">{meta.hint}</p>}
        <div className="form-grid mt-4">
          <label>
            Total pagado (€)
            <input type="number" inputMode="decimal" min="0" step="0.01" required autoFocus value={total} onChange={(e) => setTotal(e.target.value)} />
          </label>
          <label>
            IVA incluido
            <select value={vat} onChange={(e) => setVat(Number(e.target.value))}>
              <option value={0}>Sin IVA</option>
              <option value={21}>21 %</option>
              <option value={10}>10 %</option>
              <option value={4}>4 %</option>
            </select>
          </label>
          <label>
            Fecha
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Concepto <span className="font-normal text-slate-400">· opcional</span>
            <input value={concept} maxLength={200} placeholder={meta.label} onChange={(e) => setConcept(e.target.value)} />
          </label>
        </div>
        {dec(total || 0).gt(0) && (
          <p className="small-note mt-2">
            Base {euro(split.net)} · IVA {euro(split.tax)}
          </p>
        )}
        <label className="expense-file">
          <Paperclip size={18} />
          {file ? file.name : "Adjuntar factura o ticket (foto o PDF)"}
          <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-footer">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>Cancelar</Button>
          <Button loading={busy} disabled={!dec(total || 0).gt(0)}>{busy ? "Guardando…" : "Guardar gasto"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

const quarterOf = (d: string) => Math.floor((new Date(d).getUTCMonth()) / 3) + 1;

export default function Expenses({
  overheads,
  onAdd,
  onDelete,
}: {
  overheads: Overhead[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear()),
    [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const years = [...new Set([now.getFullYear(), ...overheads.map((o) => new Date(o.date).getUTCFullYear())])].sort((a, b) => b - a);
  const rows = useMemo(
    () => overheads.filter((o) => new Date(o.date).getUTCFullYear() === year && (!quarter || quarterOf(o.date) === quarter)),
    [overheads, year, quarter],
  );
  const total = (list: Overhead[]) => sum(list.map((o) => dec(o.amount).plus(o.tax)));
  const grand = total(rows);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">DÓNDE SE FUE EL DINERO</div>
          <h1 className="mt-2">Gastos</h1>
          <p className="subtitle">Autónomos, seguros, vehículo y gasolina. Con su factura, salen juntos en el paquete del trimestre.</p>
        </div>
        <Button onClick={onAdd}><Plus size={16} /> Registrar gasto</Button>
      </div>
      <div className="expense-filters">
        <select aria-label="Año" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        {([0, 1, 2, 3, 4] as const).map((q) => (
          <button key={q} type="button" className={quarter === q ? "on" : ""} onClick={() => setQuarter(q)}>
            {q ? `T${q}` : "Todo el año"}
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="expense-summary">
          <div>
            <small>Total gastado</small>
            <strong>{euro(grand.toString())}</strong>
          </div>
          {EXPENSE_CATEGORIES.map((c) => {
            const part = total(rows.filter((o) => o.category === c.key));
            const pct = grand.gt(0) ? part.div(grand).mul(100).toNumber() : 0;
            const Icon = ICONS[c.key];
            return (
              <div key={c.key} className="expense-bar">
                <span><Icon size={16} /> {c.label}</span>
                <i><b style={{ width: `${pct}%` }} /></i>
                <em>{euro(part.toString())}</em>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel">
        {rows.length ? (
          <div className="record-list">
            {rows.map((o) => (
              <div className="record" key={o.id}>
                <div>
                  {o.description}
                  <small>
                    {fmt(o.date)} · {EXPENSE_LABEL[o.category] ?? o.category}
                    {dec(o.tax).gt(0) && ` · IVA ${euro(o.tax)}`}
                    {o.documentId ? (
                      <>
                        {" · "}
                        <a className="underline" href={`/api/documents/${o.documentId}`} target="_blank" rel="noreferrer">
                          <FileText size={12} className="inline" /> Factura
                        </a>
                      </>
                    ) : (
                      " · sin factura"
                    )}
                  </small>
                </div>
                <div className="expense-amount">
                  <strong>{euro(dec(o.amount).plus(o.tax).toString())}</strong>
                  <button
                    type="button"
                    aria-label={`Eliminar gasto ${o.description}`}
                    onClick={() => onDelete(o.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="small-note p-6">No hay gastos en este periodo. Pulsa «Registrar gasto» para añadir el primero.</p>
        )}
      </div>
    </>
  );
}
