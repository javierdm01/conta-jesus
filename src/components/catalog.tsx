"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, FileUp, Plus, Search, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { parseCatalogCsv, type CatalogRow } from "@/lib/catalog-csv";
import { parseSoneparJson } from "@/lib/catalog-sonepar";

const PAGE = 50;
const KIND: Record<string, string> = { DELIVERY: "Albarán", PURCHASE: "Factura de proveedor", CREDIT: "Abono" };
type Use = { id: string; documentId: string; kind: string; number: string | null; date: string | null; supplier: string; job: { id: string; name: string } | null; quantity: string; unit: string; price: string | null; discount: string };
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
  const prices = data.uses.map((x) => Number(x.price)).filter((x) => x > 0);
  const last = data.uses.find((x) => Number(x.price) > 0);
  return (
    <>
      {prices.length > 0 && (
        <p className="small-note">
          Último precio pagado: <b>{eur(String(last!.price))}</b> ({day(last!.date)}) · mínimo {eur(String(Math.min(...prices)))} · máximo {eur(String(Math.max(...prices)))} · {data.uses.length} compras
        </p>
      )}
      <table>
        <thead><tr><th>Fecha</th><th>Documento</th><th>Proveedor</th><th>Trabajo</th><th>Cantidad</th><th>Precio</th></tr></thead>
        <tbody>
          {data.uses.map((x) => (
            <tr key={x.id}>
              <td>{day(x.date)}</td>
              <td>{KIND[x.kind] ?? x.kind} {x.number ?? ""}</td>
              <td>{x.supplier || "—"}</td>
              <td>{x.job?.name ?? "—"}</td>
              <td>{Number(x.quantity)} {x.unit}</td>
              <td>{x.price ? `${eur(x.price)}${Number(x.discount) ? ` (−${Number(x.discount)} %)` : ""}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type Item = CatalogRow & { id: string; supplier: string; supplierRef: string };
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
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => { setTerm(query.trim()); setPage(1); }, 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data, mutate, isLoading } = useSWR(`/api/search/catalog?pageSize=${PAGE}&page=${page}${noPrice ? "&filter=noprice" : ""}&q=${encodeURIComponent(term)}`, fetcher);
  const importFile = async (f: File) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const text = await f.text();
      // JSON de Sonepar («Ya comprado») o CSV de Excel.
      const isJson = f.name.toLowerCase().endsWith(".json") || text.trimStart().startsWith("{");
      const sonepar = isJson ? parseSoneparJson(text) : null;
      const { items, errors } = sonepar
        ? { items: sonepar.items, errors: [] as string[] }
        : parseCatalogCsv(text);
      if (!items.length) throw Error(errors[0] ?? "No se ha encontrado ningún artículo en el archivo.");
      let created = 0,
        updated = 0;
      // Por lotes: cada petición tiene un tamaño máximo.
      for (let i = 0; i < items.length; i += 500) {
        const r = await op("catalog-import", { items: items.slice(i, i + 500) });
        created += r.created;
        updated += r.updated;
      }
      const note = sonepar
        ? ` · ${sonepar.withoutPrice} sin precio visible (quedan a 0 € para completarlos)${sonepar.skipped ? ` · ${sonepar.skipped} omitidos (portes)` : ""}`
        : errors.length
          ? ` · ${errors.length} filas ignoradas (${errors[0]})`
          : "";
      setMessage(`${created} artículos nuevos, ${updated} actualizados${note}.`);
      await mutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">PARA PRESUPUESTAR</div>
          <h1 className="mt-2">Catálogo de materiales</h1>
          <p className="subtitle">Tu base de conocimiento: se elige al hacer un presupuesto, sin tocar el almacén.</p>
        </div>
        <div className="actions">
          <Button variant="outline" loading={busy} onClick={() => file.current?.click()}>
            <FileUp size={16} /> Importar CSV o Sonepar
          </Button>
          <Button onClick={() => setAdding(true)}><Plus size={16} /> Añadir artículo</Button>
          <input ref={file} type="file" accept=".csv,.json,text/csv,text/plain,application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </div>
      </div>
      <p className="small-note mb-4">
        CSV exportado de Excel con cabecera: <b>referencia, descripción, marca, unidad, precio</b> (solo descripción y precio son obligatorias).
        Si importas un artículo que ya existe, se actualiza su precio. También acepta el JSON «Ya comprado» de Sonepar.
      </p>
      {message && <div className="inventory-notice" role="status">{message}</div>}
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
            <table>
              <thead>
                <tr><th>Referencia</th><th>Descripción</th><th>Marca</th><th>Proveedor</th><th>Ref. prov.</th><th>Unidad</th><th>Precio</th><th /></tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <Fragment key={i.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setOpen(open === i.id ? "" : i.id)} aria-expanded={open === i.id}>
                    <td>{i.reference || "—"}</td>
                    <td style={{ whiteSpace: "normal" }}>{i.description}</td>
                    <td>{i.brand || "—"}</td>
                    <td>{i.supplier || "—"}</td>
                    <td>{i.supplierRef || "—"}</td>
                    <td>{i.unit}</td>
                    <td>{Number(i.price) > 0 ? eur(i.price) : <span className="muted">Sin precio</span>}</td>
                    <td>
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
                  {open === i.id && <tr><td colSpan={8} style={{ whiteSpace: "normal" }}><b>Dónde aparece</b><Usage id={i.id} /></td></tr>}
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
