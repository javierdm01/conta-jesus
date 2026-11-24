"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Search, PenLine, Pencil, Camera, Package } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Item = { id: string; code: string; alias: string; description: string; reference: string; unit: string; onHand: string; brand?: string; model?: string; location?: string; unitCost?: string | null; recommendedPrice?: string | null; imageUrl?: string; ownImage?: boolean };
function MatThumb({ src, big }: { src?: string; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`mat-thumb${big ? " big" : ""}`}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Package size={big ? 34 : 24} aria-label="Sin foto" />
      )}
    </span>
  );
}
type CatalogItem = { id: string; reference: string; supplierRef: string; description: string; alias?: string; brand: string; unit: string; price: string; currentPrice: string | null; imageUrl?: string };
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
const eur = (n?: string | number | null) => (n == null || n === "" ? "" : `${Number(n).toFixed(2).replace(".", ",")} €`);
const refKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");


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
  jobs: { id: string; number: string; name: string; customer: { name: string } }[];
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
    [photoBusy, setPhotoBusy] = useState(""),
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
            body: JSON.stringify({ jobId: job, type: "Materiales", description: `${cat.alias || cat.description}${cat.reference ? ` (Ref. ${cat.reference})` : ""}`.slice(0, 200), quantity, unit: cat.unit, price, notes, requestKey: key }),
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
  const uploadPhoto = async (lotId: string, file: File) => {
    setPhotoBusy(lotId);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/lots/${lotId}/image`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw Error(body.error ?? "No se pudo subir la foto.");
      await mutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy("");
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
              <option key={j.id} value={j.id}>{j.number} · {j.customer.name} · {j.name}</option>
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
            <strong>{cat.alias || cat.description}</strong>
            <small>{[cat.alias && cat.description, cat.reference && `Ref. ${cat.reference}`, cat.brand, "del catálogo · no descuenta del almacén"].filter(Boolean).join(" · ")}</small>
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
          <div className="mat-card on">
            <MatThumb src={item.imageUrl} big />
            <span className="mat-body">
              <strong>{item.alias || item.description}</strong>
              <span className="mat-meta">{[item.reference && `Ref. ${item.reference}`, item.code, item.brand, item.model, item.location && `Ubicación ${item.location}`, `${item.onHand} ${item.unit} en almacén`].filter(Boolean).join(" · ")}</span>
              <span className="mat-line">
                {item.recommendedPrice && <b className="mat-sale">Venta {eur(item.recommendedPrice)}/{item.unit}</b>}
                {item.unitCost && <span className="mat-cost">Coste {eur(item.unitCost)}/{item.unit}</span>}
              </span>
            </span>
          </div>
          <label>Cantidad usada ({item.unit})
            <input type="number" min="0" step="any" autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          {item.unitCost && <p className="small-note">Coste total: {eur(Number(quantity) * Number(item.unitCost) || 0)}{item.recommendedPrice && ` · Venta sugerida: ${eur(Number(quantity) * Number(item.recommendedPrice) || 0)}`}</p>}
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
          {error && <p className="error" role="alert">{error}</p>}
          <div className="person-list">
            {data?.items.map((p) => (
              <div key={p.id} className="mat-row">
                <button type="button" className={`mat-card${canEdit ? " has-edit" : ""}`} disabled={!Number(p.onHand)} onClick={() => setItem(p)}>
                  <MatThumb src={p.imageUrl} />
                  <span className="mat-body">
                    <strong>{p.alias || p.description}</strong>
                    {p.alias && <span className="mat-desc">{p.description}</span>}
                    <span className="mat-meta">{[p.reference && `Ref. ${p.reference}`, p.brand, p.model, p.location && `Ubic. ${p.location}`].filter(Boolean).join(" · ")}</span>
                    <span className="mat-line">
                      {p.recommendedPrice && <b className="mat-sale">Venta {eur(p.recommendedPrice)}/{p.unit}</b>}
                      {p.unitCost && <span className="mat-cost">Coste {eur(p.unitCost)}</span>}
                      <span className={Number(p.onHand) > 0 ? "mat-stock" : "mat-stock none"}>{Number(p.onHand) > 0 ? `${p.onHand} ${p.unit} disponibles` : "Agotado"}</span>
                    </span>
                  </span>
                </button>
                {canEdit && (
                  <div className="mat-actions">
                    <label className="mat-edit" title={p.ownImage ? "Cambiar foto" : "Subir foto"} aria-label={`${p.ownImage ? "Cambiar" : "Subir"} foto de ${p.alias || p.description}`}>
                      {photoBusy === p.id ? <Spinner /> : <Camera size={16} />}
                      <input type="file" accept="image/*" hidden disabled={!!photoBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadPhoto(p.id, f); }} />
                    </label>
                    <button type="button" className="mat-edit" aria-label={`Editar ${p.alias || p.description}`} title="Editar" onClick={() => startEdit(p)}>
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {catItems.length > 0 && (
              <>
                <p className="small-note">Del catálogo · no está en el almacén</p>
                {catItems.map((c) => (
                  <div key={c.id} className="mat-row">
                    <button type="button" className="mat-card" onClick={() => (setCat(c), setPrice(unitPrice(c) > 0 ? String(unitPrice(c)) : ""))}>
                      <MatThumb src={c.imageUrl} />
                      <span className="mat-body">
                        <strong>{c.alias || c.description}</strong>
                        {c.alias && <span className="mat-desc">{c.description}</span>}
                        <span className="mat-meta">{[c.reference && `Ref. ${c.reference}`, c.brand].filter(Boolean).join(" · ")}</span>
                        <span className="mat-line">
                          {unitPrice(c) > 0 ? <b className="mat-sale">{unitPrice(c).toFixed(2).replace(".", ",")} € / {c.unit}</b> : <span className="mat-cost">Sin precio</span>}
                        </span>
                      </span>
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
