import { cents, dec, sum } from "./money";
// Los conceptos económicos no crean existencias. Su importe se reparte en los
// lotes conservando las líneas originales y hasta el último céntimo de la base.
export function allocateDocumentValue(
  values: string[],
  target: string,
): string[] {
  if (values.some((v) => dec(v).lt(0)) || dec(target).lt(0))
    throw Error("Valoración negativa no válida.");
  const total = sum(values);
  if (total.isZero()) {
    if (!dec(target).isZero())
      throw Error("No hay material valorado al que repartir el ajuste.");
    return values.map(() => "0.00");
  }
  const last = values.findLastIndex((v) => dec(v).gt(0));
  let remaining = dec(target),
    weight = total;
  return values.map((v, i) => {
    const value = dec(v).isZero()
      ? "0.00"
      : i === last
        ? cents(remaining)
        : cents(remaining.mul(v).div(weight));
    remaining = remaining.minus(value);
    weight = weight.minus(v);
    return value;
  });
}
