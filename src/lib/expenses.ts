import { cents, dec } from "./money";

export const EXPENSE_CATEGORIES = [
  { key: "AUTONOMO", label: "Cuota de autónomos", vat: 0, hint: "Sin IVA. Se deduce en el IRPF (modelo 130)." },
  { key: "SEGURO", label: "Seguros", vat: 0, hint: "Los seguros suelen estar exentos de IVA." },
  { key: "VEHICULO", label: "Vehículo", vat: 21, hint: "Reparaciones, ITV, peajes… Solo es deducible la parte usada en tu actividad." },
  { key: "COMBUSTIBLE", label: "Gasolina", vat: 21, hint: "Solo es deducible la parte usada en tu actividad (en un turismo, normalmente el 50 % del IVA)." },
  { key: "DIETAS", label: "Dietas", vat: 10, hint: "Comidas y alojamiento en desplazamientos de trabajo, pagados con tarjeta y con factura. Límite diario deducible en el IRPF: 26,67 € (53,34 € con pernocta) en España; 48,08 € (91,35 €) en el extranjero." },
  { key: "OTHER", label: "Otros gastos", vat: 21, hint: "" },
] as const;
export const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);

/** Reparte un total con IVA incluido en base e IVA (el IVA se redondea a céntimos). */
export function splitVat(total: string, ratePercent: number) {
  const t = dec(total || 0);
  const net = t.div(dec(1).plus(dec(ratePercent).div(100))).toDecimalPlaces(2);
  return { net: cents(net), tax: cents(t.minus(net)) };
}
