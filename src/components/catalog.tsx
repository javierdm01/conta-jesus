"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { FileUp, Plus, Search, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { parseCatalogCsv, type CatalogRow } from "@/lib/catalog-csv";
import { parseSoneparJson } from "@/lib/catalog-sonepar";

type Item = CatalogRow & { id: string; supplier: string };
const eur = (n: string) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b as { items: Item[]; total: number; all: number };
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
    [adding, setAdding] = useState(false),
    [draft, setDraft] = useState<CatalogRow>({ reference: "", description: "", brand: "", unit: "ud", price: "" }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data, mutate, isLoading } = useSWR(`/api/search/catalog?limit=100&q=${encodeURIComponent(term)}`, fetcher);
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
      {!data ? (
        <div className="skeleton" style={{ height: 220, borderRadius: 16 }} role="status" aria-label="Cargando" />
      ) : data.items.length ? (
        <div className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Referencia</th><th>Descripción</th><th>Marca</th><th>Proveedor</th><th>Unidad</th><th>Precio</th><th /></tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.reference || "—"}</td>
                    <td style={{ whiteSpace: "normal" }}>{i.description}</td>
                    <td>{i.brand || "—"}</td>
                    <td>{i.supplier || "—"}</td>
                    <td>{i.unit}</td>
                    <td>{Number(i.price) > 0 ? eur(i.price) : <span className="muted">Sin precio</span>}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Borrar ${i.description}`}
                        className="text-button"
                        onClick={async () => {
                          await op("catalog-delete", { id: i.id }).catch((e) => setError(e.message));
                          await mutate();
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small-note" style={{ padding: "12px 20px" }}>
            {data.total > data.items.length ? `Mostrando ${data.items.length} de ${data.total}. Afina la búsqueda para ver el resto.` : `${data.total} artículos`}
          </p>
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
    </>
  );
}
