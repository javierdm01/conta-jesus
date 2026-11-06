import type { FieldKind } from "@/lib/evidence-boxes";

// Un color por tipo de dato; el recuadro siempre lleva además una etiqueta de texto.
export const FIELD_COLOR: Record<FieldKind, string> = {
  number: "#2563eb",
  date: "#7c3aed",
  supplier: "#c2410c",
  net: "#15803d",
  tax: "#0f766e",
  total: "#b91c1c",
  description: "#be185d",
  quantity: "#a16207",
  unit: "#475569",
  price: "#0e7490",
  discount: "#7e22ce",
};
