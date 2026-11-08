export type CatalogRow = { reference: string; description: string; brand: string; unit: string; price: string; supplier?: string; supplierRef?: string };

const HEADERS: Record<"reference" | "description" | "brand" | "unit" | "price", string[]> = {
  reference: ["referencia", "ref", "codigo", "código", "sku", "reference"],
  description: ["descripcion", "descripción", "nombre", "articulo", "artículo", "producto", "description"],
  brand: ["marca", "fabricante", "brand"],
  unit: ["unidad", "ud", "unidades", "unit"],
  price: ["precio", "pvp", "coste", "costo", "tarifa", "importe", "price"],
};

// "1.234,56" · "12,5" · "12.50" · "12,50 €" → "1234.56" · "12.5" · "12.50"
export function parsePrice(raw: string) {
  let t = raw.replace(/[^\d.,-]/g, "");
  if (!t) return null;
  const comma = t.lastIndexOf(","),
    dot = t.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) t = comma > dot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (comma >= 0) t = t.replace(",", ".");
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? String(n) : null;
}

function splitLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** Lee un CSV de Excel (separador ; , o tabulador) con cabecera. Devuelve las filas válidas y los errores por línea. */
export function parseCatalogCsv(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (lines.length < 2) return { items: [] as CatalogRow[], errors: ["El archivo necesita una cabecera y al menos una fila."] };
  const sep = [";", "\t", ","].map((s) => [s, lines[0].split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = (k: keyof typeof HEADERS) => head.findIndex((h) => HEADERS[k].includes(h));
  const idx = { reference: col("reference"), description: col("description"), brand: col("brand"), unit: col("unit"), price: col("price") };
  if (idx.description < 0 || idx.price < 0)
    return { items: [], errors: ["Faltan columnas: hacen falta al menos «descripción» y «precio»."] };
  const items: CatalogRow[] = [];
  lines.slice(1).forEach((line, n) => {
    const c = splitLine(line, sep),
      get = (i: number) => (i >= 0 ? (c[i] ?? "") : "");
    const price = parsePrice(get(idx.price)),
      description = get(idx.description).slice(0, 200);
    if (!description || price === null) return void errors.push(`Línea ${n + 2}: falta la descripción o el precio.`);
    const unit = get(idx.unit).toLowerCase().slice(0, 12) || "ud";
    items.push({
      reference: get(idx.reference).slice(0, 80),
      description,
      brand: get(idx.brand).slice(0, 80),
      unit: ["uds", "unidad", "unidades"].includes(unit) ? "ud" : unit,
      price,
    });
  });
  return { items, errors };
}
