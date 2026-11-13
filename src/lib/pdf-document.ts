import PDFDocument from "pdfkit";
import { fieldText, readLayout, tableCols, totalKeys, totalLabels, type FieldData, type PdfBlock, type TotalKey } from "./pdf-layout";

const eur = (n: string | number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));
const grey = "#64748b",
  ink = "#0f172a";

export type PdfDocumentData = FieldData & {
  lines: { description: string; unit: string; quantity: string; price: string; discount?: string; net: string }[];
  totals: { key: TotalKey; value: string }[];
  notes?: string | null;
};

// Factura o presupuesto en PDF según la plantilla guardada de la empresa.
export function renderDocumentPdf(data: PdfDocumentData, rawLayout: unknown): Promise<Buffer> {
  const layout = readLayout(rawLayout);
  const blocks = layout.blocks.filter((x) => !x.hidden);
  const get = (id: string) => blocks.find((x) => x.id === id);
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${data.title} ${data.number}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
  const font = (k: PdfBlock) => doc.font(k.bold ? "Helvetica-Bold" : "Helvetica").fontSize(k.size).fillColor(k.color);

  // Cajas primero: quedan de fondo bajo el texto.
  for (const k of blocks.filter((x) => x.kind === "box")) doc.rect(k.x, k.y, k.w, k.h).fillAndStroke(k.fill, k.color);
  for (const k of blocks) {
    const text = k.kind === "text" ? k.text : k.kind === "field" ? fieldText(k, data) : "";
    if (text) font(k).text(text, k.x, k.y, { width: k.w, align: k.align });
    if (k.kind === "divider") doc.moveTo(k.x, k.y).lineTo(k.x + k.w, k.y).lineWidth(k.h).strokeColor(k.color).stroke().lineWidth(1);
  }

  // Tabla de líneas: columnas fijas pegadas al borde derecho; la descripción ocupa el resto.
  const t = get("table") ?? layout.blocks.find((x) => x.id === "table")!;
  const head = (i: number) => t.cols[i] ?? tableCols[i];
  const right = t.x + t.w,
    cols = { desc: t.x + 6, uds: right - 241, price: right - 186, dto: right - 121, base: right - 71 },
    descW = cols.uds - t.x - 12;
  let y = t.y;
  doc.rect(t.x, y - 6, t.w, 22).fill(t.fill);
  doc.fillColor(grey).fontSize(8).font("Helvetica-Bold");
  doc.text(head(0), cols.desc, y, { width: descW });
  doc.text(head(1), cols.uds, y, { width: 45, align: "right" });
  doc.text(head(2), cols.price, y, { width: 55, align: "right" });
  doc.text(head(3), cols.dto, y, { width: 40, align: "right" });
  doc.text(head(4), cols.base, y, { width: 65, align: "right" });
  y += 24;
  doc.font("Helvetica").fontSize(t.size).fillColor(t.color);
  for (const l of data.lines) {
    const h = Math.max(16, doc.heightOfString(l.description, { width: descW }) + 6);
    if (y + h > doc.page.height - 190) {
      doc.addPage();
      y = 60;
    }
    doc.fillColor(t.color);
    doc.text(l.description, cols.desc, y, { width: descW });
    doc.text(`${Number(l.quantity)} ${l.unit}`, cols.uds, y, { width: 45, align: "right" });
    doc.text(eur(l.price), cols.price, y, { width: 55, align: "right" });
    doc.text(Number(l.discount) ? `${Number(l.discount)} %` : "", cols.dto, y, { width: 40, align: "right" });
    doc.text(eur(l.net), cols.base, y, { width: 65, align: "right" });
    y += h;
    doc.moveTo(t.x, y - 2).lineTo(right, y - 2).strokeColor("#f1f5f9").stroke();
  }

  // Totales y anotaciones van justo después de la tabla; solo su posición horizontal es fija.
  y += 22;
  if (y > doc.page.height - 170) {
    doc.addPage();
    y = 60;
  }
  const top = y,
    tot = get("totals"),
    notes = get("notes");
  if (tot)
    for (const r of data.totals.filter((r) => !tot.hide.includes(r.key))) {
      const i = totalKeys.indexOf(r.key),
        bold = r.key === "total";
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? tot.size + 3 : tot.size).fillColor(bold ? tot.color : ink);
      doc.text(tot.cols[i] ?? totalLabels[i], tot.x, y, { width: 120 });
      doc.text(r.value, tot.x + 110, y, { width: tot.w - 110, align: "right" });
      y += bold ? tot.size + 14 : tot.size + 8;
    }
  if (notes && data.notes) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(grey).text(notes.label, notes.x, top);
    doc.font("Helvetica").fontSize(notes.size).fillColor(notes.color).text(data.notes, notes.x, top + 14, { width: notes.w });
  }
  doc.end();
  return done;
}

export const pdfResponse = (buf: Buffer, req: Request, name: string) =>
  new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(req.url).searchParams.has("inline") ? "inline" : "attachment"}; filename="${name.replace(/[^\w.-]+/g, "_")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
export { eur };
