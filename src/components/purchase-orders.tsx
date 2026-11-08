"use client";
import { ListSkeleton } from "./skeletons";
import { uuid } from "@/lib/uuid";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, ShoppingCart, Trash2, PackageCheck } from "lucide-react";
import { Button } from "./ui/button";
import { SupplierPicker } from "./supplier-picker";
import { Dialog } from "./ui/dialog";
import type { Supplier } from "@/lib/workspace-types";
import type { PurchaseOrderData } from "@/lib/purchase-orders";
const names: Record<string, string> = {
  OPEN: "Pendiente",
  PARTIAL: "Recibido parcialmente",
  RECEIVED: "Recibido completo",
  CLOSED: "Pendiente cancelado",
};
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
export default function PurchaseOrders({
  suppliers,
}: {
  suppliers: Supplier[];
}) {
  const { data, error, mutate } = useSWR<PurchaseOrderData>(
    "/api/purchase-orders",
    async (url) => {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    },
    { refreshInterval: 60000 },
  );
  const [create, setCreate] = useState(false),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("pending");
  const [closing, setClosing] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const orders =
    data?.orders.filter(
      (o) =>
        [
          o.number,
          o.supplier.name,
          ...o.lines.map((l) => `${l.description} ${l.reference}`),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (status === "all" || ["OPEN", "PARTIAL"].includes(o.status)),
    ) ?? [];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">LO PEDIDO Y LO QUE FALTA</div>
          <h1 className="mt-2">Pedidos a proveedores</h1>
          <p className="subtitle">
            Cada entrega descuenta lo pendiente sin duplicar material.
          </p>
        </div>
        <Button onClick={() => setCreate(true)}>
          <Plus size={16} />
          Nuevo pedido
        </Button>
      </div>
      <div className="info-banner mb-5">
        <ShoppingCart size={22} />
        <div>
          <strong>Control interno de compras</strong>Crear un pedido no envía
          nada al proveedor, no añade existencias y no genera gastos. La entrada
          se confirma revisando su albarán.
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error.message}
          <button
            onClick={() => {
              void mutate().catch(() => {});
            }}
          >
            Reintentar
          </button>
        </p>
      )}
      {message && (
        <p className="inventory-notice" role="status">
          {message}
        </p>
      )}
      <div className="inventory-toolbar">
        <input
          aria-label="Buscar pedidos"
          placeholder="Pedido, proveedor o referencia…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Estado del pedido"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="pending">Con material pendiente</option>
          <option value="all">Todos los pedidos</option>
        </select>
      </div>
      {!data && !error && <ListSkeleton />}
      {data && !orders.length && (
        <div className="empty">
          <ShoppingCart size={30} />
          <h2>No hay pedidos con ese filtro</h2>
          <p>
            {suppliers.length
              ? "Registra lo que has pedido y vincula las entregas al revisar sus albaranes."
              : "Añade primero un proveedor."}
          </p>
        </div>
      )}
      {orders.map((o) => (
        <section className="panel" key={o.id}>
          <div className="panel-head">
            <div>
              <h2>
                {o.number} · {o.supplier.name}
              </h2>
              <p>
                {o.date.slice(0, 10)}
                {o.expectedAt &&
                  ` · Entrega prevista: ${o.expectedAt.slice(0, 10)}`}
              </p>
            </div>
            <span
              className={`pill ${o.status === "RECEIVED" ? "green" : "orange"}`}
            >
              {names[o.status]}
            </span>
          </div>
          <div className="order-lines">
            {o.lines.map((l) => (
              <div className="order-line" key={l.id}>
                <div>
                  <strong>{l.description}</strong>
                  <small>{l.reference || "Sin referencia"}</small>
                  <div className="flex gap-3 flex-wrap mt-2">
                    {l.receipts.map((r, i) => (
                      <Link
                        key={i}
                        className="text-button"
                        href={r.code ? `/inventario/${r.code}` : "/facturas"}
                      >
                        {r.document.number || "Albarán"}: {r.quantity} {l.unit}
                      </Link>
                    ))}
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Pedido</dt>
                    <dd>
                      {l.quantity} {l.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Recibido</dt>
                    <dd>
                      {l.received} {l.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Pendiente</dt>
                    <dd>
                      {l.pending} {l.unit}
                    </dd>
                  </div>
                  {Number(l.cancelled) > 0 && (
                    <div>
                      <dt>Cancelado</dt>
                      <dd>
                        {l.cancelled} {l.unit}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>
          {o.notes && (
            <p className="small-note px-6 pb-4 whitespace-pre-wrap">
              {o.notes}
            </p>
          )}
          {["OPEN", "PARTIAL"].includes(o.status) && (
            <div className="actions px-6 pb-5">
              <Button asChild>
                <Link href={`/facturas?pedido=${o.id}`}>
                  <PackageCheck size={16} />
                  Recibir albarán
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setClosing(o.id);
                  setReason("");
                }}
              >
                Cancelar lo pendiente
              </Button>
            </div>
          )}
        </section>
      ))}
      {create && (
        <OrderForm
          suppliers={suppliers}
          close={() => setCreate(false)}
          saved={async () => {
            setCreate(false);
            setStatus("all");
            setMessage(
              "Pedido guardado. Recibe el material revisando el albarán.",
            );
            await mutate();
          }}
        />
      )}
      {closing && (
        <Dialog
          open
          title="Cancelar material pendiente"
          onOpenChange={(open) => {
            if (!open && !busy) setClosing(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                const r = await fetch("/api/operations/order-close", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ orderId: closing, reason }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setClosing(null);
                setMessage(
                  "Pendiente cancelado. El material ya recibido conserva sus lotes y existencias.",
                );
                await mutate();
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="small-note mb-4">
              Se cancela únicamente lo que todavía no se ha recibido. Esta
              acción no devuelve material al proveedor.
            </p>
            <label>
              Motivo de cancelación
              <textarea
                required
                minLength={5}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {message && (
              <p role="alert" className="error">
                {message}
              </p>
            )}
            <div className="form-footer">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setClosing(null)}
              >
                Volver
              </Button>
              <Button disabled={busy}>Confirmar cancelación</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
function OrderForm({
  suppliers,
  close,
  saved,
}: {
  suppliers: Supplier[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const blank = () => ({
    key: uuid(),
    description: "",
    reference: "",
    quantity: "",
    unit: "ud",
    price: "",
  });
  const [lines, setLines] = useState(() => [blank()]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [requestKey] = useState(() => uuid());
  return (
    <Dialog
      open
      wide
      title="Nuevo pedido de compra"
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const f = new FormData(e.currentTarget);
            const r = await fetch("/api/operations/order-create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                supplierId: f.get("supplierId"),
                number: f.get("number"),
                date: f.get("date"),
                expectedAt: f.get("expectedAt") || undefined,
                notes: f.get("notes"),
                requestKey,
                lines: lines.map(({ key, ...l }) => ({
                  ...l,
                  price: l.price || null,
                })),
              }),
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
        <div className="form-grid">
          <SupplierPicker
            suppliers={suppliers}
            value={supplierId}
            onChange={setSupplierId}
            name="supplierId"
          />
          <label>
            Número de pedido
            <input
              name="number"
              required
              maxLength={200}
              defaultValue={`PC-${today().replaceAll("-", "")}-${requestKey.slice(0, 4).toUpperCase()}`}
            />
          </label>
          <label>
            Fecha del pedido
            <input name="date" type="date" required defaultValue={today()} />
          </label>
          <label>
            Entrega prevista
            <input name="expectedAt" type="date" />
          </label>
        </div>
        {lines.map((l, i) => (
          <div className="stock-review-line" key={l.key}>
            <div className="flex justify-between mb-3">
              <strong>Artículo {i + 1}</strong>
              <button
                type="button"
                aria-label={`Eliminar línea ${i + 1}`}
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((rows) => rows.filter((x) => x.key !== l.key))
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="form-grid">
              {(
                [
                  ["description", "Descripción"],
                  ["reference", "Referencia"],
                  ["quantity", "Cantidad pedida"],
                  ["price", "Precio orientativo"],
                ] as const
              ).map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    required={k === "description" || k === "quantity"}
                    type={k === "price" || k === "quantity" ? "number" : "text"}
                    min={k === "quantity" ? 0.0001 : 0}
                    step="0.0001"
                    value={l[k]}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((x) =>
                          x.key === l.key ? { ...x, [k]: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <label>
                Unidad del pedido
                <select
                  value={l.unit}
                  onChange={(e) =>
                    setLines((rows) =>
                      rows.map((x) =>
                        x.key === l.key ? { ...x, unit: e.target.value } : x,
                      ),
                    )
                  }
                >
                  {["ud", "m", "rollo", "pack", "kg", "l", "h"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={lines.length >= 200}
          onClick={() => setLines((rows) => [...rows, blank()])}
        >
          <Plus size={16} />
          Añadir artículo
        </Button>
        <label className="mt-4">
          Notas del pedido
          <textarea name="notes" maxLength={2000} />
        </label>
        <p className="small-note mt-3">
          El precio es orientativo. La valoración del stock se revisa con el
          albarán o factura.
        </p>
        {error && (
          <p role="alert" className="error">
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
            Cancelar
          </Button>
          <Button disabled={busy}>Guardar pedido</Button>
        </div>
      </form>
    </Dialog>
  );
}
