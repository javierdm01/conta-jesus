"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Search, PenLine } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Item = { id: string; code: string; alias: string; description: string; reference: string; unit: string; onHand: string };
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) throw Error(body.error);
  return body as { items: Item[]; total: number };
};

// Busca material del almacén y lo descuenta directamente en el trabajo (con su coste real).
export function MaterialPicker({
  jobs,
  jobId,
  close,
  saved,
  onManual,
}: {
  jobs: { id: string; number: string; name: string }[];
  jobId?: string;
  close: () => void;
  saved: () => Promise<void>;
  onManual?: () => void;
}) {
  const [query, setQuery] = useState(""),
    [term, setTerm] = useState(""),
    [job, setJob] = useState(jobId ?? jobs[0]?.id ?? ""),
    [item, setItem] = useState<Item | null>(null),
    [quantity, setQuantity] = useState("1"),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data, error: searchError, isLoading } = useSWR(`/api/search/products?q=${encodeURIComponent(term)}`, fetcher);
  const waiting = query.trim() !== term || isLoading;
  const submit = async () => {
    if (!item) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/operations/stock-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: item.id, kind: "USE", quantity, jobId: job, notes, requestKey: key }),
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.error ?? "No se pudo añadir el material.");
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && close()} title="Añadir material" nested>
      {!jobId && (
        <label>
          Trabajo
          <select value={job} onChange={(e) => setJob(e.target.value)}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.number} · {j.name}</option>
            ))}
          </select>
        </label>
      )}
      {item ? (
        <div className="person-list" style={{ flex: 1, overflow: "visible" }}>
          <div className="person-card on">
            <strong>{item.alias || item.description}</strong>
            <small>{[item.reference && `Ref. ${item.reference}`, item.code, `${item.onHand} ${item.unit} en almacén`].filter(Boolean).join(" · ")}</small>
          </div>
          <label>Cantidad usada ({item.unit})
            <input type="number" min="0" step="any" autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label>Nota <span className="font-normal text-slate-400">· opcional</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-footer">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setItem(null)}>Cambiar material</Button>
            <Button type="button" loading={busy} disabled={!Number(quantity) || !job} onClick={submit}>
              {busy ? "Añadiendo…" : "Añadir al trabajo"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="person-tools">
            <label className="person-search">
              {waiting ? <Spinner /> : <Search size={16} />}
              <input autoFocus type="search" placeholder="Buscar por nombre, alias o referencia" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {onManual && <Button type="button" variant="outline" onClick={onManual}><PenLine size={16} />A mano</Button>}
          </div>
          {searchError && <p className="error" role="alert">{searchError.message}</p>}
          <div className="person-list">
            {data?.items.map((p) => (
              <button type="button" key={p.id} className="person-card" disabled={!Number(p.onHand)} onClick={() => setItem(p)}>
                <strong>{p.alias || p.description}</strong>
                <small>{[p.reference && `Ref. ${p.reference}`, `${p.onHand} ${p.unit} disponibles`].filter(Boolean).join(" · ")}</small>
              </button>
            ))}
            {data && !data.items.length && <p className="small-note">No hay material con ese nombre. Puedes añadirlo «A mano».</p>}
          </div>
        </>
      )}
    </Dialog>
  );
}
