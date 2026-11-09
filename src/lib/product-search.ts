import { cents, dec } from "./money";

export const searchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function matchesSearch(
  query: string,
  values: (string | null | undefined)[],
) {
  const text = searchText(values.filter(Boolean).join(" "));
  const compact = values
    .filter((v): v is string => !!v)
    .map((v) => searchText(v).replaceAll(" ", ""));
  return searchText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every(
      (word) => text.includes(word) || compact.some((v) => v.includes(word)),
    );
}
/** Precio de compra por unidad (coste real, sin IVA). */
export function purchasePrice(totalValue: string | null | undefined, received: string) {
  if (totalValue == null || dec(received).lte(0)) return null;
  return cents(dec(totalValue).div(received));
}
/** Precio de venta: compra + 30 %. */
export function recommendedPrice(
  totalValue: string | null | undefined,
  received: string,
) {
  if (totalValue == null || dec(received).lte(0)) return null;
  return cents(dec(totalValue).div(received).mul("1.30"));
}
