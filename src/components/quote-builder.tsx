"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { BookOpen, Check, Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cents, dec, quotePrice } from "@/lib/money";
import type { Job, Worker } from "@/lib/workspace-types";
import { LinesEditor, linesNet, newLine, type Line } from "./lines-editor";

type Item = { id: string; reference: string; description: string; brand: string; unit: string; price: string; supplier: string };
const eur = (n: string | number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b as { items: Item[]; total: number; all: number };
};

// Buscador de la base de conocimiento de materiales. Cada pulsación añade el artículo (otra pulsación suma una unidad).
export function CatalogPicker({ onAdd, close }: { onAdd: (i: Item) => void; close: () => void }) {
  const [query, setQuery] = useState(""),
    [term, setTerm] = useState(""),
    [added, setAdded] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data, error, isLoading } = useSWR(`/api/search/catalog?q=${encodeURIComponent(term)}`, fetcher);
  const waiting = query.trim() !== term || isLoading;
  return (
    <Dialog open onOpenChange={(v) => !v && close()} title="Base de materiales" nested>
      <div className="person-tools">
        <label className="person-search">
          {waiting ? <Spinner /> : <Search size={16} />}
          <input autoFocus type="search" placeholder="Buscar por nombre, marca, proveedor o referencia" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Button type="button" onClick={close}>Listo{added ? ` (${added})` : ""}</Button>
      </div>
      {error && <p className="error" role="alert">{error.message}</p>}
      <div className="person-list">
        {data?.items.map((i) => (
          <button
            type="button"
            key={i.id}
            className="person-card"
            onClick={() => {
              onAdd(i);
              setAdded((n) => n + 1);
            }}
          >
            <strong>{i.description}</strong>
            <small>{[i.reference && `Ref. ${i.reference}`, i.brand, i.supplier, `${eur(i.price)} / ${i.unit}`].filter(Boolean).join(" · ")}</small>
          </button>
        ))}
        {data && !data.items.length && (
          <p className="small-note">
            {data.all ? "Nada coincide con la búsqueda." : "La base de materiales está vacía. Cárgala desde Menú → Catálogo."}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export function QuoteBuilder({
  jobs,
  jobId,
  workers,
  defaultMargin,
  close,
  saved,
}: {
  jobs: Job[];
  jobId?: string;
  workers: Worker[];
  defaultMargin?: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [job, setJob] = useState(jobId ?? jobs[0]?.id ?? ""),
    [name, setName] = useState(""),
    [lines, setLines] = useState<Line[]>([]),
    [hours, setHours] = useState("0"),
    [hourlyCost, setHourlyCost] = useState(() => {
      const w = jobs.find((j) => j.id === (jobId ?? jobs[0]?.id))?.worker;
      return String(workers.find((x) => x.id === w?.id)?.hourlyCost ?? "");
    }),
    [margin, setMargin] = useState(String(Number(defaultMargin ?? 25))),
    [extra, setExtra] = useState({ travel: "0", subcontract: "0", other: "0", overhead: "0" }),
    [picker, setPicker] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID()),
    guard = useRef(0);
  const materials = linesNet(lines);
  let price = "";
  try {
    price = quotePrice(
      dec(materials).plus(dec(hours || 0).mul(hourlyCost || 0)).plus(extra.travel || 0).plus(extra.subcontract || 0).plus(extra.other || 0).plus(extra.overhead || 0),
      margin || 0,
    );
  } catch {}
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/operations/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job,
          name,
          hours,
          hourlyCost: hourlyCost || "0",
          margin,
          ...extra,
          lines: lines.map(({ description, unit, quantity, price, catalogId }) => ({ description, unit, quantity, price, catalogId })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.error ?? "No se pudo crear el presupuesto.");
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const valid = job && name.trim() && price && lines.every((l) => l.description.trim() && Number(l.quantity) > 0 && l.price !== "");
  return (
    <Dialog open wide title="Crear presupuesto" onOpenChange={(v) => !v && !busy && Date.now() > guard.current && close()}>
      <div className="form-grid">
        <label>
          Trabajo
          <select value={job} disabled={!!jobId} onChange={(e) => setJob(e.target.value)}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.number} · {j.name}</option>
            ))}
          </select>
        </label>
        <label>
          Nombre del presupuesto
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <LinesEditor lines={lines} onChange={setLines} priceLabel="Coste">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            guard.current = Infinity;
            setPicker(true);
          }}
        >
          <BookOpen size={15} /> Base de materiales
        </Button>
      </LinesEditor>
      <div className="form-grid">
        <label>Horas previstas<input type="number" min="0" step="any" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        <label>Coste por hora (€)<input type="number" min="0" step="any" value={hourlyCost} onChange={(e) => setHourlyCost(e.target.value)} /></label>
        <label>Margen sobre venta (%)<input type="number" min="0" max="99" step="any" value={margin} onChange={(e) => setMargin(e.target.value)} /></label>
      </div>
      <details className="more-fields">
        <summary>Más costes</summary>
        <div className="form-grid">
          {([["travel", "Desplazamiento (€)"], ["subcontract", "Subcontrataciones (€)"], ["other", "Otros costes directos (€)"], ["overhead", "Gastos generales (€)"]] as const).map(([k, label]) => (
            <label key={k}>{label}<input type="number" min="0" step="any" value={extra[k]} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} /></label>
          ))}
        </div>
      </details>
      <div className="quote-preview">
        <div className="small-note">
          Materiales {eur(materials)} · precio mínimo para el margen indicado
          <br />
          Base neta · impuestos por añadir
        </div>
        <strong>{price ? eur(cents(price)) : "Revisa el margen"}</strong>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-footer">
        <Button type="button" variant="outline" disabled={busy} onClick={close}>Cancelar</Button>
        <Button type="button" loading={busy} disabled={!valid} onClick={submit}>
          {busy ? "Guardando…" : "Crear presupuesto"}
          {!busy && <Check size={16} />}
        </Button>
      </div>
      {picker && (
        <CatalogPicker
          close={() => {
            guard.current = Date.now() + 500;
            setPicker(false);
          }}
          onAdd={(i) =>
            setLines((cur) => {
              const at = cur.findIndex((l) => l.catalogId === i.id);
              if (at >= 0) return cur.map((l, n) => (n === at ? { ...l, quantity: String(Number(l.quantity) + 1) } : l));
              return [...cur, newLine({ catalogId: i.id, description: [i.description, i.reference && `(${i.reference})`].filter(Boolean).join(" "), unit: i.unit, price: i.price })];
            })
          }
        />
      )}
    </Dialog>
  );
}
