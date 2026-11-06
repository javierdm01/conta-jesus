import type { InventoryLot } from "./inventory-types";
import { dec } from "./money";
import { lotIdentifier } from "./inventory-math";
import { matchesSearch } from "./product-search";

export type InventoryFilters = {
  search: string;
  status: string;
  location: string;
  supplier: string;
  order: string;
  receiptId?: string | null;
};
export function lowStock(lot: InventoryLot) {
  return dec(lot.minimum).gt(0) && dec(lot.available).lte(lot.minimum);
}
export function filterInventory(
  lots: InventoryLot[],
  filters: InventoryFilters,
) {
  const code = lotIdentifier(filters.search);
  const q = filters.search.trim().toLocaleLowerCase("es");
  const result = lots.filter(
    (l) =>
      (!filters.receiptId || l.document?.id === filters.receiptId) &&
      (!filters.location ||
        (filters.location === "__empty"
          ? !l.location
          : l.location === filters.location)) &&
      (!filters.supplier || l.document?.supplier?.name === filters.supplier) &&
      (code
        ? l.code === code
        : matchesSearch(q, [
            l.alias,
            l.description,
            l.reference,
            l.code,
            l.location,
            l.brand,
            l.model,
            l.family,
            l.notes,
            l.document?.supplier?.name,
            l.document?.number,
          ])) &&
      (filters.status === "all" ||
        (filters.status === "available" && dec(l.onHand).gt(0)) ||
        (filters.status === "free" && dec(l.available).gt(0)) ||
        (filters.status === "reserved" && dec(l.reserved).gt(0)) ||
        (filters.status === "empty" && dec(l.onHand).eq(0)) ||
        (filters.status === "unpriced" && !l.valued) ||
        (filters.status === "low" && lowStock(l))),
  );
  return result.sort((a, b) =>
    filters.order === "name"
      ? (a.alias || a.description).localeCompare(
          b.alias || b.description,
          "es",
          { numeric: true },
        )
      : filters.order === "oldest"
        ? a.createdAt.localeCompare(b.createdAt) || a.code.localeCompare(b.code)
        : b.createdAt.localeCompare(a.createdAt) ||
          a.code.localeCompare(b.code),
  );
}

// Comillas CSV no neutralizan fórmulas de hoja de cálculo por sí solas.
export function csvCell(value: string | null | undefined) {
  const raw = value ?? "";
  const safe =
    /^[\s\uFEFF]*[=+\-@]/.test(raw) || /^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function inventoryCsv(lots: InventoryLot[], admin: boolean) {
  const header = [
    "Código",
    "Descripción",
    "Alias",
    "Referencia",
    "Marca",
    "Modelo",
    "Unidad",
    "Recibido",
    "Existencias",
    "Reservado",
    "Libre",
    "Ubicación",
    "Mínimo",
    "Fecha recepción",
    ...(admin
      ? [
          "Proveedor",
          "Documento",
          "Valoración",
          "Valor original EUR",
          "Valor en stock EUR",
        ]
      : []),
  ];
  const numeric = (s: string) => s.replace(".", ",");
  const rows = lots.map((l) => [
    l.code,
    l.description,
    l.alias,
    l.reference,
    l.brand,
    l.model,
    l.unit,
    numeric(l.received),
    numeric(l.onHand),
    numeric(l.reserved),
    numeric(l.available),
    l.location,
    numeric(l.minimum),
    l.createdAt.slice(0, 10),
    ...(admin
      ? [
          l.document?.supplier?.name ?? "",
          l.document?.number ?? "",
          l.valued ? "Valorado" : "Pendiente de precio",
          l.totalValue == null ? "" : numeric(l.totalValue),
          l.remainingValue == null ? "" : numeric(l.remainingValue),
        ]
      : []),
  ]);
  return (
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")
  );
}
