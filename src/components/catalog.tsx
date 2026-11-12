"use client";
import { Fragment, useEffect, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Search, Trash2, ZapOff } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import type { CatalogRow } from "@/lib/catalog-csv";
import { soneparSearchUrl, variation } from "@/lib/catalog-links";

const PAGE = 50;
const KIND: Record<string, string> = { DELIVERY: "Albarán", PURCHASE: "Factura de proveedor", CREDIT: "Abono" };
type Use = { id: string; documentId: string; kind: string; number: string | null; date: string | null; supplier: string; job: { id: string; name: string } | null; quantity: string; unit: string; price: string | null; discount: string; net: string | null };
// Foto del artículo; sin foto o si no carga, un rayo tachado en una caja del mismo tamaño para que no cambien las medidas.
function Thumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="cat-thumb" aria-hidden={!src || failed}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <ZapOff size={22} aria-label="Sin imagen" />
      )}
    </span>
  );
}
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-ES") : "—");

// En qué albaranes y facturas de proveedor aparece el artículo, con el precio pagado en cada compra.
function Usage({ id }: { id: string }) {
  const { data, error } = useSWR<{ uses: Use[] }>(`/api/search/catalog/${id}`, async (u: string) => {
    const r = await fetch(u);
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    return b;
  });
  if (error) return <p className="error">{error.message}</p>;
  if (!data) return <Spinner />;
  if (!data.uses.length) return <p className="small-note">Todavía no aparece en ningún albarán ni factura (se busca por su referencia).</p>;
  // Precio unitario neto pagado (importe de la línea entre unidades); los abonos devuelven material y no fijan precio.
  const unit = (x: Use) => (x.net !== null && Number(x.quantity) > 0 ? Number(x.net) / Number(x.quantity) : x.price ? Number(x.price) * (1 - Number(x.discount) / 100) : 0);
  const paid = data.uses.filter((x) => x.kind !== "CREDIT" && unit(x) > 0).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const prices = paid.map(unit);
  const last = paid[0];
  const price = (n: number) => (n < 1 ? `${n.toFixed(4).replace(".", ",")} €` : eur(String(n)));
  return (
    <>
      {prices.length > 0 && (
        <p className="small-note">
          Último precio unitario pagado: <b>{price(unit(last))}</b> ({day(last.date)}) · mínimo {price(Math.min(...prices))} · máximo {price(Math.max(...prices))} · {paid.length} compras
        </p>
      )}
      <table className="usage-table">
        <thead><tr><th>Fecha</th><th>Documento</th><th>Proveedor</th><th>Trabajo</th><th>Cantidad</th><th>Precio unitario</th></tr></thead>
        <tbody>
          {data.uses.map((x) => (
            <tr key={x.id}>
              <td data-label="Fecha">{day(x.date)}</td>
              <td data-label="Documento"><a href={`/api/documents/${x.documentId}?inline=1`} target="_blank" rel="noreferrer" className="job-link">{KIND[x.kind] ?? x.kind} {x.number ?? ""}</a></td>
              <td data-label="Proveedor">{x.supplier || "—"}</td>
              <td data-label="Trabajo">{x.job?.name ?? "—"}</td>
              <td data-label="Cantidad">{Number(x.quantity)} {x.unit}</td>
              <td data-label="Precio unitario">{unit(x) > 0 ? <><b>{price(unit(x))}</b>{x.kind === "CREDIT" ? " (abono)" : ""}{Number(x.discount) ? <small className="muted" style={{ display: "block" }}>lista {eur(x.price!)} −{Number(x.discount)} %</small> : null}</> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type Item = CatalogRow & { id: string; supplier: string; supplierRef: string; currentPrice: string | null; imageUrl?: string };
const eur = (n: string) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b as { items: Item[]; total: number; all: number; noPrice: number };
};
async function op(action: string, body: unknown) {
  const r = await fetch(`/api/operations/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo guardar.");
  return b;
}

// Base de conocimiento de materiales para presupuestos (separada del almacén).
export default function Catalog() {
  const [query, setQuery] = useState(""),
    [term, setTerm] = useState(""),
    [page, setPage] = useState(1),
    [noPrice, setNoPrice] = useState(false),
    [open, setOpen] = useState(""),
    [adding, setAdding] = useState(false),
    [del, setDel] = useState<{ id: string; description: string } | null>(null),
    [draft, setDraft] = useState<CatalogRow>({ reference: "", description: "", brand: "", unit: "ud", price: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const linked = useSearchParams().get("q"); // viene del buscador general
  useEffect(() => {
    if (linked) setQuery(linked);
  }, [linked]);
  useEffect(() => {
    const t = setTimeout(() => { setTerm(query.trim()); setPage(1); }, 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data, mutate, isLoading } = useSWR(`/api/search/catalog?pageSize=${PAGE}&page=${page}${noPrice ? "&filter=noprice" : ""}&q=${encodeURIComponent(term)}`, fetcher);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">PARA PRESUPUESTAR</div>
          <h1 className="mt-2">Catálogo de materiales</h1>
          <p className="subtitle">Tu base de conocimiento: se elige al hacer un presupuesto, sin tocar el almacén.</p>
        </div>
        <div className="actions">
          <Button onClick={() => setAdding(true)}><Plus size={16} /> Añadir artículo</Button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <label className="person-search" style={{ maxWidth: 520, marginBottom: 16 }}>
        {isLoading ? <Spinner /> : <Search size={16} />}
        <input type="search" placeholder="Buscar por nombre, marca o referencia" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {data && data.noPrice > 0 && (
        <p className="small-note mb-4">
          {data.noPrice} artículos sin precio.{" "}
          <button type="button" className="text-button" onClick={() => { setNoPrice(!noPrice); setPage(1); }}>{noPrice ? "Ver todos" : "Ver solo los que no tienen precio"}</button>
        </p>
      )}
      {!data ? (
        <div className="skeleton" style={{ height: 220, borderRadius: 16 }} role="status" aria-label="Cargando" />
      ) : data.items.length ? (
        <div className="panel">
          <div className="table-wrap">
            <table className="cat-table">
              <thead>
                <tr><th>Artículo</th><th>Pagado (último)</th><th>Hoy en Sonepar</th><th>Variación</th><th /></tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <Fragment key={i.id}>
                  <tr className="cat-row" style={{ cursor: "pointer" }} onClick={() => setOpen(open === i.id ? "" : i.id)} aria-expanded={open === i.id}>
                    <td style={{ whiteSpace: "normal" }}>
                      <div className="cat-art">
                        <div className="cat-art-top">
                          <Thumb src={i.imageUrl} />
                          <span>{i.description}</span>
                        </div>
                        <small className="muted">
                          {[i.reference && `Ref. ${i.reference}`, i.supplierRef && i.supplierRef !== i.reference ? `Ref. prov. ${i.supplierRef}` : "", i.brand, i.supplier].filter(Boolean).join(" · ")}
                        </small>
                      </div>
                    </td>
                    <td data-label="Pagado (último)" style={{ whiteSpace: "nowrap" }}>{Number(i.price) > 0 ? <span className="price-box"><b>{eur(i.price)}</b><small className="muted">/ {i.unit}</small></span> : <span className="muted">Sin precio</span>}</td>
                    <td data-label="Hoy en Sonepar" style={{ whiteSpace: "nowrap" }}>{i.currentPrice ? <b>{eur(i.currentPrice)}</b> : <span className="muted">—</span>}</td>
                    <td data-label="Variación">
                      {(() => {
                        const v = variation(Number(i.price), Number(i.currentPrice));
                        return v === null ? <span className="muted">—</span> : <b className={v > 0 ? "text-red-600" : v < 0 ? "text-emerald-700" : ""}>{v > 0 ? "+" : ""}{String(v).replace(".", ",")} %</b>;
                      })()}
                    </td>
                    <td>
                      {soneparSearchUrl(i) && (
                        <a className="ib" href={soneparSearchUrl(i)} target="_blank" rel="noreferrer" title="Ver el precio actual en Sonepar" aria-label={`Ver ${i.description} en Sonepar`} onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={16} />
                        </a>
                      )}

                      <button
                        type="button"
                        aria-label={`Borrar ${i.description}`}
                        className="ib danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDel({ id: i.id, description: i.description });
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                  {open === i.id && <tr className="cat-detail"><td colSpan={5} style={{ whiteSpace: "normal" }}><b>Dónde aparece</b><Usage id={i.id} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small-note" style={{ padding: "12px 20px" }}>
            {data.total} artículos · pulsa uno para ver en qué facturas aparece
          </p>
          {data.total > PAGE && (
            <div className="form-footer" style={{ padding: "0 20px 16px", justifyContent: "center", alignItems: "center", gap: 12 }}>
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} />Anterior</Button>
              <span className="small-note">Página {page} de {Math.ceil(data.total / PAGE)}</span>
              <Button variant="outline" disabled={page >= Math.ceil(data.total / PAGE)} onClick={() => setPage(page + 1)}>Siguiente<ChevronRight size={16} /></Button>
            </div>
          )}
        </div>
      ) : (
        <div className="empty">
          <h3>{data.all ? "Nada coincide con la búsqueda" : "Aún no hay materiales"}</h3>
          <p>{data.all ? "Prueba con otra palabra." : "Importa tu CSV o añade el primer artículo."}</p>
        </div>
      )}
      {adding && (
        <Dialog open onOpenChange={(v) => !v && !busy && setAdding(false)} title="Añadir artículo">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setBusy(true);
              setError("");
              try {
                await op("catalog-save", { ...draft, price: draft.price.replace(",", ".") });
                setAdding(false);
                setDraft({ reference: "", description: "", brand: "", unit: "ud", price: "" });
                await mutate();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <label className="full">Descripción<input required autoFocus value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
              <label>Referencia<input value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} /></label>
              <label>Marca<input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></label>
              <label>Unidad<input required value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></label>
              <label>Precio (€)<input required inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="form-footer">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(false)}>Cancelar</Button>
              <Button loading={busy}>{busy ? "Guardando…" : "Guardar"}</Button>
            </div>
          </form>
        </Dialog>
      )}
      <ConfirmDialog
        open={!!del}
        title="¿Eliminar el artículo?"
        message={`«${del?.description ?? ""}» se quitará del catálogo. No se puede deshacer.`}
        busy={busy}
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          setBusy(true);
          try {
            await op("catalog-delete", { id: del.id });
            await mutate();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
            setDel(null);
          }
        }}
      />
    </>
  );
}
