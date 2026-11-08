// Facturas y abonos de Sonepar en PDF con texto: número, fecha y totales se leen de sus posiciones fijas
// (más fiable que la lectura genérica). Hay dos maquetaciones: «F02000R-…» y la de «S/PDO».
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export type SoneparDoc = {
  number: string;
  date: string; // AAAA-MM-DD
  /** Importes en valor absoluto; el tipo (factura/abono) lo da el título. */
  net: string;
  tax: string;
  total: string;
  /** base + IVA = total (±0,02). Si no, no te fíes de la lectura. */
  consistent: boolean;
  /** Líneas tal como se imprimen (importe ya con descuento); en abono, con signo negativo. */
  lines: SoneparLine[];
};
export type SoneparLine = { code: string; description: string; reference: string; brand: string; quantity: string; price: string; discount: string; net: string };

export function parseSoneparPdf(text: string): SoneparDoc | null {
  if (!/sonepar/i.test(text)) return null;
  const cut = text.search(/descripci[oó]n/i);
  const head = cut > 0 ? text.slice(0, cut) : text.slice(0, 1500);
  let number = "",
    date = "";
  const a = /\b([FA]\d{4,6}[A-Z]?-\d+)\b/.exec(head);
  if (a) {
    number = a[1];
    date = /(\d{2})\/(\d{2})\/(\d{4})/.exec(head.slice(a.index))?.slice(1).reverse().join("-") ?? "";
  } else {
    const b = /(\d{3,})\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(head);
    if (b) {
      number = b[1];
      date = `${b[4]}-${b[3]}-${b[2]}`;
    }
  }
  // Totales: tras «BASE IMPON…» vienen base, % IVA, IVA y, más abajo, «TOTAL … EUR».
  const at = text.search(/BASE\s+IMPON/i);
  if (!number || !date || at < 0) return null;
  const tail = text.slice(at).replace(/IMP\.%\w+|%R\.E\.|%IVA/gi, " ");
  const triples = [...tail.matchAll(/(-?\d[\d.]*,\d{2})\s+(\d{1,2},\d{2})\s+(-?\d[\d.]*,\d{2})/g)];
  const eur = /(-?\d[\d.]*,\d{2})\s*EUR/.exec(tail);
  if (!triples.length || !eur) return null;
  const net = triples.reduce((s, m) => s + num(m[1]), 0),
    tax = triples.reduce((s, m) => s + num(m[3]), 0),
    total = num(eur[1]);
  return {
    number,
    date,
    lines: soneparLines(text),
    net: money(Math.abs(net)),
    tax: money(Math.abs(tax)),
    total: money(Math.abs(total)),
    consistent: Math.abs(net + tax - total) <= 0.02,
  };
}

// Línea de artículo: código, descripción, cantidad, precio, [% descuento] e importe; la siguiente línea trae «Ref.Prov: … Marca: …».
const LINE = /^\s*([A-Z0-9][\w-]*)\s+(.+?)\s+(-?[\d.]*\d,\d{2})\s+(-?[\d.]*\d,\d{2,6})\s+(?:(-?\d{1,3},\d{2})\s+)?(-?[\d.]*\d,\d{2})\s*$/;
const FEE = /^\s*(COSTE\s+RAEE.*?)\s+(-?\d[\d.]*,\d{2,6})\s+(-?[\d.]*\d,\d{2})\s*$/i;
function soneparLines(text: string): SoneparLine[] {
  const rows = text.split("\n");
  const out: SoneparLine[] = [];
  rows.forEach((row, i) => {
    // Tasa de reciclaje (RAEE/ECOPILA): solo precio e importe; la cantidad sale de dividir. Forma parte de la base.
    const fee = FEE.exec(row);
    if (fee) {
      const price = num(fee[2]), net = num(fee[3]);
      out.push({ code: "RAEE", description: fee[1].replace(/\s+/g, " ").trim(), reference: "", brand: "", quantity: String(price ? Math.round(net / price) : 1), price: String(price), discount: "0", net: money(net) });
      return;
    }
    const m = LINE.exec(row);
    if (!m) return;
    // La referencia del fabricante cuelga de una de las dos líneas siguientes (o tres, si la descripción se parte).
    const ref = /Ref\.Prov:[ \t]*(.+?)[ \t]{2,}Marca:[ \t]*([^\n]*)/.exec(rows.slice(i + 1, i + 4).join("\n"));
    out.push({
      code: m[1],
      description: m[2].replace(/\s+/g, " ").trim(),
      reference: ref?.[1].trim() ?? "",
      brand: ref?.[2].trim() ?? "",
      quantity: String(num(m[3])),
      price: String(num(m[4])),
      discount: m[5] ? String(num(m[5])) : "0",
      net: money(num(m[6])),
    });
  });
  return out;
}
