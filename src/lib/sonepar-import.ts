import { dec, documentLineNet, sum } from "./money";
import type { SoneparDoc } from "./sonepar";

export type ImportCatalog = { reference: string; supplierRef: string; unit: string; brand: string };
export const soneparNumber = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
export const soneparFinancial = (code: string, description: string) => /^(?:RAEE|ECOPILA|PORTES|TRANSPORTE|GASTOS[ -]|RECARGO|DESCUENTO)/i.test(code) || /^(?:COSTE\s+RAEE|PORTES\b|GASTOS\s+DE\s+ENV[IÍ]O|DESCUENTO\b)/i.test(description);

/** Solo confirma cantidades y unidades identificadas; lo incierto queda para revisión. */
export function soneparStockPlan(document: SoneparDoc, catalog: ImportCatalog[]) {
  const problems: string[] = [];
  if (!document.consistent) problems.push("La base y el IVA no coinciden con el total del PDF");
  if (!document.lines.length) problems.push("No hay líneas legibles en el PDF");
  if (!sum(document.lines.map(line => line.net)).eq(document.net)) problems.push("Las líneas impresas no suman exactamente la base imponible");
  const lines = document.lines.map(line => {
    const financial = soneparFinancial(line.code, line.description);
    const matches = catalog.filter(item => (item.supplierRef && item.supplierRef === line.code) || (line.reference && item.reference.toUpperCase() === line.reference.toUpperCase()));
    const units = [...new Set(matches.map(item => item.unit))];
    const unit = financial ? "ud" : units.length === 1 ? units[0] : "ud";
    if (!financial && units.length !== 1) problems.push(`Unidad no verificada para ${line.code} (${line.description})`);
    if (!financial && !["ud", "m", "rollo", "pack", "kg", "l", "h"].includes(unit)) problems.push(`Unidad no admitida: ${unit}`);
    if (!financial && dec(line.quantity).lte(0)) problems.push(`Cantidad física no positiva: ${line.code}`);
    if (!financial && ["ud", "pack", "rollo"].includes(unit) && !dec(line.quantity).isInteger()) problems.push(`Cantidad fraccionaria para ${unit}: ${line.code}`);
    let price = dec(line.price).toString(), discount = dec(line.discount).toString();
    if (financial && dec(line.net).isZero()) { price = "0"; discount = "0"; }
    if (dec(price).decimalPlaces() > 4) {
      const compatible = dec(price).toDecimalPlaces(4).toString();
      // La BD admite cuatro decimales: solo reducir precisión si conserva exactamente el importe impreso.
      try { if (dec(documentLineNet(line.quantity, compatible, discount)).eq(line.net)) price = compatible; } catch { /* La validación inferior lo deja pendiente. */ }
    }
    if (dec(price).decimalPlaces() > 4 || dec(discount).decimalPlaces() > 4 || dec(line.quantity).decimalPlaces() > 4) problems.push(`Precisión no admitida para ${line.code}`);
    try {
      if (!dec(documentLineNet(line.quantity, price, discount)).eq(line.net)) problems.push(`Precio, descuento e importe no cuadran para ${line.code}`);
    } catch { problems.push(`Importes no válidos en ${line.code}`); }
    return { description: line.description, reference: matches[0]?.reference || line.reference || line.code,
      supplierRef: line.code, unit, quantity: line.quantity, price, discount, financial,
      brand: line.brand || matches[0]?.brand || "", model: "", location: "" };
  });
  if (!lines.some(line => !line.financial)) problems.push("No hay artículos físicos que dar de alta en almacén");
  return { lines, problems: [...new Set(problems)] };
}
