// CSV del catálogo de materiales con su último precio unitario pagado y el enlace a la factura o albarán donde está.
import { db } from "./db";

export type ExportItem = { reference: string; supplierRef: string; description: string; brand: string; unit: string; supplier: string; price: number };
export type ExportLine = {
  reference: string;
  description: string;
  quantity: number;
  unit: string;
  price: number | null; // precio de lista por unidad, antes de descuentos
  discount: number;
  net: number | null; // importe de la línea con descuentos
  documentId: string;
  kind: string;
  number: string;
  date: Date;
  supplier: string;
};

const KIND: Record<string, string> = { PURCHASE: "Factura", DELIVERY: "Albarán", CREDIT: "Abono" };
/** Clave de comparación de referencias: sin signos, en mayúsculas y sin ceros a la izquierda (075201-39 = 75201-39). */
export const refKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
const STOP = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "CON", "PARA", "POR", "Y", "EN", "A", "UN", "UNA"]);
const words = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
/** Parecido de una línea de factura (abreviada) con la descripción de un artículo: palabras iguales o abreviaturas («MOD» ≈ «MODULOS»). */
function likeness(line: string[], item: string[]) {
  const pool = [...item];
  let hit = 0;
  for (const w of line) {
    const at = pool.findIndex((p) => p === w || (w.length >= 3 && p.startsWith(w)) || (p.length >= 3 && w.startsWith(p)));
    if (at >= 0) {
      hit++;
      pool.splice(at, 1);
    }
  }
  return { hit, score: line.length ? hit / line.length : 0 };
}

const round = (n: number, p = 4) => Math.round(n * 10 ** p) / 10 ** p;
/** Precio unitario neto pagado: importe de la línea entre unidades; sin importe, precio de lista menos descuentos. */
export function unitNet(l: Pick<ExportLine, "quantity" | "price" | "discount" | "net">) {
  if (l.net !== null && l.quantity > 0) return round(l.net / l.quantity);
  if (l.price !== null) return round(l.price * (1 - l.discount / 100));
  return null;
}

export type ExportRow = {
  item: ExportItem;
  price: number | null;
  origin: string;
  date: Date | null;
  last: ExportLine | null;
  min: number | null;
  max: number | null;
  purchases: number;
  documents: ExportLine[];
  how: string;
  notes: string[];
};

export function buildRows(items: ExportItem[], lines: ExportLine[]): ExportRow[] {
  const byRef = new Map<string, ExportLine[]>();
  for (const l of lines) {
    const k = refKey(l.reference);
    if (k) byRef.set(k, [...(byRef.get(k) ?? []), l]);
  }
  // Líneas SIN referencia: se asocian por el parecido de su descripción con un artículo (y solo si es claramente el mejor).
  const itemWords = items.map((it) => words(it.description));
  const byDescription = new Map<number, ExportLine[]>();
  const hasRef = (it: ExportItem) => [refKey(it.reference), refKey(it.supplierRef)].some((k) => k && byRef.has(k));
  for (const l of lines) {
    if (refKey(l.reference)) continue;
    const w = words(l.description);
    const scored = items
      .map((it, i) => ({ i, ...likeness(w, itemWords[i]) }))
      .filter((c) => c.hit >= 3 && c.score >= 0.8 && !hasRef(items[c.i]))
      .sort((a, b) => b.score - a.score || b.hit - a.hit);
    if (scored[0] && (!scored[1] || scored[0].score - scored[1].score >= 0.1)) byDescription.set(scored[0].i, [...(byDescription.get(scored[0].i) ?? []), l]);
  }

  return items.map((item, index) => {
    const keys = [refKey(item.reference), refKey(item.supplierRef)].filter(Boolean);
    let matched: ExportLine[] = [];
    let how = "";
    if (keys.length) {
      const viaRef = refKey(item.reference) ? byRef.get(refKey(item.reference)) ?? [] : [];
      const viaSup = refKey(item.supplierRef) ? byRef.get(refKey(item.supplierRef)) ?? [] : [];
      matched = [...new Set([...viaRef, ...viaSup])];
      if (matched.length) how = viaRef.length && viaSup.length ? "referencia y ref. proveedor" : viaRef.length ? "referencia" : "ref. proveedor";
    }
    if (!matched.length && byDescription.has(index)) {
      matched = byDescription.get(index)!;
      how = "descripción (revisar)";
    }
    const documents = [...matched].sort((a, b) => b.date.getTime() - a.date.getTime());
    // El precio de arriba es el último pagado: facturas y albaranes con precio; los abonos devuelven material y no fijan precio.
    const paid = documents.filter((l) => l.kind !== "CREDIT" && unitNet(l) !== null && (unitNet(l) ?? 0) > 0);
    const last = paid[0] ?? null;
    const values = paid.map((l) => unitNet(l)!);
    const notes: string[] = [];
    if (last && item.price > 0 && unitNet(last)! > item.price * 1.05) notes.push("Pagado más caro que la tarifa del catálogo");
    if (last && item.price <= 0) notes.push("Sin tarifa en el catálogo: precio tomado de la compra");
    if (paid.length > 1) {
      const change = unitNet(paid[0])! / unitNet(paid[1])! - 1;
      if (Math.abs(change) >= 0.2) notes.push(`Cambio de ${(change * 100).toFixed(0)} % respecto a la compra anterior`);
    }
    for (const l of paid.slice(0, 1))
      if (l.net !== null && l.price !== null && Math.abs(l.net - l.quantity * l.price * (1 - l.discount / 100)) > 0.02) notes.push("El importe de la línea no cuadra con cantidad × precio × descuento: revisa la factura");
    if (!last && item.price <= 0) notes.push("Sin precio: ni tarifa ni compras");
    if (!last && documents.length) notes.push("Aparece solo en abonos o líneas sin precio");
    return {
      item,
      price: last ? unitNet(last) : item.price > 0 ? item.price : null,
      origin: last ? "Último precio pagado" : item.price > 0 ? "Tarifa del catálogo (sin compras)" : "Sin precio",
      date: last?.date ?? null,
      last,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      purchases: paid.length,
      documents,
      how,
      notes,
    };
  });
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (n: number | null) => (n === null ? "" : n.toFixed(n < 1 ? 4 : 2).replace(".", ","));
const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" }).format(d) : "");

export const HEADERS = [
  "Referencia", "Ref. proveedor", "Descripción", "Marca", "Proveedor", "Unidad",
  "Precio unitario (€, sin IVA)", "Origen del precio", "Fecha del último precio", "Precio de tarifa del catálogo (€)",
  "Precio de lista en la factura (€)", "Descuento (%)", "Mínimo pagado (€)", "Máximo pagado (€)", "Nº de compras",
  "Documento del último precio", "Enlace al documento", "Otros documentos donde aparece", "Cómo se asoció", "Avisos de revisión",
];

/** CSV para Excel en español: UTF-8 con BOM, separador «;» y decimales con coma. */
export function toCsv(rows: ExportRow[], origin: string) {
  const link = (l: ExportLine) => `${origin}/api/documents/${l.documentId}?inline=1`;
  const label = (l: ExportLine) => `${KIND[l.kind] ?? l.kind} ${l.number}`.trim();
  const out = rows.map((r) =>
    [
      r.item.reference, r.item.supplierRef, r.item.description, r.item.brand, r.item.supplier, r.item.unit,
      money(r.price), r.origin, day(r.date), money(r.item.price > 0 ? r.item.price : null),
      r.last?.price != null ? money(r.last.price) : "", r.last ? String(r.last.discount).replace(".", ",") : "", money(r.min), money(r.max), r.purchases || "",
      r.last ? `${label(r.last)} (${day(r.last.date)})` : r.documents[0] ? `${label(r.documents[0])} (${day(r.documents[0].date)})` : "",
      r.last ? link(r.last) : r.documents[0] ? link(r.documents[0]) : "",
      r.documents
        .filter((l) => l !== (r.last ?? r.documents[0]))
        .slice(0, 5)
        .map((l) => `${label(l)} (${day(l.date)}) ${link(l)}`)
        .join(" | "),
      r.how, r.notes.join(" · "),
    ].map(cell).join(";"),
  );
  return `﻿${[HEADERS.map(cell).join(";"), ...out].join("\r\n")}\r\n`;
}

export async function catalogCsv(companyId: string, origin: string) {
  const [items, lines] = await Promise.all([
    db.catalogItem.findMany({ where: { companyId }, orderBy: { description: "asc" } }),
    db.documentLine.findMany({
      where: { document: { companyId, kind: { in: ["PURCHASE", "DELIVERY", "CREDIT"] }, status: "CONFIRMED" } },
      include: { document: { select: { id: true, kind: true, number: true, date: true, supplier: { select: { name: true } } } } },
    }),
  ]);
  const rows = buildRows(
    items.map((i) => ({ reference: i.reference, supplierRef: i.supplierRef, description: i.description, brand: i.brand, unit: i.unit, supplier: i.supplier, price: Number(i.price) })),
    lines.map((l) => ({
      reference: l.reference ?? "",
      description: l.description,
      quantity: Number(l.quantity),
      unit: l.unit,
      price: l.price === null ? null : Number(l.price),
      discount: Number(l.discount),
      net: l.net === null ? null : Number(l.net),
      documentId: l.document.id,
      kind: l.document.kind,
      number: l.document.number ?? "",
      date: l.document.date ?? new Date(0),
      supplier: l.document.supplier?.name ?? "",
    })),
  );
  return { csv: toCsv(rows, origin), rows };
}
