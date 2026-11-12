"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Search, PenLine, Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Item = { id: string; code: string; alias: string; description: string; reference: string; unit: string; onHand: string };
type CatalogItem = { id: string; reference: string; supplierRef: string; description: string; brand: string; unit: string; price: string; currentPrice: string | null };
const unitPrice = (c: CatalogItem) => (Number(c.price) > 0 ? Number(c.price) : Number(c.currentPrice ?? 0)); // tarifa o, si no hay, precio actual de Sonepar
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) throw Error(body.error);
  return body as { items: Item[]; total: number };
};
const catalogFetcher = async (url: string) => {
  const r = await fetch(url);
  return r.ok ? ((await r.json()) as { items: CatalogItem[] }) : { items: [] };
};
const refKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");

/** Texto del coste de un material del catálogo: «2 ud × Cable 2,5 (Ref. X)». */
export const catalogCostText = (quantity: string | number, c: Pick<CatalogItem, "unit" | "description" | "reference">) =>
  `${Number(quantity)} ${c.unit} × ${c.description}${c.reference ? ` (Ref. ${c.reference})` : ""}`.slice(0, 200);

// Busca material del almacén y lo descuenta directamente en el trabajo (con su coste real). Con `catalog` (solo el
// responsable), debajo salen también los artículos del catálogo: se apuntan como coste de materiales a precio de tarifa.
export function MaterialPicker({
  jobs,
  jobId,
  close,
  saved,
  onManual,
  canEdit,
  catalog,
}: {
  jobs: { id: string; number: string; name: string }[];
  jobId?: string;
  close: () => void;
  saved: () => Promise<void>;
  onManual?: () => void;
  canEdit?: boolean;
  catalog?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [term, setTerm] = useState(""),
    [job, setJob] = useState(jobId ?? jobs[0]?.id ?? ""),
    [item, setItem] = useState<Item | null>(null),
    [cat, setCat] = useState<CatalogItem | null>(null),
    [price, setPrice] = useState(""),
    [editing, setEditing] = useState<Item | null>(null),
    [alias, setAlias] = useState(""),
    [descr, setDescr] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data, error: searchError, isLoading, mutate } = useSWR(`/api/search/products?q=${encodeURIComponent(term)}`, fetcher);
  const { data: catData, isLoading: catLoading } = useSWR(catalog && term.length >= 2 ? `/api/search/catalog?limit=15&q=${encodeURIComponent(term)}` : null, catalogFetcher);
  // Lo que ya está en el almacén sale arriba; del catálogo se quita lo que tenga la misma referencia que un artículo del almacén.
  const inStock = new Set((data?.items ?? []).map((p) => refKey(p.reference)).filter(Boolean));
  const catItems = (catData?.items ?? []).filter((c) => ![c.reference, c.supplierRef].some((r) => refKey(r) && inStock.has(refKey(r))));
  const waiting = query.trim() !== term || isLoading || catLoading;
  const submit = async () => {
    if (!item && !cat) return;
    setBusy(true);
    setError("");
    try {
      const res = cat
        ? await fetch("/api/operations/cost", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: job, type: "Materiales", description: (catalogCostText(quantity, cat) + (notes.trim() ? ` · ${notes.trim()}` : "")).slice(0, 200), amount: (Number(quantity) * Number(price)).toFixed(2), requestKey: key }),
          })
        : await fetch("/api/operations/stock-move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lotId: item!.id, kind: "USE", quantity, jobId: job, notes, requestKey: key }),
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
  const startEdit = (p: Item) => {
    setEditing(p);
    setAlias(p.alias);
    setDescr(p.description);
    setError("");
  };
  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/operations/stock-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: editing.id, alias, description: descr }),
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.error ?? "No se pudo guardar el material.");
      await mutate();
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && close()} title={editing ? "Editar material" : "Añadir material"} nested>
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
      {editing ? (
        <div className="person-list" style={{ flex: 1, overflow: "visible" }}>
          <label>Nombre corto <span className="font-normal text-slate-400">· como lo llamas tú</span>
            <input autoFocus value={alias} onChange={(e) => setAlias(e.target.value)} />
          </label>
          <label>Descripción
            <input value={descr} onChange={(e) => setDescr(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-footer">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="button" loading={busy} disabled={!descr.trim()} onClick={saveEdit}>{busy ? "Guardando…" : "Guardar"}</Button>
          </div>
        </div>
      ) : cat ? (
        <div className="person-list" style={{ flex: 1, overflow: "visible" }}>
          <div className="person-card on">
            <strong>{cat.description}</strong>
            <small>{[cat.reference && `Ref. ${cat.reference}`, cat.brand, "del catálogo · no descuenta del almacén"].filter(Boolean).join(" · ")}</small>
          </div>
          <label>Cantidad usada ({cat.unit})
            <input type="number" min="0" step="any" autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label>Coste por {cat.unit} (€, sin IVA)
            <input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <p className="small-note">Coste total: {(Number(quantity) * Number(price) || 0).toFixed(2).replace(".", ",")} €</p>
          <label>Nota <span className="font-normal text-slate-400">· opcional</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-footer">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setCat(null)}>Cambiar material</Button>
            <Button type="button" loading={busy} disabled={!Number(quantity) || !job || Number(price) < 0 || price === ""} onClick={submit}>
              {busy ? "Añadiendo…" : "Añadir al trabajo"}
            </Button>
          </div>
        </div>
      ) : item ? (
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
              <div key={p.id} className="mat-row">
                <button type="button" className={`person-card${canEdit ? " has-edit" : ""}`} disabled={!Number(p.onHand)} onClick={() => setItem(p)}>
                  <strong>{p.alias || p.description}</strong>
                  <small>{[p.reference && `Ref. ${p.reference}`, `${p.onHand} ${p.unit} disponibles`].filter(Boolean).join(" · ")}</small>
                </button>
                {canEdit && (
                  <button type="button" className="mat-edit" aria-label={`Editar ${p.alias || p.description}`} title="Editar" onClick={() => startEdit(p)}>
                    <Pencil size={16} />
                  </button>
                )}
              </div>
            ))}
            {catItems.length > 0 && (
              <>
                <p className="small-note">Del catálogo · no está en el almacén</p>
                {catItems.map((c) => (
                  <div key={c.id} className="mat-row">
                    <button type="button" className="person-card" onClick={() => (setCat(c), setPrice(unitPrice(c) > 0 ? String(unitPrice(c)) : ""))}>
                      <strong>{c.description}</strong>
                      <small>{[c.reference && `Ref. ${c.reference}`, c.brand, unitPrice(c) > 0 ? `${unitPrice(c).toFixed(2).replace(".", ",")} € / ${c.unit}` : "sin precio"].filter(Boolean).join(" · ")}</small>
                    </button>
                  </div>
                ))}
              </>
            )}
            {data && !data.items.length && !catItems.length && <p className="small-note">No hay material con ese nombre. Puedes añadirlo «A mano».</p>}
          </div>
        </>
      )}
    </Dialog>
  );
}
