"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { PurchaseOrderData } from "@/lib/purchase-orders";
import { useSWRConfig } from "swr";
import {
  Package,
  Plus,
  Trash2,
  Download,
  Check,
  ArrowRight,
} from "lucide-react";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { SupplierPicker } from "../supplier-picker";
import type { Doc, State } from "@/lib/workspace-types";
import { cents, dec, sum, documentLineNet } from "@/lib/money";
import { receiptReconciliationLines } from "@/lib/receipt-reconciliation";

type Line = {
  key: string;
  description: string;
  reference: string;
  quantity: string;
  unit: string;
  price: string;
  discount: string;
  jobId: string;
  lotId: string;
  brand: string;
  model: string;
  location: string;
  orderLineId: string;
  financial: boolean;
  receiptNumber?: string;
};
const euro = (s: string) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    Number(s),
  );
export default function StockDocumentReview({
  doc,
  state: s,
  close,
  saved,
}: {
  doc: Doc;
  state: State;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const router = useRouter(),
    { mutate } = useSWRConfig();
  const params = useSearchParams();
  const [receiptIds, setReceiptIds] = useState<string[]>([]);
  const orderFilter = params.get("pedido");
  const { data: orders, error: orderError } = useSWR<PurchaseOrderData>(
    "/api/purchase-orders",
    async (url: string) => {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    },
  );
  const blank = (): Line => ({
    key: crypto.randomUUID(),
    description: "",
    reference: "",
    quantity: "",
    unit: "ud",
    price: "",
    discount: "0",
    jobId: doc.jobId ?? "",
    lotId: "",
    brand: "",
    model: "",
    location: "",
    orderLineId: "",
    financial: false,
  });
  const [destination, setDestination] = useState(
      doc.kind === "DELIVERY"
        ? "STOCK"
        : doc.kind === "PURCHASE" &&
            doc.suggestion?.supplierId &&
            s.documents.some(
              (r) =>
                r.kind === "DELIVERY" &&
                r.status === "CONFIRMED" &&
                r.supplierId === doc.suggestion?.supplierId &&
                !r.replacedBy &&
                r.stockLots?.length &&
                !r.stockLots.some((l) => l.invoiceDocumentId),
            )
          ? "RECONCILE"
          : "JOB",
    ),
    [supplier, setSupplier] = useState(doc.suggestion?.supplierId ?? ""),
    [source, setSource] = useState(""),
    [net, setNet] = useState(doc.suggestion?.net ?? ""),
    [tax, setTax] = useState(doc.suggestion?.tax ?? ""),
    [unpriced, setUnpriced] = useState(
      doc.kind === "DELIVERY" &&
        (!doc.suggestion?.lines.length ||
          doc.suggestion.lines.some((l) => !l.price)),
    ),
    [lines, setLines] = useState<Line[]>(() =>
      doc.suggestion?.lines.length
        ? doc.suggestion.lines.map((l) => ({
            ...blank(),
            ...l,
            price: l.price || l.observedUnitPrice || "",
          }))
        : [blank()],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const receipts = s.documents.filter(
    (d) =>
      d.kind === "DELIVERY" &&
      d.status === "CONFIRMED" &&
      !d.replacedBy &&
      !d.stockLots?.some((l) => l.invoiceDocumentId) &&
      d.supplierId === supplier,
  );
  const update = (key: string, k: keyof Line, value: string | boolean) =>
    setLines((rows) =>
      rows.map((l) => (l.key === key ? { ...l, [k]: value } : l)),
    );
  const unknown = destination === "STOCK" && unpriced;
  let total = "0.00";
  try {
    total = cents(
      sum(
        lines.map((l) =>
          l.quantity && l.price
            ? documentLineNet(l.quantity, l.price, l.discount)
            : 0,
        ),
      ),
    );
  } catch {}
  function changeReceipts(ids: string[]) {
    setReceiptIds(ids);
    setLines([
      ...receiptReconciliationLines(
        receipts.filter((r) => ids.includes(r.id)),
        doc.suggestion?.lines,
      ).map((l) => ({ ...blank(), ...l })),
      ...(doc.suggestion?.lines ?? [])
        .filter((l) => l.financial)
        .map((l) => ({ ...blank(), ...l })),
    ]);
  }
  return (
    <Dialog
      open
      wide
      title={
        doc.kind === "DELIVERY"
          ? "Revisar albarán y recibir material"
          : "Revisar factura de compra"
      }
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const form = new FormData(e.currentTarget),
              action =
                destination === "STOCK"
                  ? "stock-confirm"
                  : destination === "RECONCILE"
                    ? "stock-reconcile"
                    : "review";
            const payload = {
              documentId: doc.id,
              supplierId: supplier,
              number: form.get("number"),
              date: form.get("date"),
              net: unknown ? null : form.get("net"),
              tax: unknown ? null : form.get("tax"),
              supersedesId: source || undefined,
              receiptIds: destination === "RECONCILE" ? receiptIds : undefined,
              valuationPending: unknown,
              reviewed: form.get("reviewed") === "on",
              lines: lines.map(({ key: _, ...l }) => ({
                ...l,
                jobId: l.jobId || undefined,
                lotId: l.lotId || undefined,
                orderLineId:
                  destination === "STOCK"
                    ? l.orderLineId || undefined
                    : undefined,
                price: l.price || null,
              })),
            };
            const res = await fetch(`/api/operations/${action}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw Error(data.error);
            await Promise.allSettled([
              mutate("/api/inventory"),
              mutate("/api/purchase-orders"),
            ]);
            await saved();
            if (destination !== "JOB")
              router.push(
                destination === "RECONCILE"
                  ? "/inventario"
                  : `/inventario?albaran=${doc.id}`,
              );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="small-note mb-4">
          Comprueba los datos del documento y los artículos. El material y los
          costes se registrarán cuando pulses el botón de guardar.
        </p>
        {!doc.suggestion?.lines.length && (
          <p className="error mb-4" role="alert">
            No hemos podido completar los artículos automáticamente. Abre el
            original y rellena los datos que falten; también puedes volver a
            leer el documento al final de este formulario.
          </p>
        )}
        <div className="document-purpose">
          <Package size={26} />
          <div>
            <strong>
              {doc.kind === "PURCHASE"
                ? "¿Qué quieres hacer con esta factura?"
                : "¿Dónde va este material?"}
            </strong>
            <select
              aria-label="Destino del material"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                setSource("");
                setReceiptIds([]);
                if (e.target.value === "JOB")
                  setLines((rows) =>
                    rows.map((l) => ({
                      ...l,
                      jobId: l.jobId || s.jobs[0]?.id || "",
                    })),
                  );
              }}
            >
              <option value="STOCK">Recibir material en almacén</option>
              <option value="JOB">
                Material usado directamente en un trabajo
              </option>
              {doc.kind === "PURCHASE" && (
                <option value="RECONCILE">
                  Asociar factura a albaranes recibidos
                </option>
              )}
            </select>
            <p className="small-note">
              {destination === "STOCK"
                ? "El material entra en existencias. Su coste se asignará al trabajo cuando registres su uso."
                : destination === "RECONCILE"
                  ? "Se conservan los códigos y las cantidades. La factura actualiza el coste del material, incluido el ya utilizado."
                  : "Los importes se incorporan directamente al trabajo; no se crean existencias."}
            </p>
          </div>
        </div>
        <div className="review-grid simple-review-grid">
          <details className="simple-options review-original">
            <summary>Ver documento original y datos leídos</summary>
            <a
              className="text-button inline-flex gap-2"
              href={`/api/documents/${doc.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={16} />
              Abrir original
            </a>
            {doc.mime?.startsWith("image/") && (
              <img
                src={`/api/documents/${doc.id}`}
                alt="Factura original para comprobar los datos"
                className="w-full rounded-xl mt-3"
                loading="lazy"
              />
            )}
            <details className="mt-3">
              <summary className="text-button">Ver texto del OCR</summary>
              <pre className="ocr-text">
                {doc.text ||
                  "No se ha podido leer el texto. Completa los campos comprobando el original."}
              </pre>
            </details>
            <p className="small-note mt-3">
              Las propuestas OCR necesitan revisión. Comprueba especialmente
              referencias, unidades y cantidades.
            </p>
            {doc.suggestion?.warnings.map((w, i) => (
              <p className="small-note mt-2" key={i}>
                {w}
              </p>
            ))}
          </details>
          <div>
            <h3 className="review-step">1. Proveedor y documento</h3>
            <div className="form-grid">
              <SupplierPicker
                suppliers={s.suppliers}
                value={supplier}
                initial={doc.suggestion?.supplier}
                onChange={(id) => {
                  setSupplier(id);
                  setSource("");
                  setReceiptIds([]);
                  setLines((rows) =>
                    destination === "RECONCILE"
                      ? []
                      : rows.map((l) => ({ ...l, orderLineId: "" })),
                  );
                }}
              />
              <label>
                Número del documento
                <input
                  name="number"
                  defaultValue={doc.suggestion?.number ?? ""}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Fecha
                <input
                  type="date"
                  name="date"
                  defaultValue={doc.suggestion?.date ?? ""}
                  required
                />
              </label>
              <label>
                Base neta (€)
                <input
                  name="net"
                  type="number"
                  min="0"
                  step="0.01"
                  required={!unknown}
                  disabled={unknown}
                  value={net}
                  onChange={(e) => setNet(e.target.value)}
                />
              </label>
              <label>
                Impuestos (€)
                <input
                  name="tax"
                  type="number"
                  min="0"
                  step="0.01"
                  required={!unknown}
                  disabled={unknown}
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </label>
              {doc.kind === "DELIVERY" && destination === "STOCK" && (
                <label className="full check-panel">
                  <input
                    type="checkbox"
                    checked={unpriced}
                    onChange={(e) => setUnpriced(e.target.checked)}
                  />
                  Coste pendiente de factura. Los precios unitarios indicados
                  son provisionales y no valoran todavía el material.
                </label>
              )}
              {doc.kind === "PURCHASE" && destination === "RECONCILE" && (
                <fieldset className="full">
                  <legend>Albaranes incluidos en esta factura</legend>
                  <p className="small-note">
                    Selecciona uno o varios del mismo proveedor. Se conserva
                    cada lote y se aplica el coste de la factura sin recibir
                    material otra vez.
                  </p>
                  {receipts
                    .filter((r) => r.stockLots?.length)
                    .map((r) => (
                      <label className="check-panel" key={r.id}>
                        <input
                          type="checkbox"
                          checked={receiptIds.includes(r.id)}
                          onChange={(e) =>
                            changeReceipts(
                              e.target.checked
                                ? [...receiptIds, r.id]
                                : receiptIds.filter((id) => id !== r.id),
                            )
                          }
                        />
                        {r.number ?? r.originalName} · {r.stockLots!.length}{" "}
                        artículos
                      </label>
                    ))}
                  {!receipts.some((r) => r.stockLots?.length) && (
                    <p className="small-note">
                      No hay albaranes de almacén pendientes de factura de este
                      proveedor.
                    </p>
                  )}
                </fieldset>
              )}
              {doc.kind === "PURCHASE" && destination === "JOB" && (
                <label className="full">
                  Albarán al que sustituye (opcional)
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">Selecciona un albarán</option>
                    {receipts
                      .filter((d) => !d.stockLots?.length)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.number}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            {destination === "STOCK" && (
              <div className="small-note rounded-xl bg-teal-50 p-4">
                Los conceptos económicos se reparten proporcionalmente entre los
                lotes para conservar el coste total. Un mismo artículo repetido
                en varias filas se agrupa en un lote cuando coinciden
                descripción, referencia, unidad y precio. Las unidades de ese
                lote compartirán identificador.
              </div>
            )}
          </div>
        </div>
        {!unknown && (
          <div className="info-banner my-4">
            <div>
              <strong>
                Total factura: {euro(cents(dec(net || 0).plus(tax || 0)))}
              </strong>
              <p>
                Base de artículos: {euro(total)} · Diferencia con la base de
                factura: {euro(cents(dec(net || 0).minus(total)))}
              </p>
            </div>
          </div>
        )}
        <div className="flex justify-between gap-3 items-center my-6">
          <h3 className="font-bold">2. Artículos y cantidades</h3>
          <span className="pill">
            {lines.length} líneas{!unknown && ` · ${euro(total)}`}
          </span>
        </div>
        {lines.map((l, index) => (
          <div className="stock-review-line" key={l.key}>
            <div className="flex justify-between mb-3">
              <strong className="small-note">ARTÍCULO {index + 1}</strong>
              {l.receiptNumber && (
                <span className="small-note">Albarán {l.receiptNumber}</span>
              )}
              {destination !== "RECONCILE" && (
                <button
                  type="button"
                  aria-label={`Eliminar artículo ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((rows) => rows.filter((x) => x.key !== l.key))
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            {l.financial && (
              <p className="small-note mb-3">
                Ajuste económico · no crea existencias ni etiquetas.
              </p>
            )}
            <div className="form-grid">
              {destination === "STOCK" &&
                !l.financial &&
                orders?.orders.some(
                  (o) =>
                    o.supplier.id === supplier &&
                    ["OPEN", "PARTIAL"].includes(o.status),
                ) && (
                  <details
                    className="full simple-options"
                    open={!!orderFilter || !!l.orderLineId}
                  >
                    <summary>Vincular a un pedido (opcional)</summary>
                    <label className="full">
                      Línea de pedido que recibe (opcional)
                      <select
                        aria-label={`Línea de pedido del artículo ${index + 1}`}
                        value={l.orderLineId}
                        onChange={(e) => {
                          const ordered = orders?.orders
                            .flatMap((o) => o.lines)
                            .find((x) => x.id === e.target.value);
                          setLines((rows) =>
                            rows.map((x) =>
                              x.key === l.key
                                ? {
                                    ...x,
                                    orderLineId: e.target.value,
                                    description:
                                      x.description ||
                                      ordered?.description ||
                                      "",
                                    reference:
                                      x.reference || ordered?.reference || "",
                                  }
                                : x,
                            ),
                          );
                        }}
                      >
                        <option value="">Recepción sin pedido vinculado</option>
                        {orders?.orders
                          .filter(
                            (o) =>
                              o.supplier.id === supplier &&
                              ["OPEN", "PARTIAL"].includes(o.status) &&
                              (!orderFilter || o.id === orderFilter),
                          )
                          .flatMap((o) =>
                            o.lines
                              .filter((x) => Number(x.pending) > 0)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {o.number} · {x.reference || x.description} ·
                                  pendiente {x.pending} {x.unit}
                                </option>
                              )),
                          )}
                      </select>
                      {orderError && (
                        <span className="error">
                          No se pudieron consultar los pedidos. Actualiza antes
                          de vincular una entrega.
                        </span>
                      )}
                      <span className="small-note">
                        Indica la cantidad realmente recibida y comprueba
                        referencia y unidad. El precio del pedido no sustituye
                        al del documento.
                      </span>
                    </label>
                  </details>
                )}
              <label>
                Descripción
                <input
                  required
                  value={l.description}
                  onChange={(e) => update(l.key, "description", e.target.value)}
                />
              </label>
              <label>
                Referencia del proveedor
                <input
                  value={l.reference}
                  onChange={(e) => update(l.key, "reference", e.target.value)}
                />
              </label>
              <label>
                Cantidad recibida
                <input
                  type="number"
                  min={l.financial ? "-999999" : "0.0001"}
                  step="0.0001"
                  required
                  readOnly={destination === "RECONCILE" && !l.financial}
                  value={l.quantity}
                  onChange={(e) => update(l.key, "quantity", e.target.value)}
                />
              </label>
              <label>
                Unidad
                <select
                  value={l.unit}
                  disabled={destination === "RECONCILE"}
                  onChange={(e) => update(l.key, "unit", e.target.value)}
                >
                  {["ud", "m", "rollo", "pack", "kg", "l", "h"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              {unknown && (
                <label>
                  Precio unitario indicado (opcional)
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={l.price}
                    onChange={(e) => update(l.key, "price", e.target.value)}
                  />
                  <small>
                    Dato provisional del albarán; el coste se completará con la
                    factura.
                  </small>
                </label>
              )}
              {!unknown && (
                <>
                  <label>
                    Precio por unidad (€)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      required
                      value={l.price}
                      onChange={(e) => update(l.key, "price", e.target.value)}
                    />
                  </label>
                  <label>
                    Descuento (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.0001"
                      required
                      value={l.discount}
                      onChange={(e) =>
                        update(l.key, "discount", e.target.value)
                      }
                    />
                  </label>
                </>
              )}
              {destination === "JOB" && (
                <label>
                  {" "}
                  Trabajo al que corresponde
                  <select
                    required={destination === "JOB"}
                    value={l.jobId}
                    onChange={(e) => update(l.key, "jobId", e.target.value)}
                  >
                    <option value="">Selecciona el trabajo</option>
                    {s.jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.number} · {j.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(destination === "STOCK" || destination === "JOB") && (
                <details className="full simple-options">
                  <summary>
                    {destination === "STOCK"
                      ? "Ubicación y otras opciones"
                      : "Otras opciones del artículo"}
                  </summary>
                  <div className="form-grid">
                    {destination === "STOCK" && (
                      <>
                        <label className="full">
                          Reservar para un trabajo (opcional)
                          <select
                            value={l.jobId}
                            onChange={(e) =>
                              update(l.key, "jobId", e.target.value)
                            }
                          >
                            <option value="">Stock libre, sin reservar</option>
                            {s.jobs.map((j) => (
                              <option key={j.id} value={j.id}>
                                {j.number} · {j.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Ubicación en almacén
                          <input
                            placeholder="Estantería, cajón, furgoneta…"
                            value={l.location}
                            onChange={(e) =>
                              update(l.key, "location", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Marca (opcional)
                          <input
                            value={l.brand}
                            onChange={(e) =>
                              update(l.key, "brand", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Modelo (opcional)
                          <input
                            value={l.model}
                            onChange={(e) =>
                              update(l.key, "model", e.target.value)
                            }
                          />
                        </label>
                      </>
                    )}
                    <label className="full check-panel">
                      <input
                        type="checkbox"
                        checked={l.financial}
                        onChange={(e) =>
                          update(l.key, "financial", e.target.checked)
                        }
                      />
                      Es un porte, tasa, regalo o abono; no crea existencias.
                    </label>
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          type="button"
          onClick={() =>
            setLines((rows) => [
              ...rows,
              { ...blank(), financial: destination === "RECONCILE" },
            ])
          }
        >
          <Plus size={16} />
          {destination === "RECONCILE"
            ? "Añadir concepto económico"
            : "Añadir artículo"}
        </Button>
        <label className="check-panel mt-5">
          <input type="checkbox" name="reviewed" required />
          He revisado el original, las cantidades, las unidades y los datos de
          cada artículo.
        </label>
        {error && (
          <p className="error mt-4" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={close}
          >
            Revisar más tarde
          </Button>
          <details className="simple-options review-retry">
            <summary>Corregir la lectura automática</summary>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/operations/retry", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ documentId: doc.id }),
                  });
                  const d = await r.json();
                  if (!r.ok) throw Error(d.error);
                  await saved();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Leer documento otra vez
            </Button>
          </details>
          <Button
            disabled={
              busy ||
              !supplier ||
              (destination === "JOB" && !s.jobs.length) ||
              (destination === "RECONCILE" && !receiptIds.length)
            }
          >
            {busy
              ? "Guardando…"
              : destination === "STOCK"
                ? "Recibir material"
                : destination === "RECONCILE"
                  ? "Guardar factura"
                  : "Guardar costes"}
            {destination === "STOCK" ? (
              <ArrowRight size={16} />
            ) : (
              <Check size={16} />
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
