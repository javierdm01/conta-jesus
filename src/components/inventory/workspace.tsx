"use client";
import { uuid } from "@/lib/uuid";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import useSWR, { useSWRConfig } from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Package,
  ScanLine,
  Printer,
  Search,
  ArrowLeft,
  ArrowUpRight,
  MapPin,
  Clock,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bookmark,
  Undo2,
  FileText,
  SlidersHorizontal,
  Check,
  Tag,
  ClipboardCheck,
  Download,
  RefreshCw,
} from "lucide-react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import type { InventoryData, InventoryLot } from "@/lib/inventory-types";
import type { Job } from "@/lib/workspace-types";
import { dec, sum } from "@/lib/money";
import { lotIdentifier } from "@/lib/inventory-math";
import { filterInventory, inventoryCsv, lowStock } from "@/lib/inventory-view";
import type { SaleProduct } from "../sale-products";
const CountForm = dynamic(() => import("./count-form"));
const Scanner = dynamic(() => import("./scanner"), {
  ssr: false,
  loading: () => <p className="p-5">Preparando cámara…</p>,
});
const n = (s: string | number) =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 }).format(
    Number(s),
  );
const euro = (s: string | null | undefined) =>
  s == null
    ? "Pendiente de precio"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
      }).format(Number(s));
const date = (s: string) =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(s));
const movementNames: Record<string, string> = {
  RECEIVE: "Recepción de material",
  USE: "Usado en trabajo",
  RETURN: "Devuelto al almacén",
  SUPPLIER_RETURN: "Devuelto al proveedor",
  RESERVE: "Reservado para trabajo",
  RELEASE: "Reserva liberada",
  COUNT_OUT: "Faltante en recuento",
  COUNT_IN: "Material recuperado en recuento",
};

export default function InventoryWorkspace({
  jobs,
  selectedCode,
  onChanged,
  onInvoiceProduct,
}: {
  jobs: Job[];
  selectedCode?: string;
  onChanged: () => Promise<void>;
  onInvoiceProduct?: (product: SaleProduct) => void;
}) {
  const router = useRouter(),
    params = useSearchParams(),
    receiptId = params.get("albaran"),
    defaultJob = params.get("trabajo") ?? undefined;
  const { mutate: mutateSearch } = useSWRConfig();
  const { data, error, mutate, isLoading } = useSWR<InventoryData>(
    "/api/inventory",
    async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    },
    {
      dedupingInterval: 10000,
      revalidateOnFocus: true,
      refreshInterval: 60000,
    },
  );
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("available"),
    [location, setLocation] = useState(""),
    [supplier, setSupplier] = useState(""),
    [order, setOrder] = useState("newest"),
    [selected, setSelected] = useState<Record<string, boolean>>({}),
    [printLots, setPrintLots] = useState<InventoryLot[] | null>(null),
    [scanner, setScanner] = useState(false),
    [move, setMove] = useState<{ lot: InventoryLot; kind: string } | null>(
      null,
    ),
    [edit, setEdit] = useState<InventoryLot | null>(null),
    [count, setCount] = useState<InventoryLot | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (receiptId) {
      setFilter("all");
      setSearch("");
      setLocation("");
      setSupplier("");
    }
  }, [receiptId]);
  const filtered = useMemo(() => {
    return filterInventory(data?.lots ?? [], {
      search,
      status: filter,
      receiptId,
      location,
      supplier,
      order,
    });
  }, [data, search, filter, receiptId, location, supplier, order]);
  const lotHref = (code?: string) =>
    `/inventario${code ? `/${code}` : ""}${defaultJob ? `?trabajo=${encodeURIComponent(defaultJob)}` : ""}`;
  const after = async () => {
    setMove(null);
    setEdit(null);
    setCount(null);
    const refreshed = await Promise.allSettled([
      mutate(),
      onChanged(),
      mutateSearch(
        (key) =>
          typeof key === "string" && key.startsWith("/api/search/products"),
        undefined,
        { revalidate: true },
      ),
    ]);
    setNotice(
      refreshed.some((r) => r.status === "rejected")
        ? "Operación guardada. No se pudo actualizar toda la pantalla; pulsa Actualizar existencias."
        : "Operación guardada. Existencias y costes actualizados.",
    );
  };
  if (isLoading || !data)
    return (
      <section className="inventory-loading" role="status">
        <div className="skeleton h-10 w-60" />
        <div className="inventory-skeleton-grid">
          {[1, 2, 3, 4].map((x) => (
            <div key={x} className="skeleton h-36" />
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error.message}
            <button onClick={() => mutate()}>Reintentar</button>
          </p>
        )}
      </section>
    );
  const lot = selectedCode
    ? data.lots.find((l) => l.code === selectedCode.toUpperCase())
    : undefined;
  const choose = (l: InventoryLot, kind: string) => setMove({ lot: l, kind });
  const actions = (l: InventoryLot) => (
    <div className="actions">
      <Button onClick={() => choose(l, "USE")} disabled={!dec(l.onHand).gt(0)}>
        <ArrowUpFromLine size={16} />
        Registrar uso
      </Button>
      <Button
        variant="outline"
        onClick={() => choose(l, "RESERVE")}
        disabled={!dec(l.available).gt(0)}
      >
        <Bookmark size={16} />
        Reservar
      </Button>
      {data.isAdmin && dec(l.available).gt(0) && (
        <Button variant="outline" onClick={() => choose(l, "SUPPLIER_RETURN")}>
          Devolver al proveedor
        </Button>
      )}
      {data.isAdmin && (
        <Button variant="outline" onClick={() => setCount(l)}>
          <ClipboardCheck size={16} />
          Recuento físico
        </Button>
      )}
      <Button variant="outline" onClick={() => setPrintLots([l])}>
        <Printer size={16} />
        Etiquetas
      </Button>
      {l.movements.some(
        (m) => m.kind === "USE" && dec(m.returnable).gt(0) && m.job,
      ) && (
        <Button variant="outline" onClick={() => choose(l, "RETURN")}>
          <Undo2 size={16} />
          Devolver sobrante
        </Button>
      )}
    </div>
  );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">CADA PIEZA, EN SU SITIO</div>
          <h1 className="mt-2">
            {selectedCode
              ? lot?.alias || lot?.description || "Artículo no disponible"
              : "Tu almacén, al día"}
          </h1>
          <p className="subtitle">
            {selectedCode
              ? "Un lote, un código y todo su recorrido."
              : "Del albarán a la estantería. De la estantería al trabajo."}
          </p>
        </div>
        <div className="actions inventory-head-actions">
          <Button
            variant="outline"
            onClick={() => {
              void mutate().catch(() => {});
            }}
          >
            <RefreshCw size={16} />
            Actualizar existencias
          </Button>
          <Button variant="outline" onClick={() => setScanner(true)}>
            <ScanLine size={17} />
            Escanear código
          </Button>
          {!selectedCode && (
            <Button
              onClick={() =>
                setPrintLots(data.lots.filter((l) => selected[l.code]))
              }
              disabled={!Object.values(selected).some(Boolean)}
            >
              <Printer size={17} />
              Preparar etiquetas
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}
      {notice && (
        <div className="inventory-notice" role="status">
          <Check size={16} />
          {notice}
          <button onClick={() => setNotice("")}>Cerrar</button>
        </div>
      )}
      {selectedCode ? (
        lot ? (
          <>
            <Link
              href={lotHref()}
              prefetch
              className="text-button inline-flex items-center gap-2 mb-5"
            >
              <ArrowLeft size={15} />
              Volver al almacén
            </Link>
            <section className="lot-hero">
              <div className="lot-hero-mark">
                <Package size={36} />
              </div>
              <div className="flex-1">
                {lot.alias && (
                  <p className="small-note">
                    Descripción del proveedor: {lot.description}
                  </p>
                )}
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="lot-code">{lot.code}</span>
                  <StockBadge lot={lot} />
                </div>
                <p className="mt-3">
                  {lot.reference ? `Ref. ${lot.reference} · ` : ""}
                  {[lot.brand, lot.model].filter(Boolean).join(" ") ||
                    lot.family}
                </p>
                <div className="small-note flex gap-2 items-center mt-1">
                  <MapPin size={14} />
                  {lot.location || "Ubicación pendiente"}
                </div>
              </div>
              <div className="lot-hero-quantity">
                <strong>{n(lot.onHand)}</strong>
                <span>{lot.unit} en almacén</span>
              </div>
            </section>
            <div className="stats">
              <StockStat
                icon={Boxes}
                title="Recibido"
                value={`${n(lot.received)} ${lot.unit}`}
                note="Cantidad original de este lote"
              />
              <StockStat
                icon={Package}
                title="Libre para usar"
                value={`${n(lot.available)} ${lot.unit}`}
                note="Existencias menos reservas"
              />
              <StockStat
                icon={Bookmark}
                title="Reservado"
                value={`${n(lot.reserved)} ${lot.unit}`}
                note="Ya apartado para trabajos"
              />
              <StockStat
                icon={Tag}
                title={data.isAdmin ? "Valor en almacén" : "Ubicación"}
                value={
                  data.isAdmin
                    ? euro(lot.remainingValue)
                    : lot.location || "Sin ubicar"
                }
                note={
                  lot.valued
                    ? "El coste sale del stock al usarlo"
                    : "Pendiente de valorar con factura"
                }
              />
            </div>
            {actions(lot)}
            {data.isAdmin && (
              <div className="product-pricing">
                <div>
                  <strong>
                    Venta recomendada: {euro(lot.recommendedPrice)}
                    {lot.recommendedPrice != null ? ` / ${lot.unit}` : ""}
                  </strong>
                  <p>
                    Coste unitario + 30 %, sin IVA.{" "}
                    {lot.recommendedPrice == null
                      ? "Se calculará al conocer el coste."
                      : "Puedes ajustar el precio al facturar."}
                  </p>
                </div>
                {onInvoiceProduct && (
                  <Button onClick={() => onInvoiceProduct(lot)}>
                    Añadir a factura
                  </Button>
                )}
              </div>
            )}
            {!lot.valued && (
              <div className="info-banner mt-5">
                <Clock size={22} />
                <div>
                  <strong>Material pendiente de precio</strong>Las cantidades
                  están controladas. Los consumos se incorporarán al coste del
                  trabajo cuando vincules la factura del proveedor.
                </div>
              </div>
            )}
            <div className="two-col mt-6">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Historial del artículo</h2>
                    <p>Entradas, salidas, reservas y devoluciones.</p>
                  </div>
                </div>
                <div className="stock-timeline">
                  {lot.movements.map((m) => (
                    <div
                      className={`stock-event ${m.kind.toLowerCase()}`}
                      key={m.id}
                    >
                      <span className="stock-event-dot" />
                      <div className="flex-1">
                        <strong>{movementNames[m.kind]}</strong>
                        <small>
                          {date(m.createdAt)}
                          {m.job && (
                            <>
                              {" "}
                              ·{" "}
                              <Link
                                className="text-button"
                                href={`/trabajos/${m.job.id}`}
                              >
                                {m.job.number}
                              </Link>
                            </>
                          )}
                        </small>
                        {m.notes && <p>{m.notes}</p>}
                      </div>
                      <div className="text-right">
                        <strong>
                          {["USE", "SUPPLIER_RETURN", "COUNT_OUT"].includes(
                            m.kind,
                          )
                            ? "−"
                            : ["RECEIVE", "RETURN", "COUNT_IN"].includes(m.kind)
                              ? "+"
                              : ""}
                          {n(m.quantity)} {lot.unit}
                        </strong>
                        {data.isAdmin &&
                          ["USE", "RETURN", "COUNT_IN", "COUNT_OUT"].includes(
                            m.kind,
                          ) && <small>{euro(m.amount)}</small>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div>
                {data.isAdmin && (
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Recuentos físicos</h2>
                    </div>
                    <div className="record-list">
                      {lot.counts?.length ? (
                        lot.counts.map((c) => (
                          <div className="record" key={c.id}>
                            <div>
                              <strong>
                                {n(c.expected)} → {n(c.counted)} {lot.unit}
                              </strong>
                              <small>
                                {date(c.createdAt)} · {c.userName}
                              </small>
                              <p className="small-note">{c.reason}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="small-note pb-5">
                          Todavía no se ha registrado un recuento de este lote.
                        </p>
                      )}
                    </div>
                  </section>
                )}
                <section className="panel">
                  <div className="panel-head">
                    <h2>Ficha del material</h2>
                    {data.isAdmin && (
                      <button
                        className="text-button"
                        onClick={() => setEdit(lot)}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                  <dl className="lot-facts">
                    <Fact label="Identificador" value={lot.code} />
                    <Fact
                      label="Referencia"
                      value={lot.reference || "No indicada"}
                    />
                    <Fact
                      label="Marca / modelo"
                      value={
                        [lot.brand, lot.model].filter(Boolean).join(" ") ||
                        "No indicado"
                      }
                    />
                    <Fact
                      label="Ubicación"
                      value={lot.location || "Sin ubicar"}
                    />
                    <Fact
                      label="Aviso de mínimo"
                      value={
                        Number(lot.minimum) > 0
                          ? `${n(lot.minimum)} ${lot.unit}`
                          : "Sin aviso configurado"
                      }
                    />
                    {data.isAdmin && (
                      <>
                        <Fact
                          label="Proveedor"
                          value={lot.document?.supplier?.name || "No indicado"}
                        />
                        <Fact
                          label="Albarán de origen"
                          value={lot.document?.number || "No indicado"}
                        />
                        {lot.invoice && (
                          <Fact
                            label="Factura vinculada"
                            value={lot.invoice.number || "Registrada"}
                          />
                        )}
                      </>
                    )}
                    {lot.notes && <Fact label="Notas" value={lot.notes} />}
                  </dl>
                  {data.isAdmin && lot.document && (
                    <a
                      className="text-button inline-flex items-center gap-2 px-6 pb-5"
                      href={`/api/documents/${lot.document.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText size={15} />
                      Abrir documento original
                      <ArrowUpRight size={14} />
                    </a>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <h2>Material reservado</h2>
                  </div>
                  <div className="record-list">
                    {lot.reservations.length ? (
                      lot.reservations.map((r) => (
                        <div className="record" key={r.id}>
                          <div>
                            <strong>{r.job?.name ?? "Otro trabajo"}</strong>
                            <small>
                              {n(r.quantity)} {lot.unit}
                            </small>
                          </div>
                          {r.job && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => choose(lot, "RELEASE")}
                            >
                              Liberar
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="small-note pb-5">
                        Este lote no tiene reservas.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">
            <Package size={36} />
            <h2>No se encuentra este identificador en tu empresa</h2>
            <p>Revisa el código o vuelve a escanear la etiqueta.</p>
            <Link href="/inventario" className="text-button">
              Volver al almacén
            </Link>
          </div>
        )
      ) : (
        <>
          <details className="inventory-summary">
            <summary>Resumen del almacén · {data.lots.length} lotes</summary>
            <div className="stats">
              <StockStat
                icon={Boxes}
                title="Lotes en almacén"
                value={String(
                  data.lots.filter((l) => dec(l.onHand).gt(0)).length,
                )}
                note="Artículos con unidades disponibles"
              />
              <StockStat
                icon={Bookmark}
                title="Lotes con reserva"
                value={String(
                  data.lots.filter((l) => dec(l.reserved).gt(0)).length,
                )}
                note="Apartados para próximos trabajos"
              />
              <StockStat
                icon={ArrowUpFromLine}
                title="Salidas a trabajos"
                value={String(
                  data.lots.reduce(
                    (a, l) =>
                      a + l.movements.filter((m) => m.kind === "USE").length,
                    0,
                  ),
                )}
                note="Consumos con fecha y destino"
              />
              <StockStat
                icon={Tag}
                title={
                  data.isAdmin
                    ? "Valor conocido en stock"
                    : "Lotes pendientes de precio"
                }
                value={
                  data.isAdmin
                    ? euro(
                        sum(
                          data.lots.map((l) => l.remainingValue ?? 0),
                        ).toString(),
                      )
                    : String(data.lots.filter((l) => !l.valued).length)
                }
                note={`${data.lots.filter((l) => !l.valued && dec(l.onHand).gt(0)).length} lotes pendientes de valorar`}
              />
            </div>
          </details>
          {data.lots.some(lowStock) && (
            <div className="inventory-source-note">
              <span>
                {data.lots.filter(lowStock).length} lotes en mínimo de material
                libre
              </span>
              <button
                className="text-button"
                onClick={() => {
                  setFilter("low");
                  setSearch("");
                  setLocation("");
                  setSupplier("");
                }}
              >
                Revisar mínimos
              </button>
            </div>
          )}
          {receiptId && (
            <div className="inventory-source-note">
              <span>Material del albarán seleccionado</span>
              <Link href="/inventario">Ver todo el almacén</Link>
            </div>
          )}
          <div className="inventory-toolbar">
            <div className="inventory-search">
              <Search size={17} />
              <input
                aria-label="Buscar material o código"
                placeholder="Nombre, alias, referencia, marca, proveedor…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (!search.trim() && e.target.value.trim()) setFilter("all");
                  if (lotIdentifier(e.target.value)) setFilter("all");
                }}
                onKeyDown={(e) => {
                  const code = lotIdentifier(search);
                  if (e.key === "Enter" && code) router.push(lotHref(code));
                }}
              />
            </div>
            <select
              aria-label="Estado de existencias"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="available">Con existencias</option>
              <option value="free">Con material libre</option>
              <option value="all">Todos los lotes</option>
              <option value="reserved">Con reservas</option>
              <option value="empty">Agotados</option>
              <option value="unpriced">Pendientes de precio</option>
              <option value="low">En mínimo de material libre</option>
            </select>
            <details className="inventory-more-filters">
              <summary>Más filtros</summary>
              <div>
                <select
                  aria-label="Ubicación del material"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="">Todas las ubicaciones</option>
                  <option value="__empty">Sin ubicación</option>
                  {[
                    ...new Set(
                      data.lots.map((l) => l.location).filter(Boolean),
                    ),
                  ]
                    .sort()
                    .map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                </select>
                {data.isAdmin && (
                  <select
                    aria-label="Proveedor del material"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                  >
                    <option value="">Todos los proveedores</option>
                    {[
                      ...new Set(
                        data.lots
                          .map((l) => l.document?.supplier?.name)
                          .filter((v): v is string => !!v),
                      ),
                    ]
                      .sort()
                      .map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                  </select>
                )}
                <select
                  aria-label="Orden del material"
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                >
                  <option value="newest">Más recientes</option>
                  <option value="oldest">Más antiguos</option>
                  <option value="name">Nombre del artículo</option>
                </select>
              </div>
            </details>
            {(search || location || supplier) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setLocation("");
                  setSupplier("");
                  setFilter("all");
                  setOrder("newest");
                }}
              >
                Limpiar filtros
              </Button>
            )}
            <Button
              className="inventory-scan-mobile"
              variant="outline"
              onClick={() => setScanner(true)}
            >
              <ScanLine size={17} />
              Escanear
            </Button>
          </div>
          <div className="inventory-selection">
            <label>
              <input
                type="checkbox"
                aria-label="Seleccionar todos los materiales visibles"
                checked={
                  filtered.length > 0 && filtered.every((l) => selected[l.code])
                }
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    ...Object.fromEntries(
                      filtered.map((l) => [l.code, e.target.checked]),
                    ),
                  })
                }
              />
              {Object.values(selected).filter(Boolean).length
                ? `${Object.values(selected).filter(Boolean).length} seleccionados`
                : `${filtered.length} lotes`}
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!filtered.length}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([inventoryCsv(filtered, data.isAdmin)], {
                    type: "text/csv;charset=utf-8",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={15} />
              Exportar visibles CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!Object.values(selected).some(Boolean)}
              onClick={() =>
                setPrintLots(data.lots.filter((l) => selected[l.code]))
              }
            >
              <Printer size={15} />
              Etiquetas de seleccionados
            </Button>
          </div>
          {filtered.length ? (
            <div className="stock-card-grid">
              {filtered.map((l) => (
                <article className="stock-card" key={l.id}>
                  <div className="stock-card-top">
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${l.description}`}
                        checked={!!selected[l.code]}
                        onChange={(e) =>
                          setSelected({
                            ...selected,
                            [l.code]: e.target.checked,
                          })
                        }
                      />
                      <span className="stock-item-icon">
                        <Package size={22} />
                      </span>
                    </label>
                    <StockBadge lot={l} />
                  </div>
                  <Link
                    prefetch
                    href={lotHref(l.code)}
                    className="stock-card-title"
                  >
                    {l.alias || l.description}
                    <ArrowUpRight size={15} />
                  </Link>
                  <p className="stock-card-ref">
                    {l.alias && (
                      <span className="product-original-name">
                        {l.description}
                      </span>
                    )}
                    {l.reference ? `Ref. ${l.reference}` : "Sin referencia"}
                    {l.brand && ` · ${l.brand}`}
                  </p>
                  <div className="stock-card-number">
                    <strong>
                      {n(l.onHand)}
                      <span>{l.unit}</span>
                    </strong>
                    <small>de {n(l.received)} recibidos</small>
                  </div>
                  <div className="stock-card-split">
                    <span>
                      <i className="stock-dot" />
                      {n(l.available)} libres
                    </span>
                    <span>{n(l.reserved)} reservados</span>
                  </div>
                  <div className="stock-card-location">
                    <MapPin size={14} />
                    {l.location || "Sin ubicación asignada"}
                  </div>
                  {data.isAdmin && (
                    <div className="stock-recommendation">
                      Venta recomendada{" "}
                      <strong>
                        {euro(l.recommendedPrice)}
                        {l.recommendedPrice != null ? ` / ${l.unit}` : ""}
                      </strong>
                      <small>Coste + 30 % · sin IVA</small>
                    </div>
                  )}
                  {lowStock(l) && (
                    <div className="stock-low">
                      Material libre en el mínimo configurado
                    </div>
                  )}
                  <div className="stock-card-bottom">
                    <span className="lot-code">{l.code}</span>
                    <button
                      title="Preparar etiquetas de este lote"
                      onClick={() => setPrintLots([l])}
                    >
                      <Printer size={17} />
                    </button>
                    <button
                      className="text-button"
                      disabled={!dec(l.onHand).gt(0)}
                      onClick={() => choose(l, "USE")}
                    >
                      Registrar uso
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="stock-empty">
              <div className="stock-empty-icon">
                <Boxes size={42} />
              </div>
              <span className="eyebrow">DEL ALBARÁN AL ALMACÉN</span>
              <h2>
                {data.lots.length
                  ? "No hay material con ese filtro"
                  : "Ponle nombre y código a cada artículo"}
              </h2>
              <p>
                {data.lots.length
                  ? "Cambia el estado o prueba otra referencia."
                  : "Sube un albarán, revisa sus artículos y confirma la recepción en almacén. Cada lote recibirá un código único para sus etiquetas."}
              </p>
              <div className="stock-empty-steps">
                <span>
                  <b>1</b>Sube el albarán
                </span>
                <span>
                  <b>2</b>Revisa los artículos
                </span>
                <span>
                  <b>3</b>Imprime las etiquetas
                </span>
              </div>
              <Button asChild>
                <Link href="/facturas">
                  Ir a albaranes
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
            </section>
          )}
          <div className="inventory-guide">
            <Tag size={22} />
            <p>
              <strong>Una ficha para las 20 unidades.</strong> Las etiquetas de
              un lote comparten código. Registra cada salida para saber cuánto
              queda y a qué trabajo se ha destinado. Las nuevas compras generan
              otro lote para conservar su fecha y coste.
            </p>
          </div>
        </>
      )}
      <Dialog
        open={scanner}
        onOpenChange={setScanner}
        title="Escanear una etiqueta"
      >
        {scanner && (
          <Scanner
            onResult={(value) => {
              const code = lotIdentifier(value);
              if (code) {
                setScanner(false);
                router.push(lotHref(code));
              } else setNotice("El código no es una etiqueta de Instala.");
            }}
          />
        )}
      </Dialog>
      {move && (
        <MovementForm
          lot={move.lot}
          kind={move.kind}
          defaultJob={defaultJob}
          jobs={jobs}
          isAdmin={data.isAdmin}
          close={() => setMove(null)}
          saved={after}
        />
      )}
      {edit && <EditLot lot={edit} close={() => setEdit(null)} saved={after} />}
      {count && (
        <CountForm lot={count} close={() => setCount(null)} saved={after} />
      )}
      {printLots && (
        <PrintSelection lots={printLots} close={() => setPrintLots(null)} />
      )}
    </>
  );
}
function StockBadge({ lot: l }: { lot: InventoryLot }) {
  return (
    <span
      className={`pill ${dec(l.onHand).eq(0) ? "stock-muted" : !l.valued ? "orange" : dec(l.available).eq(0) ? "blue" : "green"}`}
    >
      {dec(l.onHand).eq(0)
        ? "Agotado"
        : !l.valued
          ? "Sin precio"
          : dec(l.available).eq(0)
            ? "Todo reservado"
            : "En stock"}
    </span>
  );
}
function StockStat({
  icon: Icon,
  title,
  value,
  note,
}: {
  icon: typeof Package;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="stat stock-stat">
      <div className="stat-label">
        {title}
        <Icon size={18} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
async function save(action: string, payload: unknown) {
  const r = await fetch(`/api/operations/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
function MovementForm({
  lot,
  kind,
  defaultJob,
  jobs,
  isAdmin,
  close,
  saved,
}: {
  lot: InventoryLot;
  kind: string;
  defaultJob?: string;
  jobs: Job[];
  isAdmin: boolean;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestKey] = useState(() => uuid());
  const returns = lot.movements.filter(
    (m) => m.kind === "USE" && dec(m.returnable).gt(0) && m.job,
  );
  return (
    <Dialog
      open
      title={
        kind === "USE"
          ? "Registrar material utilizado"
          : kind === "RETURN"
            ? "Devolver sobrante al almacén"
            : kind === "RESERVE"
              ? "Reservar para un trabajo"
              : kind === "RELEASE"
                ? "Liberar una reserva"
                : "Devolver al proveedor"
      }
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
    >
      <div className="movement-product">
        <Package size={24} />
        <div>
          <strong>{lot.description}</strong>
          <small>
            {lot.code} · {n(lot.available)} {lot.unit} libres
          </small>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const f = new FormData(e.currentTarget);
            await save("stock-move", {
              lotId: lot.id,
              kind,
              quantity: f.get("quantity"),
              jobId: f.get("jobId") || undefined,
              sourceId: f.get("sourceId") || undefined,
              notes: f.get("notes"),
              requestKey,
            });
            await saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {kind === "RETURN" ? (
          <label>
            Consumo que devuelve material
            <select name="sourceId" required>
              {returns.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.job?.number} · {n(m.returnable)} {lot.unit} ·{" "}
                  {date(m.createdAt)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          kind !== "SUPPLIER_RETURN" && (
            <label>
              Trabajo
              <select name="jobId" required defaultValue={defaultJob}>
                {jobs
                  .filter(
                    (j) =>
                      kind !== "RELEASE" ||
                      lot.reservations.some((r) => r.job?.id === j.id),
                  )
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.number} · {j.name}
                    </option>
                  ))}
              </select>
            </label>
          )
        )}
        <label>
          Cantidad ({lot.unit})
          <input
            name="quantity"
            type="number"
            min={["ud", "rollo", "pack"].includes(lot.unit) ? 1 : 0.0001}
            step={["ud", "rollo", "pack"].includes(lot.unit) ? 1 : 0.0001}
            required
            autoFocus
          />
        </label>
        <label>
          Observaciones (opcional)
          <textarea name="notes" placeholder="Destino, instalación o motivo…" />
        </label>
        {kind === "USE" && (
          <div className="info-banner">
            <ArrowUpFromLine size={22} />
            <div>
              <strong>Se descontará del almacén</strong>
              {lot.valued
                ? "El coste correspondiente se añadirá al trabajo una sola vez."
                : "El coste quedará pendiente hasta valorar el albarán. La salida de material se guardará ahora."}
            </div>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
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
          <Button
            disabled={
              busy ||
              (!jobs.length && kind !== "SUPPLIER_RETURN") ||
              (kind === "SUPPLIER_RETURN" && !isAdmin)
            }
          >
            {busy ? "Guardando…" : "Confirmar movimiento"}
            <Check size={16} />
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function EditLot({
  lot,
  close,
  saved,
}: {
  lot: InventoryLot;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      title="Ficha y ubicación del material"
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
            const f = new FormData(e.currentTarget);
            await save("stock-edit", {
              lotId: lot.id,
              alias: f.get("alias"),
              location: f.get("location"),
              brand: f.get("brand"),
              model: f.get("model"),
              notes: f.get("notes"),
              minimum: f.get("minimum"),
            });
            await saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          {[
            { name: "alias", label: "Alias del producto", value: lot.alias },
            { name: "location", label: "Ubicación", value: lot.location },
            { name: "brand", label: "Marca", value: lot.brand },
            { name: "model", label: "Modelo", value: lot.model },
          ].map((f) => (
            <label key={f.name}>
              {f.label}
              <input
                name={f.name}
                defaultValue={f.value}
                maxLength={f.name === "alias" ? 200 : undefined}
              />
            </label>
          ))}
          <label>
            Avisar al llegar a ({lot.unit})
            <input
              type="number"
              name="minimum"
              min="0"
              step="0.0001"
              defaultValue={lot.minimum}
              required
            />
          </label>
          <label className="full">
            Notas
            <textarea name="notes" defaultValue={lot.notes} />
          </label>
        </div>
        <p className="small-note">
          El alias se utiliza al buscar y facturar, conservando el nombre del
          proveedor. Se comparte entre lotes del mismo proveedor, referencia y
          unidad. El mínimo 0 desactiva el aviso. Las cantidades se corrigen
          mediante movimientos para conservar el historial.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={busy}>Guardar ficha</Button>
        </div>
      </form>
    </Dialog>
  );
}
function PrintSelection({
  lots,
  close,
}: {
  lots: InventoryLot[];
  close: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(lots.map((l) => [l.code, 1])),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <Dialog
      open
      title="¿Cuántas etiquetas necesitas?"
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <p className="small-note mb-4">
        Cada lote conserva su mismo código en todas las pegatinas. Puedes
        preparar una para la caja o una para cada unidad. Imprimir no cambia las
        existencias.
      </p>
      <form action="/etiquetas" target="_blank">
        <input
          type="hidden"
          name="items"
          value={lots.map((l) => `${l.code}:${counts[l.code]}`).join(",")}
        />
        <div className="print-selection-list">
          {lots.map((l) => (
            <div className="print-selection-row" key={l.id}>
              <div>
                <strong>{l.description}</strong>
                <small>
                  {l.code} · {n(l.onHand)} {l.unit} en almacén
                </small>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setCounts({
                      ...counts,
                      [l.code]: ["ud", "pack", "rollo"].includes(l.unit)
                        ? Math.max(1, Math.min(500, Number(l.onHand)))
                        : 1,
                    })
                  }
                >
                  Una por unidad disponible
                </button>
              </div>
              <label>
                Etiquetas
                <input
                  aria-label={`Etiquetas de ${l.description}`}
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  required
                  value={counts[l.code]}
                  onChange={(e) =>
                    setCounts({ ...counts, [l.code]: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          ))}
        </div>
        <p className="small-note mt-4">
          La siguiente pantalla permite ajustar el tamaño del rollo y elegir QR
          o código de barras.
        </p>
        {total > 500 && (
          <p className="error">Prepara un máximo de 500 etiquetas por tanda.</p>
        )}
        <div className="form-footer">
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={total < 1 || total > 500}>
            <Printer size={16} />
            Vista previa · {total} etiquetas
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
