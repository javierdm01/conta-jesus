import { lineNet, documentLineNet, dec, sum, cents } from "./money";
import { matchSupplier, type SupplierCandidate } from "./supplier-match";
export type OcrSuggestion = {
  number?: string;
  date?: string;
  net?: string;
  tax?: string;
  supplierId?: string;
  supplier?: { name: string; taxId: string; phone: string; email: string };
  supplierCandidates?: SupplierCandidate[];
  total?: string;
  taxRate?: number;
  lines: {
    description: string;
    reference: string;
    quantity: string;
    unit: string;
    price: string;
    discount: string;
    family: string;
    financial?: boolean;
    brand?: string;
    model?: string;
    observedUnitPrice?: string;
  }[];
  warnings: string[];
};
function numeric(s: string): string | undefined {
  const clean = s
    .replace(/\s|€/g, "")
    .replace(/[.,]$/, "")
    .replace(/([.,]\d{4})0+$/, "$1");
  if (clean.startsWith("-")) {
    const value: string | undefined = numeric(clean.slice(1));
    return value === undefined ? undefined : `-${value}`;
  }
  if (/^\d{1,3}(,\d{3})+\.\d{1,4}$/.test(clean))
    return clean.replaceAll(",", "");
  if (/^\d{1,3}(\.\d{3})*,\d{1,4}$/.test(clean))
    return clean.replaceAll(".", "").replace(",", ".");
  if (/^\d+,\d{1,4}$/.test(clean)) return clean.replace(",", ".");
  if (/^\d+(\.\d{1,4})?$/.test(clean)) return clean;
  return undefined;
}
const unitOf = (u: string) => {
  const x = u.toLowerCase();
  if (/^(uds?|unids?|unidad|unidades|u)$/.test(x)) return "ud";
  if (/^(m|ml|mt|mts|metros?)$/.test(x)) return "m";
  if (/^rollos?$/.test(x)) return "rollo";
  if (/^packs?$/.test(x)) return "pack";
  if (/^lt$/.test(x)) return "l";
  return x;
};
// Referencia de fabricante al inicio de la descripción: se propone, sin alterar la descripción.
const leadingReference = (d: string) => {
  const t = d.trim().split(/\s+/);
  return t.length > 1 &&
    /^[A-Z0-9][A-Z0-9._/-]{3,24}$/.test(t[0]) &&
    /\d/.test(t[0]) &&
    /[A-Z]/.test(t[0])
    ? t[0]
    : "";
};
export function productFamily(description: string) {
  const d = description.toLowerCase();
  if (/magnetot|diferencial|sobretensi/.test(d)) return "Protección eléctrica";
  if (/conmutador|tecla|salida\s*(?:de\s+)?cable|mecanismo/.test(d))
    return "Mecanismos eléctricos";
  if (/cable|h07|rv-k|rz1/.test(d)) return "Cableado";
  if (/magnetot|diferencial|sobretensi/.test(d)) return "Protección eléctrica";
  if (/tuber.*frigor|cobre.*[1-4]\//.test(d)) return "Tubería frigorífica";
  if (/canaleta/.test(d)) return "Canalizaciones";
  if (/split|aire acondicionado|unidad exterior|unidad interior/.test(d))
    return "Equipos de climatización";
  return "Sin clasificar";
}
export function parseOcr(
  text: string,
  suppliers: { id: string; name: string; taxId: string }[] = [],
  kind?: string,
): OcrSuggestion {
  const result: OcrSuggestion = {
    lines: [],
    warnings: [
      "Propuesta OCR: comprueba cada campo con el original antes de confirmar.",
    ],
  };
  const clean = text.replace(/[   ]/g, " ").replace(/\bSCIF\s*:/gi,"CIF:");
  if (/oferta\s*(?:de\s*)?venta|presupuesto/i.test(clean))
    result.warnings.push("El documento parece una oferta o presupuesto. No acredita una entrega ni una factura: comprueba su tipo antes de registrar una recepción.");
  if (clean.includes("[OCR_DECIMAL_COLUMN]"))
    result.warnings.push(
      "Se ha recuperado un separador decimal por el formato de la columna y la conciliación de líneas y base. Comprueba las cantidades e importes con el original.",
    );
  // Cabeceras en una fila y valores en la siguiente, habituales en facturas fotografiadas.
  const metadataRows = clean.split(/\r?\n/);
  const metadataBlock = clean.split(
    /(?:c[oó]digo|referencia).*descripci[oó]n/i,
  )[0];
  const tabularIdentity = metadataBlock.match(
    /\b\d{4,10}\s*\|?\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*\|?\s+([A-Z0-9]+[-/][A-Z0-9/-]+)/,
  );
  if (tabularIdentity) result.number = tabularIdentity[2];
  const positionedNumber=clean.match(/^Documento Nº ([A-Z0-9][A-Z0-9/-]{3,49})\s*$/m)?.[1];
  if(positionedNumber) result.number=positionedNumber;
  for (let i = 0; i < metadataRows.length; i++) {
    if (
      /fecha/i.test(metadataRows[i]) &&
      /n[uú]mero|n[º°]/i.test(metadataRows[i]) &&
      !/venc/i.test(metadataRows[i])
    ) {
      const values = metadataRows
        .slice(i + 1, i + 4)
        .join(" ")
        .replace(/\|/g, " ");
      const hit = values.match(
        /\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}\s+([A-Z0-9][A-Z0-9/._-]{1,49})\b/,
      );
      if (hit) result.number = hit[1];
    }
  }
  // Número: etiquetas habituales delante o detrás ("Nº factura: X", "Factura nº X").
  const candidates = [
    /(?:factura|albar[aá]n|invoice)\s*(?:n[uú]mero|n[uú]m\.?|n[.º°o\s]*|no\.?|:|#)\s*[:.]?\s*([A-Z0-9][A-Z0-9/._-]{1,49})/gi,
    /(?:n[uú]mero|n[uú]m\.?|n[.º°o]+)\s*(?:de\s+)?(?:factura|albar[aá]n|documento)\s*[:.]?\s*([A-Z0-9][A-Z0-9/._-]{1,49})/gi,
  ];
  for (const re of result.number ? [] : candidates) {
    const hit = [...clean.matchAll(re)].find(
      (m) =>
        /\d/.test(m[1]) &&
        !(kind === "PURCHASE" && /^albar[aá]n/i.test(m[0])) &&
        !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(m[1]),
    );
    if (hit) {
      result.number = hit[1].replace(/[._-]+$/, "");
      break;
    }
  }
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const valid = (y: number, m: number, d: number) => {
    const value = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return !isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
      ? value
      : undefined;
  };
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  const dateIn = (fragment: string) => {
    let m = fragment.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = fragment.match(
      /(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})(?!\d)/,
    );
    if (m) return valid(year(m[3]), +m[2], +m[1]);
    m = fragment.match(
      new RegExp(
        String.raw`(\d{1,2})\s+de\s+(${months.join("|")})\s+(?:de\s+)?(\d{4})`,
        "i",
      ),
    );
    if (m) return valid(+m[3], months.indexOf(m[2].toLowerCase()) + 1, +m[1]);
    return undefined;
  };
  if (tabularIdentity) result.date = dateIn(tabularIdentity[1]);
  const labelled = [
    ...clean.matchAll(/fecha([^\n\d]{0,28})([^\n]{0,40})/gi),
  ].filter((m) => !/venc|vto|pago|operaci/i.test(m[1]));
  for (const m of result.date ? [] : labelled) {
    const found = dateIn(m[2]);
    if (found) {
      result.date = found;
      break;
    }
  }
  if (!result.date && !labelled.length) {
    const all = new Set(
      [
        ...clean.matchAll(
          /\d{4}-\d{2}-\d{2}|\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*(?:\d{4}|\d{2})(?!\d)/g,
        ),
      ]
        .map((m) => dateIn(m[0]))
        .filter((x): x is string => !!x),
    );
    if (all.size === 1) {
      result.date = [...all][0];
      result.warnings.push(
        "Fecha tomada del único dato con formato de fecha: confírmala.",
      );
    }
  }
  if (!result.date) {
    for (let i = 0; i < metadataRows.length; i++) {
      if (
        /fecha/i.test(metadataRows[i]) &&
        !/venc|pago/i.test(metadataRows[i])
      ) {
        const found = dateIn(metadataRows.slice(i + 1, i + 3).join(" "));
        if (found) {
          result.date = found;
          break;
        }
      }
    }
  }
  const amounts = (pattern: RegExp) => [
    ...new Set(
      [...clean.matchAll(pattern)]
        .map((m) => numeric(m[1]))
        .filter((x): x is string => x !== undefined)
        .map(cents),
    ),
  ];
  const netValues = amounts(
      /(?:base imponible|base imp\.?|importe neto|total neto|total base|subtotal)\s*[:€]?\s*(\d[\d.,]*)/gi,
    ),
    taxValues = amounts(
      /(?:total i\.?v\.?a\.?|cuota i\.?v\.?a\.?|total impuestos|impuestos)\s*[:€]?\s*(\d[\d.,]*)/gi,
    ),
    totalValues = amounts(
      /(?:total oferta venta|total factura|total albar[aá]n|total a pagar|importe total|total documento|total general|total eur|total\s*€|total)\s*[:€]?\s*(\d[\d.,]*)/gi,
    );
  if (netValues.length === 1) result.net = netValues[0];
  if (taxValues.length === 1) result.tax = taxValues[0];
  // Resumen horizontal: Base imponible | IVA | Cuota IVA | Recargo | Total.
  for (let i = 0; i < metadataRows.length; i++) {
    if (
      !/base\s*imponible/i.test(metadataRows[i]) ||
      !/cuota\s*i\.?v\.?a/i.test(metadataRows[i])
    )
      continue;
    for (const row of metadataRows.slice(i + 1, i + 3)) {
      const values = [...row.replace(/\|/g, " ").matchAll(/-?\d[\d.,]*/g)]
        .map((m) => numeric(m[0]))
        .filter((v): v is string => v !== undefined);
      if (values.length < 5) continue;
      const [base, rate, quota, surcharge, total] = values.slice(-5);
      if (
        ["4", "10", "21"].some((r) => dec(rate).eq(r)) &&
        cents(dec(base).mul(rate).div(100)) === cents(quota) &&
        dec(base).plus(quota).plus(surcharge).eq(total)
      ) {
        result.net = cents(base);
        result.tax = cents(dec(quota).plus(surcharge));
        result.total = cents(total);
        result.taxRate = Number(rate);
      }
    }
  }
  if (netValues.length > 1)
    result.warnings.push(
      "Hay varios importes de base neta. Revisa el total del documento.",
    );
  if (taxValues.length > 1)
    result.warnings.push(
      "Hay varios importes de IVA. Revisa el total del documento.",
    );
  // Tablas de resumen "Base | % IVA | Cuota": solo se aceptan si base × tipo = cuota.
  if (!result.net || !result.tax) {
    const triples: { base: string; rate: number; quota: string }[] = [];
    for (const row of clean.split(/\r?\n/)) {
      const t = row.match(
        /(\d[\d.,]*)\s*(?:€)?\s+(4|10|21)(?:[.,]0+)?\s*%?\s+(\d[\d.,]*)/,
      );
      const base = t && numeric(t[1]),
        quota = t && numeric(t[3]);
      if (
        t &&
        base &&
        quota &&
        cents(dec(base).mul(t[2]).div(100)) === cents(quota)
      )
        triples.push({ base: cents(base), rate: +t[2], quota: cents(quota) });
    }
    if (triples.length) {
      const b = sum(triples.map((x) => x.base)),
        q = sum(triples.map((x) => x.quota));
      if (!result.net && !netValues.length) result.net = cents(b);
      if (!result.tax && !taxValues.length) result.tax = cents(q);
      if (new Set(triples.map((x) => x.rate)).size === 1)
        result.taxRate = triples[0].rate;
    }
  }
  if (totalValues.length) {
    result.total ??= totalValues.reduce((a, b) => (dec(b).gt(a) ? b : a));
    if (result.net && !result.tax && !taxValues.length) {
      const q = dec(result.total).minus(result.net);
      if (q.gte(0) && q.lte(dec(result.net).mul(0.22))) {
        result.tax = cents(q);
        result.warnings.push(
          "IVA calculado como total menos base: compruébalo en el original.",
        );
      }
    } else if (result.tax && !result.net && !netValues.length) {
      const b = dec(result.total).minus(result.tax);
      if (b.gt(0)) {
        result.net = cents(b);
        result.warnings.push(
          "Base calculada como total menos IVA: compruébala en el original.",
        );
      }
    } else if (
      result.net &&
      result.tax &&
      !dec(result.net).plus(result.tax).minus(result.total).abs().lte(0.02)
    )
      result.warnings.push(
        "Base + IVA no coincide con el total del documento: puede haber retención, recargo o un error de lectura.",
      );
  }
  if(result.net && result.tax) {
    const printed=[...clean.matchAll(/^\s*(\d+[.,]\d{2})\s*(?:eur|€)\s*$/gim)].map(m=>numeric(m[1])).filter((v):v is string=>!!v && dec(v).eq(dec(result.net!).plus(result.tax!)));
    if(printed.length) result.total=cents(printed[0]);
  }
  if (result.net && result.tax && !result.taxRate && dec(result.net).gt(0)) {
    const r = dec(result.tax).div(result.net).mul(100);
    for (const rate of [4, 10, 21])
      if (r.minus(rate).abs().lte(0.15)) result.taxRate = rate;
  }
  const match = matchSupplier(text, suppliers);
  const branch = metadataRows
    .slice(0, 20)
    .map(
      (r) =>
        r.match(/^\s*\d{1,3}\s+(SONEPAR\s+[^\n]+?)(?=\s{2,}\d|\s+CIF|$)/i)?.[1],
    )
    .find(Boolean);
  if (branch) {
    const phone =
      metadataRows
        .slice(0, 20)
        .join(" ")
        .match(/Tel\.?\s*:?\s*(\d{9})/i)?.[1] ?? "";
    result.supplier = { name: branch.replace(/[|]+$/g, "").trim(), taxId: "", phone, email: "" };
  }
  const taxRow = metadataRows.findIndex((row) =>
    /\b(?:CIF|NIF)\s*:?\s*[A-Z]\s*-?\s*\d{7,8}[A-Z0-9]?\b/i.test(row),
  );
  if (taxRow > 0) {
    const taxId = metadataRows[taxRow]
      .match(/\b(?:CIF|NIF)\s*:?\s*([A-Z]\s*-?\s*\d{7,8}[A-Z0-9]?)\b/i)?.[1]
      .replace(/[\s-]/g, "")
      .toUpperCase();
    const legal = metadataRows.slice(Math.max(0,taxRow-6),taxRow).reverse().find(r=>/\bS[\s._-]*[LA][\s.]*$/i.test(r.trim()));
    const name = (legal ?? metadataRows[taxRow - 1]).replace(/^\s*\d+\s+/, "").trim();
    const phone =
      metadataRows
        .slice(Math.max(0,taxRow-3), taxRow + 8)
        .join(" ")
        .match(/(?:tfno\.?|tel[féefono.]*|tel[eé]fono)\s*:?\s*([\d ]{9,16})/i)?.[1]
        .trim() ?? "";
    if (taxId && /[A-Za-zÁÉÍÓÚÑ]/.test(name))
      result.supplier = { name, taxId, phone, email: metadataRows.slice(Math.max(0,taxRow-3),taxRow+9).join(" ").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]??"" };
  }
  if (match.supplierId) {
    result.supplierId = match.supplierId;
    if (match.by === "name") {
      const top = match.candidates[0];
      result.warnings.push(
        `Proveedor elegido por nombre parecido: ${top.name} (${Math.round(top.score * 100)} %). Comprueba que es el emisor.`,
      );
    }
  } else if (match.by === "ambiguous")
    result.warnings.push(
      "Se reconocen varios NIF de proveedores. Selecciona el emisor correcto.",
    );
  else
    result.warnings.push(
      "No se reconoce al proveedor: selecciónalo o créalo antes de confirmar.",
    );
  if (match.candidates.length) result.supplierCandidates = match.candidates;
  const delivery = kind === "DELIVERY" || (!kind && /albar[aá]n/i.test(text));
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[.%:]/g, "")
      .trim();
  const split = (s: string) =>
    s
      .trim()
      .split(/\s*\|\s*|\t+| {2,}/)
      .filter(Boolean);
  const column = (s: string) => {
    const v = normalize(s);
    if (/^(ref|referencia|codigo|cod|articulo)$/.test(v)) return "reference";
    if (/^(descripcion|concepto|producto|detalle)$/.test(v))
      return "description";
    if (/^(cantidad|cant|qty)$/.test(v)) return "quantity";
    if (/^(unidad|ud|uds|um|u m)$/.test(v)) return "unit";
    if (/^(precio|precio unitario|p unitario|p unit|pvp)$/.test(v))
      return "price";
    if (/^(dto|descuento|dcto)$/.test(v)) return "discount";
    if (/^(importe|total|neto)$/.test(v)) return "total";
    return "other";
  };
  let columns: string[] | undefined;
  let invoiceTable = false,
    tableDiscounts = 0,
    unpricedTable = false;
  let activeLine: number | undefined;
  // Solo reconocer filas con cantidad, unidad, precio, descuento e importe explícitos.
  // No se infieren longitudes, tamaños de paquete, referencias ni precios omitidos.
  for (const original of text.split(/\r?\n|\f/)) {
    if (result.lines.length >= 500) {
      result.warnings.push(
        "Se han propuesto las primeras 500 líneas. Divide el documento si contiene más artículos.",
      );
      break;
    }
    let row = original.trim().replace(/DE\s+SCRIPCI[OÓ]N/gi, "DESCRIPCION")
      .replace(/\bPTO([123])\b/gi, "DTO$1");
    if (invoiceTable && activeLine !== undefined) {
      const branded = row
        .replace(/^[.>'"«]\s*/, "")
        .match(/^ABB\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)$/);
      if (branded) {
        const line = result.lines[activeLine];
        line.description += ` ABB ${branded[1]}`;
        line.model = branded[1];
        continue;
      }
      const auxiliary = row.match(
        /Ref\.?\s*Prov\.?\s*:?\s*(.+?)\s+Marca\s*:?\s*(.+)$/i,
      );
      if (auxiliary) {
        const line = result.lines[activeLine];
        line.model ??= auxiliary[1].trim();
        line.brand = auxiliary[2].trim();
        continue;
      }
      const repeatedModel=row.match(/^([A-Z0-9]+(?:\s+[A-Z0-9]+)*)\s+Marca\s*:\s*(.+)$/i);
      const current=result.lines[activeLine];
      if(repeatedModel && current.model && repeatedModel[1].replace(/\s/g,"").toUpperCase()===current.model.replace(/\s/g,"").toUpperCase()) {
        current.brand=repeatedModel[2].trim();
        continue;
      }
    }
    if (
      /descripci[oó]n/i.test(row) &&
      /cant(?:idad|ida)?\b/i.test(row) &&
      /precio/i.test(row) &&
      (/importe|total/i.test(row) || delivery)
    ) {
      invoiceTable = true;
      tableDiscounts = [...row.matchAll(/(?:dto|dcto|descuento)\s*[123z]?/gi)]
        .length;
      unpricedTable = !/importe|total/i.test(row);
      continue;
    }
    if (/base\s*imponible|imp\.?\s*bruto|forma de pago|vencimientos|PRODUCTOR|INFORMACI[OÓ]N DE ENTREGA/i.test(row))
      invoiceTable = false;
    if (invoiceTable) {
      const plain = row.replace(/[|{}'’]/g, " ").replace(/€/g, " ").replace(/(\d)\s+([.,]\d+)/g,"$1$2");
      if (unpricedTable) {
        const hit=plain.match(/^\s*([A-Z0-9][A-Z0-9._/-]{3,24})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*$/);
        if(hit) activeLine=undefined;
        if(hit && /\d/.test(hit[1]) && numeric(hit[3]) && numeric(hit[4]) && dec(numeric(hit[3])!).gt(0)) {
          result.lines.push({reference:hit[1],description:hit[2].trim(),quantity:numeric(hit[3])!,unit:"ud",price:"",observedUnitPrice:numeric(hit[4])!,discount:"0",family:productFamily(hit[2])});
          activeLine=result.lines.length-1;
          if(!result.warnings.some(w=>w.startsWith("Tabla sin importes"))) result.warnings.push("Tabla sin importes ni descuentos: se conserva el material sin coste. Los precios impresos no se aplican como coste neto; completa las condiciones de compra. Unidad propuesta: ud.");
          continue;
        }
      }
      const tokens = [...plain.matchAll(/(?<!\S)(-?\d[\d.,]*)(?=\s|$)/g)];
      const count = 3 + tableDiscounts;
      if (tokens.length >= count) {
        activeLine = undefined;
        const tail = tokens.slice(-count),
          values = tail.map((m) => numeric(m[1]));
        let prefix = plain.slice(0, tail[0].index).trim();
        // Eliminar marcas aisladas del margen, conservando códigos numéricos y alfanuméricos.
        const pieces = prefix
          .split(/ {2,}/)
          .map((p) => p.replace(/^[«('"|]+|[»)'"|]+$/g, ""))
          .filter(Boolean);
        const referenceIndex = pieces.findIndex(
          (p) => /^[A-Z0-9][A-Z0-9._/-]{3,24}$/.test(p) && /\d/.test(p),
        );
        let reference = "";
        if (referenceIndex >= 0 && pieces.length > referenceIndex + 1) {
          reference = pieces[referenceIndex];
          prefix = pieces.slice(referenceIndex + 1).join(" ");
        }
        prefix = prefix.replace(/^\*\)\s*/, "(*) ");
        const [quantity, price] = values,
          total = values.at(-1);
        const discounts = values.slice(2, -1);
        if (
          prefix.length >= 3 &&
          quantity &&
          price &&
          total &&
          discounts.every(
            (d) => d !== undefined && dec(d).gte(0) && dec(d).lte(100),
          )
        ) {
          const factor = discounts.reduce(
            (f, d) => f.mul(dec(1).minus(dec(d!).div(100))),
            dec(1),
          );
          const discount = dec(1)
            .minus(factor)
            .mul(100)
            .toDecimalPlaces(4)
            .toString();
          try {
            if (documentLineNet(quantity, price, discount) === cents(total)) {
              const printedUnit = plain
                .slice(tail[0].index! + tail[0][0].length, tail[1].index)
                .trim()
                .replace(/\.$/, "");
              const unit =
                /^(ud|uds|unid|unids|unidad|unidades|u|m|ml|mt|mts|metro|metros|rollo|rollos|pack|packs|kg|l|lt|h)$/i.test(
                  printedUnit,
                )
                  ? unitOf(printedUnit)
                  : "ud";
              const financial =
                dec(quantity).lt(0) ||
                /^(?:tasa|canon|impuesto|recargo)\b/i.test(prefix);
              result.lines.push({
                reference,
                description: prefix,
                quantity,
                unit,
                price,
                discount,
                family: productFamily(prefix),
                financial,
              });
              activeLine = result.lines.length - 1;
              if (
                !printedUnit &&
                !result.warnings.some((w) => w.startsWith("Unidad no impresa"))
              )
                result.warnings.push(
                  "Unidad no impresa en la tabla: se propone ud; comprueba si el proveedor factura metros, rollos u otra unidad.",
                );
              continue;
            }
          } catch {}
          result.warnings.push(`Importes sin conciliar: ${prefix}`);
        }
      }
      if (unpricedTable) continue;
      if (
        activeLine !== undefined &&
        /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 /().,+-]{2,65}$/.test(row) &&
        !/TOTAL|ALBAR|FACTURA|CLIENTE|IMPORTE|DESCRIPCI|CANT|PRECIO/.test(row)
      ) {
        result.lines.at(-1)!.description += ` ${row}`;
        continue;
      }
    }
    if (/^--- P[aá]gina \d+ ---$/.test(row)) {
      columns = undefined;
      continue;
    }
    const cells = split(row),
      header = cells.map(column);
    if (
      (["description", "quantity", "unit"] as string[]).every((c) =>
        (header as string[]).includes(c),
      ) &&
      new Set(header.filter((c) => c !== "other")).size ===
        header.filter((c) => c !== "other").length
    ) {
      columns = header;
      continue;
    }
    let reference = "";
    if (columns && cells.length === columns.length) {
      const cell = (c: string) => {
        const i = columns!.indexOf(c);
        return i < 0 ? undefined : cells[i];
      };
      reference = cell("reference") ?? "";
      row = `${cell("description")} ${cell("quantity")} ${cell("unit")}${cell("price") !== undefined ? ` ${cell("price")} ${(cell("discount") ?? "0").replace(/%/g, "")} % ${cell("total") ?? ""}` : ""}`;
    }
    const m = row.match(
      /^(.{3,180}?)\s+(\d[\d.,]*)\s+(ud|uds|unid|unids|unidad|unidades|u|m|ml|mt|mts|metro|metros|rollo|rollos|pack|packs|kg|l|lt|h)\.?\s+(\d[\d.,]*)\s*(?:€)?\s+(?:(\d[\d.,]*)\s*%\s+)?(\d[\d.,]*)\s*€?$/i,
    );
    if (!m) {
      if (delivery) {
        const unpriced = row.match(
          /^(.{3,180}?)\s+(\d[\d.,]*)\s+(ud|uds|unid|unids|unidad|unidades|u|m|ml|mt|mts|metro|metros|rollo|rollos|pack|packs|kg|l|lt)\.?\s*$/i,
        );
        if (
          unpriced &&
          !/^(total|cantidad|unidades|peso|p[aá]gina)/i.test(unpriced[1])
        ) {
          const q = numeric(unpriced[2]);
          if (q && Number(q) > 0) {
            const u = unitOf(unpriced[3]);
            if (["ud", "pack", "rollo"].includes(u) && !dec(q).isInteger())
              continue;
            result.lines.push({
              description: unpriced[1],
              reference: reference || leadingReference(unpriced[1]),
              quantity: q,
              unit: u,
              price: "",
              discount: "0",
              family: productFamily(unpriced[1]),
            });
          }
        }
      }
      continue;
    }
    const q = numeric(m[2]),
      price = numeric(m[4]),
      discount = numeric(m[5] ?? "0"),
      total = numeric(m[6]);
    if (!q || !price || !discount || !total) continue;
    try {
      if (!dec(lineNet(q, price, discount)).eq(total)) {
        result.warnings.push(`Importes sin conciliar: ${m[1]}`);
        continue;
      }
    } catch {
      continue;
    }
    const unit = unitOf(m[3]);
    if (["ud", "pack", "rollo"].includes(unit) && !dec(q).isInteger()) continue;
    result.lines.push({
      description: m[1],
      reference: reference || leadingReference(m[1]),
      quantity: q,
      unit,
      price,
      discount,
      family: productFamily(m[1]),
    });
  }
  if (
    result.net &&
    result.lines.length &&
    result.lines.every((l) => l.price !== "") &&
    !sum(
      result.lines.map((l) => documentLineNet(l.quantity, l.price, l.discount)),
    ).eq(result.net)
  )
    result.warnings.push(
      "Las líneas reconocidas no suman la base neta: puede faltar material, portes o descuentos. Revisa todas las páginas.",
    );
  if (!text.trim())
    result.warnings.push(
      "El documento no contiene texto legible. Comprueba la imagen o introduce los datos manualmente.",
    );
  if (!result.lines.length)
    result.warnings.push(
      "No se han reconocido líneas con todos los datos verificables. Introduce las líneas manualmente.",
    );
  return result;
}
