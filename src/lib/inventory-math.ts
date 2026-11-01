import { cents, dec } from "./money";
import type Decimal from "decimal.js";
export function quantityForUnit(quantity: string, unit: string) {
  if (!dec(quantity).gt(0)) throw new Error("La cantidad debe ser positiva.");
  if (["ud", "pack", "rollo"].includes(unit) && !dec(quantity).isInteger())
    throw new Error(
      "Usa cantidades enteras para unidades, packs y rollos. Para cable cortado, registra metros.",
    );
}
export function portion(
  value: Decimal.Value,
  quantity: Decimal.Value,
  available: Decimal.Value,
  originalValue: Decimal.Value,
  received: Decimal.Value,
) {
  if (dec(quantity).eq(available)) return cents(value);
  return cents(
    DecimalMin(
      value,
      dec(originalValue).mul(quantity).div(received).toDecimalPlaces(2),
    ),
  );
}
const DecimalMin = (a: Decimal.Value, b: Decimal.Value) =>
  dec(a).lt(b) ? dec(a) : dec(b);
export function lotIdentifier(input: string) {
  const value = input.trim();
  if (/^LT-[A-F0-9]{14}$/i.test(value)) return value.toUpperCase();
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/inventario\/(LT-[A-F0-9]{14})\/?$/i);
    return match?.[1].toUpperCase() ?? null;
  } catch {
    return null;
  }
}
export function stockGroupKey(line: {
  reference: string;
  description: string;
  unit: string;
  price?: string | null;
  discount?: string;
  brand?: string;
  model?: string;
  location?: string;
}) {
  const normalize = (s: string) =>
    s.trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
  return JSON.stringify([
    normalize(line.reference),
    normalize(line.description),
    line.unit,
    line.price == null ? null : dec(line.price).toString(),
    dec(line.discount ?? 0).toString(),
    normalize(line.brand ?? ""),
    normalize(line.model ?? ""),
    normalize(line.location ?? ""),
  ]);
}
