// Tipo de documento de proveedor a partir de su texto y referencias cruzadas (albaranes, facturas abonadas).

/** Cabecera = lo que hay antes de la tabla de artículos; ahí está el título del documento. */
const header = (text: string) => {
  const cut = text.search(/descripci[oó]n/i);
  return cut > 0 ? text.slice(0, cut) : text.slice(0, 900);
};

/**
 * PURCHASE (factura), CREDIT (abono / nota de crédito / rectificativa) o DELIVERY (albarán).
 * Solo se mira la cabecera: una factura puede citar abonos y albaranes en sus líneas sin serlo.
 */
export function detectKind(text: string): "PURCHASE" | "CREDIT" | "DELIVERY" {
  const h = header(text);
  if (/\babono\b|nota\s+de\s+cr[eé]dito|rectificativa/i.test(h)) return "CREDIT";
  if (/albar[aá]n/i.test(h) && !/factura/i.test(h)) return "DELIVERY";
  return "PURCHASE";
}

const unique = (a: string[]) => [...new Set(a.map((x) => x.trim().toUpperCase()).filter(Boolean))];

/**
 * Referencias que cita el documento:
 *  - albaranes: «Albarán nº 413323642» (facturas) o «ABONO ALB. 413163104» (abonos)
 *  - facturas: «FRA. F02000R-122115» (abonos)
 */
export function documentRefs(text: string) {
  const albaranes = [
    ...[...text.matchAll(/albar[aá]n\s*n[º°o.]*\s*(\d{4,})/gi)].map((m) => m[1]),
    ...[...text.matchAll(/abono\s+alb\.?\s*(\d{4,})/gi)].map((m) => m[1]),
    ...[...text.matchAll(/\balb\.:\s*(\d{6,})/gi)].map((m) => m[1]), // maquetación «S/PDO»: «ALB.: 263013759»
  ];
  // «FRA. F02000R-122115», o con el número partido en dos líneas: «FRA. F02000R-» … «122115».
  const facturas = [
    ...[...text.matchAll(/\bfra\.?\s*([A-Z]\d{4,6}[A-Z]?-\d+)/gi)].map((m) => m[1]),
    ...[...text.matchAll(/\bfra\.?\s*([A-Z]\d{4,6}[A-Z]?)-[^\n]*\n\s*(\d{3,})\b/gi)].map((m) => `${m[1]}-${m[2]}`),
    ...[...text.matchAll(/\bfra\.[^\n]*\n\s*([A-Z]\d{4,6}[A-Z]?-\d+)/gi)].map((m) => m[1]),
  ];
  return { albaranes: unique(albaranes), facturas: unique(facturas) };
}
