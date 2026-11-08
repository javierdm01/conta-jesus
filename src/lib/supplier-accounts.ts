import { db } from "./db";

export type AcctLine = { reference: string; description: string; unit: string; quantity: number; net: number };
export type AcctDoc = {
  id: string;
  kind: "PURCHASE" | "CREDIT" | "DELIVERY";
  number: string;
  date: string; // AAAA-MM-DD
  net: number | null;
  tax: number | null;
  lines: AcctLine[];
  /** Números de los documentos con los que está asociado (albaranes de una factura, facturas/albaranes de un abono). */
  linked: string[];
  /** Solo albaranes: sigue pendiente de factura. */
  pending: boolean;
  /** Números de albarán citados dentro de la factura o del abono (no son documentos propios). */
  refs?: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cuentas de un proveedor a partir de sus documentos confirmados.
 * Facturas suman, abonos restan. Los albaranes pendientes se miran siempre a día de hoy, no por año.
 */
export function buildAccounts(docs: AcctDoc[], year: number | null) {
  const inYear = (d: AcctDoc) => year == null || d.date.startsWith(String(year));
  const invoices = docs.filter((d) => d.kind === "PURCHASE" && inYear(d));
  const credits = docs.filter((d) => d.kind === "CREDIT" && inYear(d));
  const deliveries = docs.filter((d) => d.kind === "DELIVERY" && inYear(d));
  const sum = (rows: AcctDoc[], f: "net" | "tax") => r2(rows.reduce((a, d) => a + (d[f] ?? 0), 0));

  const invoicedNet = sum(invoices, "net"),
    invoicedTax = sum(invoices, "tax"),
    creditNet = sum(credits, "net"),
    creditTax = sum(credits, "tax");
  const biggest = [...invoices].sort((a, b) => (b.net ?? 0) - (a.net ?? 0))[0];

  const months = Array.from({ length: 12 }, (_, i) => {
    const key = (d: AcctDoc) => (d.date.slice(5, 7) === String(i + 1).padStart(2, "0") ? d : null);
    const invoiced = r2(invoices.filter(key).reduce((a, d) => a + (d.net ?? 0), 0)),
      credit = r2(credits.filter(key).reduce((a, d) => a + (d.net ?? 0), 0));
    return { month: i + 1, invoiced, credits: credit, net: r2(invoiced - credit) };
  });

  const row = (d: AcctDoc) => ({
    id: d.id,
    number: d.number,
    date: d.date,
    net: d.net ?? 0,
    tax: d.tax ?? 0,
    total: r2((d.net ?? 0) + (d.tax ?? 0)),
    linked: d.linked,
  });

  // Artículos comprados: por referencia (o descripción) con unidades, importe y precio medio.
  const byItem = new Map<string, { reference: string; description: string; unit: string; quantity: number; net: number; buys: { date: string; unit: number }[] }>();
  for (const d of [...invoices, ...credits])
    for (const l of d.lines) {
      if (l.quantity <= 0 || /^coste raee/i.test(l.description)) continue; // la tasa de reciclaje no es un artículo
      const key = (l.reference || l.description).trim().toLowerCase();
      const it = byItem.get(key) ?? { reference: l.reference, description: l.description, unit: l.unit, quantity: 0, net: 0, buys: [] };
      // Un abono devuelve unidades e importe del artículo; no cuenta como una compra a otro precio.
      const sign = d.kind === "CREDIT" ? -1 : 1;
      it.quantity += sign * l.quantity;
      it.net += sign * l.net;
      if (sign > 0) it.buys.push({ date: d.date, unit: l.net / l.quantity });
      byItem.set(key, it);
    }
  const items = [...byItem.values()].filter((i) => i.quantity > 0);
  const articles = [...items]
    .sort((a, b) => b.net - a.net)
    .slice(0, 15)
    .map((i) => ({ reference: i.reference, description: i.description, unit: i.unit, quantity: r2(i.quantity), net: r2(i.net), avgPrice: r2(i.net / i.quantity) }));
  // Variación del precio unitario entre la primera y la última compra del periodo.
  const priceChanges = items
    .filter((i) => i.buys.length >= 2)
    .map((i) => {
      const b = [...i.buys].sort((x, y) => x.date.localeCompare(y.date));
      const from = b[0].unit,
        to = b[b.length - 1].unit;
      return { reference: i.reference, description: i.description, from: r2(from), to: r2(to), pct: from > 0 ? r2(((to - from) / from) * 100) : 0 };
    })
    .filter((c) => c.pct !== 0)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 10);

  const pending = docs.filter((d) => d.kind === "DELIVERY" && d.pending);
  return {
    year,
    totals: {
      invoicedNet,
      invoicedTax,
      invoicedTotal: r2(invoicedNet + invoicedTax),
      creditNet,
      creditTax,
      creditTotal: r2(creditNet + creditTax),
      netPurchases: r2(invoicedNet - creditNet),
      netTax: r2(invoicedTax - creditTax),
      netTotal: r2(invoicedNet + invoicedTax - creditNet - creditTax),
      invoiceCount: invoices.length,
      creditCount: credits.length,
      creditPct: invoicedNet > 0 ? r2((creditNet / invoicedNet) * 100) : 0,
      avgInvoice: invoices.length ? r2(invoicedNet / invoices.length) : 0,
      biggest: biggest ? { number: biggest.number, net: biggest.net ?? 0 } : null,
      deliveryCount: deliveries.length,
      deliveryNet: sum(deliveries, "net"),
      // Albaranes citados en las facturas del periodo (cada factura de Sonepar agrupa varios).
      invoicedDeliveries: new Set(invoices.flatMap((d) => d.refs ?? [])).size,
    },
    pending: {
      count: pending.length,
      net: sum(pending, "net"),
      unvalued: pending.filter((d) => d.net == null).length,
    },
    months,
    invoices: invoices.sort((a, b) => b.date.localeCompare(a.date)).map(row),
    credits: credits.sort((a, b) => b.date.localeCompare(a.date)).map(row),
    pendingDeliveries: pending.sort((a, b) => b.date.localeCompare(a.date)).map((d) => ({ id: d.id, number: d.number, date: d.date, net: d.net })),
    articles,
    priceChanges,
  };
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const num = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()));

/** Documentos confirmados de un proveedor, listos para buildAccounts. */
export async function supplierDocs(companyId: string, supplierId: string): Promise<AcctDoc[]> {
  const docs = await db.document.findMany({
    where: { companyId, supplierId, kind: { in: ["PURCHASE", "CREDIT", "DELIVERY"] }, status: "CONFIRMED" },
    include: {
      lines: true,
      stockLots: { select: { invoiceDocumentId: true } },
      valuedLots: { select: { document: { select: { number: true } } } },
      supersedes: { select: { number: true } },
      replacedBy: { select: { id: true } },
    },
    orderBy: [{ date: "asc" }, { number: "asc" }],
  });
  const numberOf = new Map(docs.map((d) => [d.id, d.number ?? ""]));
  // Un abono corrige la factura que cita o la que comparte con él algún albarán.
  const invoices = docs.filter((d) => d.kind === "PURCHASE");
  const invoiceNumbers = new Set(invoices.map((d) => (d.number ?? "").toUpperCase()));
  const byAlbaran = new Map<string, string[]>();
  for (const inv of invoices) for (const r of inv.refs) byAlbaran.set(r, [...(byAlbaran.get(r) ?? []), inv.number ?? ""]);
  const corrected = (d: (typeof docs)[number]) => [
    ...new Set([
      ...d.relatedIds.map((id) => numberOf.get(id) ?? ""),
      ...d.refs.filter((r) => invoiceNumbers.has(r.toUpperCase())),
      ...d.refs.flatMap((r) => byAlbaran.get(r) ?? []),
    ].filter(Boolean)),
  ];
  return docs.map((d) => ({
    id: d.id,
    kind: d.kind as AcctDoc["kind"],
    number: d.number ?? d.originalName,
    date: iso(d.date),
    net: num(d.net),
    tax: num(d.tax),
    lines: d.lines.map((l) => ({
      reference: l.reference ?? "",
      description: l.description,
      unit: l.unit ?? "ud",
      quantity: Number(l.quantity.toString()),
      net: Number(l.net?.toString() ?? 0),
    })),
    refs: d.refs,
    linked:
      d.kind === "CREDIT"
        ? (corrected(d).length ? corrected(d) : d.refs)
        : [
            ...new Set(
              [...d.valuedLots.map((l) => l.document?.number ?? ""), d.supersedes?.number ?? "", ...d.refs].filter(Boolean),
            ),
          ],
    pending: d.kind === "DELIVERY" && !d.replacedBy && (d.stockLots.length === 0 || d.stockLots.some((l) => !l.invoiceDocumentId)),
  }));
}

/** Compras por proveedor en un año (o todos los años): facturado, abonado y neto. */
export async function supplierRanking(companyId: string, year: number | null) {
  const docs = await db.document.findMany({
    where: { companyId, supplierId: { not: null }, kind: { in: ["PURCHASE", "CREDIT"] }, status: "CONFIRMED" },
    select: { supplierId: true, kind: true, date: true, net: true, supplier: { select: { name: true } } },
  });
  const by = new Map<string, { id: string; name: string; invoiced: number; credits: number; invoices: number }>();
  const years = new Set<number>();
  for (const d of docs) {
    if (!d.date) continue;
    years.add(d.date.getUTCFullYear());
    if (year != null && d.date.getUTCFullYear() !== year) continue;
    const s = by.get(d.supplierId!) ?? { id: d.supplierId!, name: d.supplier?.name ?? "", invoiced: 0, credits: 0, invoices: 0 };
    const net = num(d.net) ?? 0;
    if (d.kind === "CREDIT") s.credits += net;
    else {
      s.invoiced += net;
      s.invoices++;
    }
    by.set(s.id, s);
  }
  return {
    years: [...years].sort((a, b) => b - a),
    suppliers: [...by.values()]
      .map((s) => ({ ...s, invoiced: r2(s.invoiced), credits: r2(s.credits), net: r2(s.invoiced - s.credits) }))
      .sort((a, b) => b.net - a.net),
  };
}
