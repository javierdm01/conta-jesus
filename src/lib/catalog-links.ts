// Enlaces y cálculos del catálogo que no necesitan base de datos (se usan en el navegador y en el servidor).

/** Búsqueda en el catálogo de Sonepar por la referencia (el precio se ve con la sesión iniciada en su web). */
export const soneparSearchUrl = (i: { supplier: string; supplierRef: string; reference: string }) =>
  /sonepar/i.test(i.supplier) && (i.supplierRef || i.reference) ? `https://sonepar.es/catalog/es-es/search/${encodeURIComponent(i.supplierRef || i.reference)}` : "";

/** Cuánto ha subido (+) o bajado (−) el precio actual respecto al que pagaste, en %. */
export const variation = (paid: number | null | undefined, current: number | null | undefined) =>
  paid && current && paid > 0 && current > 0 ? Math.round((current / paid - 1) * 1000) / 10 : null;
