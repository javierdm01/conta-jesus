"use client";
import { useState } from "react";
import useSWR from "swr";
import { Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SupplierPicker } from "../supplier-picker";
import DocumentViewer from "./document-viewer";
import { boxesFromEvidence } from "@/lib/evidence-boxes";
import type { Doc, State } from "@/lib/workspace-types";

type Linkable = { id: string; kind: "PURCHASE" | "DELIVERY"; number: string; date: string; net: number | null };
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b as { linkable: Linkable[] };
};
const eur = (n: number | null) => (n == null ? "sin valorar" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n));

// Revisión de un abono de proveedor: datos del documento y facturas/albaranes a los que corrige.
export default function CreditReview({ doc, state: s, close, saved }: { doc: Doc; state: State; close: () => void; saved: () => Promise<void> }) {
  // Los abonos suelen venir en negativo: se guarda el importe en positivo, el abono ya resta solo.
  const abs = (v?: string) => (v ? String(Math.abs(Number(v))) : "");
  const [supplier, setSupplier] = useState(doc.suggestion?.supplierId ?? ""),
    [net, setNet] = useState(abs(doc.suggestion?.net)),
    [tax, setTax] = useState(abs(doc.suggestion?.tax)),
    [related, setRelated] = useState<string[]>([]),
    [auto, setAuto] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [checked, setChecked] = useState(false);
  const { data } = useSWR(supplier ? `/api/suppliers/accounts?supplierId=${supplier}` : null, fetcher);
  // El abono suele citar la factura que corrige («FRA. F02000R-122115»): se marca sola.
  if (data && !auto) {
    const cited = [...(doc.text ?? "").matchAll(/\bfra\.?\s*([A-Z]\w*-\d+)/gi)].map((m) => m[1].toUpperCase());
    const hit = data.linkable.filter((l) => l.kind === "PURCHASE" && cited.includes(l.number.toUpperCase())).map((l) => l.id);
    setAuto(true);
    if (hit.length) setRelated(hit);
  }
  return (
    <Dialog open wide title="Revisar abono de proveedor" onOpenChange={(v) => !v && !busy && close()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const f = new FormData(e.currentTarget);
            const res = await fetch("/api/operations/credit-confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId: doc.id, supplierId: supplier, number: f.get("number"), date: f.get("date"), net, tax, relatedIds: related, reviewed: checked }),
            });
            const body = await res.json();
            if (!res.ok) throw Error(body.error ?? "No se pudo guardar.");
            await saved();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <div className="review-split">
          <div className="review-original">
            <DocumentViewer documentId={doc.id} boxes={boxesFromEvidence(doc.suggestion?.evidence)} />
          </div>
          <div className="review-main">
            <p className="small-note mb-4">
              Un abono corrige una compra: resta de lo comprado al proveedor y de tu IVA soportado. No mueve el almacén.
            </p>
            <div className="form-grid">
              <div className="contents">
                <SupplierPicker suppliers={s.suppliers} value={supplier} initial={doc.suggestion?.supplier} onChange={(id) => { setSupplier(id); setRelated([]); }} />
              </div>
              <label>Número del abono<input name="number" required maxLength={200} defaultValue={doc.suggestion?.number ?? ""} /></label>
              <label>Fecha<input type="date" name="date" required defaultValue={doc.suggestion?.date ?? ""} /></label>
              <label>Base abonada (€)<input type="number" min="0" step="0.01" required value={net} onChange={(e) => setNet(e.target.value)} /></label>
              <label>IVA abonado (€)<input type="number" min="0" step="0.01" required value={tax} onChange={(e) => setTax(e.target.value)} /></label>
            </div>
            <fieldset className="full" style={{ marginTop: 14 }}>
              <legend>Facturas o albaranes que corrige</legend>
              {!supplier && <p className="small-note">Elige primero el proveedor.</p>}
              {supplier && !data && <p className="small-note">Cargando documentos del proveedor…</p>}
              {data && !data.linkable.length && <p className="small-note">Este proveedor aún no tiene facturas ni albaranes confirmados.</p>}
              <div style={{ maxHeight: 260, overflow: "auto", display: "grid", gap: 6 }}>
                {data?.linkable.map((l) => (
                  <label className="check-panel" key={l.id}>
                    <input
                      type="checkbox"
                      checked={related.includes(l.id)}
                      onChange={(e) => setRelated(e.target.checked ? [...related, l.id] : related.filter((x) => x !== l.id))}
                    />
                    {l.kind === "PURCHASE" ? "Factura" : "Albarán"} {l.number} · {l.date.split("-").reverse().join("/")} · {eur(l.net)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="check-panel" style={{ marginTop: 14 }}>
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} required />
              He comprobado los datos con el original.
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="form-footer">
              <Button type="button" variant="outline" disabled={busy} onClick={close}>Cancelar</Button>
              <Button loading={busy} disabled={!supplier}>
                {busy ? "Guardando…" : "Guardar abono"}
                {!busy && <Check size={16} />}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
