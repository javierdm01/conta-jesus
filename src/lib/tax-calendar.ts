// Calendario fiscal general de la AEAT para un autónomo o pyme. Fechas ORIENTATIVAS:
// los plazos habituales se mantienen año a año, pero conviene confirmarlos con tu asesoría.
// Si el último día cae en sábado o domingo, el plazo pasa al siguiente lunes.
// shortcut: no se conocen los festivos nacionales/autonómicos; añadirlos si un plazo cae en uno.
export type Deadline = {
  id: string;
  model: string; // "303", "130", "RETA"…
  title: string;
  period: string; // "1T 2026", "Enero 2026"…
  start: string; // AAAA-MM-DD
  end: string;
  bankEnd?: string; // último día si se domicilia el pago
  quarter?: 1 | 2 | 3 | 4; // trimestre al que se refiere (para preparar el paquete)
  year?: number;
  note: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
/** Sábado o domingo → lunes siguiente. */
export function nextBusinessDay(d: Date) {
  const r = new Date(d);
  while ([0, 6].includes(r.getUTCDay())) r.setUTCDate(r.getUTCDate() + 1);
  return r;
}
const shifted = (y: number, m: number, d: number) => iso(nextBusinessDay(utc(y, m, d)));
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Plazos cuyo vencimiento cae en el año natural indicado, ordenados por fecha. */
export function taxCalendar(year: number): Deadline[] {
  const out: Deadline[] = [];
  const quarterly = (q: 1 | 2 | 3 | 4) => {
    // 1T–3T se presentan en abril/julio/octubre; 4T en enero del año siguiente.
    const py = q === 4 ? year - 1 : year; // año al que pertenece el periodo
    const month = [0, 4, 7, 10, 1][q === 4 ? 4 : q];
    const period = `${q}T ${py}`;
    const last = q === 4 ? 30 : 20;
    const bank = q === 4 ? 25 : 15;
    const common = { period, quarter: q, year: py, start: shifted(year, month, 1) };
    out.push({
      ...common, id: `303-${py}-${q}`, model: "303", title: "IVA trimestral (modelo 303)",
      end: shifted(year, month, last), bankEnd: shifted(year, month, bank),
      note: "Declaras el IVA repercutido menos el soportado del trimestre.",
    });
    out.push({
      ...common, id: `130-${py}-${q}`, model: "130", title: "Pago fraccionado de IRPF (modelo 130)",
      end: shifted(year, month, last), bankEnd: shifted(year, month, bank),
      note: "Autónomos en estimación directa: pagas a cuenta de la renta con ingresos menos gastos.",
    });
    out.push({
      ...common, id: `111-${py}-${q}`, model: "111", title: "Retenciones de trabajadores y profesionales (modelo 111)",
      end: shifted(year, month, 20),
      note: "Solo si pagas nóminas o facturas de profesionales con retención.",
    });
    out.push({
      ...common, id: `115-${py}-${q}`, model: "115", title: "Retenciones por alquiler de local (modelo 115)",
      end: shifted(year, month, 20),
      note: "Solo si alquilas un local con retención.",
    });
  };
  quarterly(4);
  quarterly(1);
  quarterly(2);
  quarterly(3);
  out.push({
    id: `390-${year - 1}`, model: "390", title: "Resumen anual de IVA (modelo 390)", period: `Año ${year - 1}`,
    start: shifted(year, 1, 1), end: shifted(year, 1, 30), year: year - 1,
    note: "Resumen del IVA de todo el año anterior.",
  });
  out.push({
    id: `180-190-${year - 1}`, model: "180/190", title: "Resumen anual de retenciones (modelos 180 y 190)", period: `Año ${year - 1}`,
    start: shifted(year, 1, 1), end: shifted(year, 1, 31), year: year - 1,
    note: "Solo si presentaste retenciones durante el año.",
  });
  // 28 de febrero; 29 en bisiesto.
  out.push({
    id: `347-${year - 1}`, model: "347", title: "Operaciones con terceros (modelo 347)", period: `Año ${year - 1}`,
    start: shifted(year, 2, 1), end: iso(nextBusinessDay(utc(year, 3, 0))), year: year - 1,
    note: "Si con un cliente o proveedor superaste 3.005,06 € en el año.",
  });
  out.push({
    id: `100-${year - 1}`, model: "100", title: "Declaración de la renta (modelo 100)", period: `Año ${year - 1}`,
    start: shifted(year, 4, 2), end: shifted(year, 6, 30), year: year - 1,
    note: "La campaña la confirma cada año la AEAT; estas fechas son aproximadas.",
  });
  for (let m = 1; m <= 12; m++)
    out.push({
      id: `reta-${year}-${m}`, model: "RETA", title: "Cuota de autónomos", period: `${MONTHS[m - 1]} ${year}`,
      start: iso(utc(year, m, 1)), end: iso(utc(year, m + 1, 0)),
      note: "Se cobra por domiciliación el último día natural del mes.",
    });
  return out.sort((a, b) => a.end.localeCompare(b.end) || a.model.localeCompare(b.model));
}

/** Plazos que vencen desde `from` hasta `months` meses después. */
export function upcoming(from: Date, months = 12): (Deadline & { daysLeft: number })[] {
  const today = iso(from);
  const limit = new Date(from);
  limit.setUTCMonth(limit.getUTCMonth() + months);
  const y = from.getUTCFullYear();
  return [...taxCalendar(y), ...taxCalendar(y + 1)]
    .filter((d) => d.end >= today && d.end <= iso(limit))
    .map((d) => ({ ...d, daysLeft: Math.round((Date.parse(d.end) - Date.parse(today)) / 86400000) }));
}
