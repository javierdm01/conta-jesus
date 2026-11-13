import { z } from "zod";

// Plantilla de facturas y presupuestos: cada línea es un bloque posicionado en puntos PDF sobre un A4 (595 × 842).
export const PAGE = { w: 595, h: 842 };
// Datos de la factura o presupuesto que puede mostrar un bloque "field".
export const fields = {
  companyName: "Nombre de la empresa",
  companyTaxId: "NIF de la empresa",
  title: "Tipo de documento",
  number: "Número",
  date: "Fecha",
  due: "Vencimiento / validez",
  customerName: "Nombre del cliente",
  customerTaxId: "NIF del cliente",
  customerAddress: "Dirección del cliente",
  customerPhone: "Teléfono del cliente",
  customerEmail: "Email del cliente",
  job: "Trabajo",
} as const;
export type FieldKey = keyof typeof fields;
export const tableCols = ["DESCRIPCIÓN", "UDS.", "PRECIO", "DTO.", "BASE"];
export const totalKeys = ["base", "tax", "withholding", "total", "collected", "pending"] as const;
export type TotalKey = (typeof totalKeys)[number];
export const totalLabels = ["Base imponible", "Impuestos", "Retención", "TOTAL", "Cobrado", "Pendiente"];

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const block = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["field", "text", "box", "divider", "table", "totals", "notes"]),
  field: z.enum(Object.keys(fields) as [FieldKey, ...FieldKey[]]).optional(),
  x: z.number().min(0).max(PAGE.w),
  y: z.number().min(0).max(PAGE.h),
  w: z.number().min(10).max(PAGE.w),
  h: z.number().min(1).max(PAGE.h).default(20),
  size: z.number().min(5).max(48).default(10),
  color: color.default("#0f172a"),
  fill: color.default("#f1f5f9"),
  bold: z.boolean().default(false),
  align: z.enum(["left", "center", "right"]).default("left"),
  label: z.string().max(60).default(""), // prefijo de un campo ("Fecha: ") o encabezado de anotaciones
  text: z.string().max(2000).default(""), // texto fijo; en el título sustituye a FACTURA / PRESUPUESTO
  cols: z.array(z.string().max(40)).max(6).default([]), // encabezados de la tabla o textos de los totales
  hidden: z.boolean().default(false),
  hide: z.array(z.enum(totalKeys)).max(6).default([]), // filas de los totales que no se imprimen
});
export const pdfLayoutSchema = z.object({ blocks: z.array(block).max(80) });
export type PdfBlock = z.infer<typeof block>;
export type PdfLayout = z.infer<typeof pdfLayoutSchema>;

const b = (x: Partial<PdfBlock> & Pick<PdfBlock, "id" | "kind" | "x" | "y" | "w">): PdfBlock => block.parse(x);
const grey = "#64748b",
  teal = "#0f766e";
const f = (field: FieldKey, x: number, y: number, w: number, o: Partial<PdfBlock> = {}) => b({ id: field, kind: "field", field, x, y, w, ...o });
// Reproduce el diseño que tenían los PDF antes de ser editables.
export const defaultLayout = (): PdfLayout => ({
  blocks: [
    f("companyName", 48, 48, 240, { size: 20, bold: true, color: teal }),
    f("companyTaxId", 48, 72, 240, { size: 9, color: grey, label: "NIF/CIF: " }),
    f("title", 347, 48, 200, { size: 24, bold: true, align: "right" }),
    f("number", 397, 78, 150, { color: grey, align: "right", label: "Nº " }),
    f("date", 397, 92, 150, { color: grey, align: "right", label: "Fecha: " }),
    f("due", 397, 106, 150, { color: grey, align: "right" }),
    b({ id: "divider", kind: "divider", x: 48, y: 130, w: 499, h: 1, color: "#e2e8f0" }),
    b({ id: "lbl-customer", kind: "text", x: 48, y: 142, w: 240, size: 8, color: grey, text: "CLIENTE" }),
    f("customerName", 48, 154, 240, { size: 12, bold: true }),
    f("customerTaxId", 48, 169, 240, { size: 9, color: grey, label: "NIF/CIF: " }),
    f("customerAddress", 48, 180, 240, { size: 9, color: grey }),
    f("customerPhone", 48, 191, 240, { size: 9, color: grey }),
    f("customerEmail", 48, 202, 240, { size: 9, color: grey }),
    b({ id: "lbl-job", kind: "text", x: 330, y: 142, w: 200, size: 8, color: grey, text: "TRABAJO" }),
    f("job", 330, 154, 200),
    b({ id: "table", kind: "table", x: 48, y: 245, w: 499, size: 9, cols: tableCols }),
    b({ id: "totals", kind: "totals", x: 330, y: 0, w: 217, color: teal, cols: totalLabels }),
    b({ id: "notes", kind: "notes", x: 48, y: 0, w: 250, size: 9, label: "ANOTACIONES" }),
  ],
});

// Los campos, la tabla, los totales y las anotaciones no se pueden borrar (solo ocultar): si faltan, se recuperan.
const required = (k: PdfBlock) => k.kind !== "text" && k.kind !== "box" && k.kind !== "divider";
export function readLayout(raw: unknown): PdfLayout {
  const parsed = pdfLayoutSchema.safeParse(raw);
  if (!parsed.success) return defaultLayout();
  const have = new Set(parsed.data.blocks.map((x) => x.id));
  return { blocks: [...parsed.data.blocks, ...defaultLayout().blocks.filter((x) => required(x) && !have.has(x.id))] };
}

// Datos fijos del documento (todo menos líneas e importes); los usan el PDF y la vista del editor.
export type FieldData = {
  title: string; // FACTURA / PRESUPUESTO
  number: string;
  date: Date;
  due?: { label: string; date: Date } | null;
  company: { name: string; taxId?: string | null };
  customer: { name: string; taxId?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  job: { number: string; name: string };
};
const day = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" }).format(d);

// Texto de un bloque "field"; vacío = el documento no tiene ese dato y no se pinta.
export function fieldText(k: PdfBlock, d: FieldData): string {
  const v: Record<FieldKey, string | null | undefined> = {
    companyName: d.company.name,
    companyTaxId: d.company.taxId,
    title: k.text || d.title,
    number: d.number,
    date: day(d.date),
    due: d.due && day(d.due.date),
    customerName: d.customer.name,
    customerTaxId: d.customer.taxId,
    customerAddress: d.customer.address,
    customerPhone: d.customer.phone,
    customerEmail: d.customer.email,
    job: `${d.job.number} · ${d.job.name}`,
  };
  const value = k.field && v[k.field];
  if (!value) return "";
  // Sin prefijo propio, el vencimiento usa el del documento ("Vencimiento" o "Válido hasta").
  const label = k.field === "due" && !k.label && d.due ? `${d.due.label}: ` : k.label;
  return label + value;
}
