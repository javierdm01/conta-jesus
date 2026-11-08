import { parsePrice, type CatalogRow } from "./catalog-csv";

type Product = {
  referencia_sonepar?: string | null;
  referencia_fabricante?: string | null;
  marca?: string | null;
  nombre?: string | null;
  precios_mostrados?: string[];
  unidad_precio?: string | null;
};

/**
 * Lee el JSON "Ya comprado" de Sonepar. Precio = el último de los mostrados (neto por unidad o por metro);
 * si no hay precio se importa a 0 para completarlo después. Los portes no son un material y se saltan.
 */
export function parseSoneparJson(text: string) {
  const data = JSON.parse(text) as { productos?: Product[] };
  if (!Array.isArray(data.productos)) throw Error("El archivo no tiene la lista «productos».");
  const items: CatalogRow[] = [];
  let skipped = 0,
    withoutPrice = 0;
  for (const p of data.productos) {
    const name = (p.nombre ?? "").trim(),
      sonepar = (p.referencia_sonepar ?? "").trim();
    if (!name || sonepar === "PORTES-PROVEEDOR") {
      skipped++;
      continue;
    }
    // "SIMON-Tecla…" → marca SIMON, descripción «Tecla…». Sin marca informada se intenta con el prefijo.
    const brand = (p.marca ?? /^([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 ]{1,24})-/.exec(name)?.[1] ?? "").trim();
    const description = (brand && name.startsWith(`${brand}-`) ? name.slice(brand.length + 1) : name).trim();
    const shown = p.precios_mostrados ?? [];
    const price = shown.length ? parsePrice(shown[shown.length - 1]) : null;
    if (price === null) withoutPrice++;
    items.push({
      reference: (p.referencia_fabricante ?? "").trim().slice(0, 80),
      description: description.slice(0, 200),
      brand: brand.slice(0, 80),
      unit: /metro/i.test(p.unidad_precio ?? "") ? "m" : "ud",
      price: price ?? "0",
      supplier: "Sonepar",
      supplierRef: sonepar.slice(0, 80),
    });
  }
  return { items, skipped, withoutPrice };
}
