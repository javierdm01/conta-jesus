import type { Box, Evidence, Ev } from "./ocr-evidence";

export type FieldKind =
  | "number" | "date" | "supplier" | "net" | "tax" | "total"
  | "description" | "quantity" | "unit" | "price" | "discount";
export type ViewerBox = {
  id: string;
  kind: FieldKind;
  label: string;
  page: number;
  box: Box;
  approx: boolean;
};
export const FIELD_LABEL: Record<FieldKind, string> = {
  number: "Nº documento",
  date: "Fecha",
  supplier: "Proveedor",
  net: "Base",
  tax: "IVA",
  total: "Total",
  description: "Descripción",
  quantity: "Cantidad",
  unit: "Unidad",
  price: "Precio",
  discount: "Dto.",
};

export function boxesFromEvidence(e: Evidence | undefined): ViewerBox[] {
  if (!e) return [];
  const out: ViewerBox[] = [];
  const add = (id: string, kind: FieldKind, ev: Ev | null | undefined) => {
    if (ev) out.push({ id, kind, label: FIELD_LABEL[kind], page: ev.page, box: ev.box, approx: ev.approx });
  };
  for (const k of ["number", "date", "supplier", "net", "tax", "total"] as const) add(k, k, e[k]);
  e.lines.forEach((line, i) =>
    (["description", "quantity", "unit", "price", "discount"] as const).forEach((k) =>
      add(`line-${i}-${k}`, k, line[k]),
    ),
  );
  return out;
}
