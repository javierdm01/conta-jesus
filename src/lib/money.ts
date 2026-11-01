import Decimal from "decimal.js";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const dec = (v: Decimal.Value) => new Decimal(v);
export const cents = (v: Decimal.Value) => dec(v).toDecimalPlaces(2).toFixed(2);
export function lineNet(
  quantity: Decimal.Value,
  price: Decimal.Value,
  discount: Decimal.Value = 0,
) {
  if (
    dec(quantity).lte(0) ||
    dec(price).lt(0) ||
    dec(discount).lt(0) ||
    dec(discount).gt(100)
  )
    throw new Error("Línea no válida");
  return cents(
    dec(quantity)
      .mul(price)
      .mul(dec(1).minus(dec(discount).div(100))),
  );
}
// Los abonos/regalos de una factura son conceptos económicos, no entradas negativas de almacén.
export function documentLineNet(
  quantity: Decimal.Value,
  price: Decimal.Value,
  discount: Decimal.Value = 0,
) {
  const q = dec(quantity);
  const value = lineNet(q.abs(), price, discount);
  return q.lt(0) ? cents(dec(value).negated()) : value;
}
export function quotePrice(cost: Decimal.Value, margin: Decimal.Value) {
  if (dec(cost).lt(0) || dec(margin).lt(0) || dec(margin).gte(100))
    throw new Error("El margen debe estar entre 0 y menos del 100 %.");
  return cents(dec(cost).div(dec(1).minus(dec(margin).div(100))));
}
export function profitability(
  net: Decimal.Value,
  direct: Decimal.Value,
  overhead: Decimal.Value = 0,
  hours: Decimal.Value = 0,
) {
  const gross = dec(net).minus(direct),
    operating = gross.minus(overhead);
  return {
    net: cents(net),
    direct: cents(direct),
    overhead: cents(overhead),
    gross: cents(gross),
    operating: cents(operating),
    margin: dec(net).gt(0) ? gross.div(net).mul(100).toFixed(1) : null,
    perHour: dec(hours).gt(0) ? gross.div(hours).toFixed(2) : null,
  };
}
export function sum(values: Decimal.Value[]) {
  return values.reduce<Decimal>((a, b) => a.plus(b), dec(0));
}
