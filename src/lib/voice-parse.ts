// Entiende órdenes habladas frecuentes SIN IA (0 tokens). Lo que no reconoce pasa al modelo.
export type Intent =
  | { action: "hours"; customer?: string; job?: string; start: string; end: string; date?: string }
  | { action: "expense"; category?: string; amount: number; concept?: string; date?: string }
  | { action: "job"; customer: string; name: string }
  | { action: "material"; item: string; quantity: number; customer?: string; job?: string }
  | { action: "contact"; kind: "customer" | "supplier"; name: string; phone?: string };

const NUM: Record<string, number> = {
  cero: 0, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintidos: 22, veintitres: 23, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
};
/** Minúsculas sin acentos, un carácter por carácter: los índices coinciden con el texto original. */
const plain = (t: string) => [...t].map((c) => c.normalize("NFD")[0].toLowerCase()).join("");
const words = (n: string) =>
  n.replace(/\bla una\b/g, "la 1").replace(/\b[a-z]+\b/g, (w) => (w in NUM ? String(NUM[w]) : w));
const cap = (s: string) => s.trim().replace(/[,.;]+$/, "").replace(/^./, (c) => c.toUpperCase());

const T = String.raw`(\d{1,2})(?:[:.h]\s?(\d{2}))?(?:\s+(y media|y cuarto|menos cuarto|y \d{1,2}))?`;
const HOURS = new RegExp(String.raw`\b(?:de|desde)\s+(?:las?\s+)?${T}\s+(?:a|hasta)\s+(?:las?\s+)?${T}\b`);
const minutes = (h: string, m: string | undefined, s: string | undefined) => {
  let v = Number(h) * 60 + (m ? Number(m) : 0);
  if (s === "y media") v += 30;
  else if (s === "y cuarto") v += 15;
  else if (s === "menos cuarto") v -= 15;
  else if (s?.startsWith("y ")) v += Number(s.slice(2));
  return v;
};
const hhmm = (v: number) => `${String(Math.floor(v / 60) % 24).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;

/** «de 8 y media a 5 y media» → 08:30–17:30 (si el fin sale antes del inicio, es por la tarde). */
export function spokenRange(text: string) {
  const m = HOURS.exec(words(plain(text)));
  if (!m) return null;
  const s = minutes(m[1], m[2], m[3]);
  let e = minutes(m[4], m[5], m[6]);
  if (e <= s && e + 720 > s) e += 720;
  if (s >= 24 * 60 || e > 24 * 60 || e <= s) return null;
  return { start: hhmm(s), end: hhmm(e) };
}

const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
/** Fecha hablada → «today», «yesterday», «2daysago» o «weekday:N» (el día más reciente con ese nombre). */
export function spokenDate(text: string) {
  const n = plain(text);
  if (/\bantes de ayer\b|\banteayer\b/.test(n)) return "2daysago";
  if (/\bayer\b/.test(n)) return "yesterday";
  const d = DAYS.findIndex((x) => new RegExp(`\\b(?:el|este|pasado)\\s+${x}\\b`).test(n));
  return d >= 0 ? `weekday:${d}` : undefined;
}

const CATEGORY: [RegExp, string][] = [
  [/gasolina|gasoil|diesel|combustible|repsol|cepsa/, "COMBUSTIBLE"],
  [/autonomo|cuota/, "AUTONOMO"],
  [/seguro/, "SEGURO"],
  [/coche|furgoneta|vehiculo|itv|peaje|taller|neumatico|reparacion/, "VEHICULO"],
  [/comida|dieta|restaurante|hotel|menu|almuerzo|cena|desayuno/, "DIETAS"],
];

export function parseCommand(text: string): Intent | null {
  const n = plain(text),
    nd = words(n);
  // Crear trabajo: «crea un trabajo para Juan que se llame Reforma baño»
  const job = /\b(?:crea|crear|nuevo|abre|abrir|anade|anadir)\s+(?:un\s+)?trabajo\s+(?:para|de)\s+(?:el\s+|la\s+)?(?:cliente\s+)?(.+?)\s+(?:que se llame|que se llama|llamado|de nombre|con nombre)\s+(.+)$/d.exec(n);
  if (job) {
    const [[c0, c1], [n0, n1]] = [job.indices![1], job.indices![2]];
    return { action: "job", customer: cap(text.slice(c0, c1)), name: cap(text.slice(n0, n1)) };
  }
  // Alta de contacto: «créame al cliente Francisco», «añade a Francisco como cliente», «nuevo proveedor Sonepar con el teléfono 600 123 456»
  const VERB = String.raw`\b(?:cre|haz|hazme|nuevo|nueva|abre|anad|registr|da de alta|dame de alta|apunt|agreg|pon|mete)\w*`;
  const ct =
    new RegExp(String.raw`${VERB}\s+(?:(?:un|una|el|la|al|a la|a el|a)\s+)?(?:nuevo\s+|nueva\s+)?(cliente|proveedor)\s*(?:que se llame|que se llama|llamado|llamada|de nombre|con nombre|de|:)?\s*(.+)$`, "d").exec(n) ??
    new RegExp(String.raw`${VERB}\s+(?:(?:un|una|el|la|al|a la|a)\s+)?(?:nuevo\s+|nueva\s+)?(.+?)\s+como\s+(?:un\s+|una\s+)?(cliente|proveedor)\b(.*)$`, "d").exec(n);
  if (ct) {
    const byKind = ct[1] === "cliente" || ct[1] === "proveedor";
    const kind = (byKind ? ct[1] : ct[2]) === "cliente" ? "customer" : "supplier";
    const [a, b] = ct.indices![byKind ? 2 : 1];
    const rest = byKind ? n.slice(a, b) : n.slice(ct.indices![3][0]) + " " + n.slice(a, b);
    const phone = /(?:telefono|movil|numero|tlf)\s+(?:es\s+|el\s+|del\s+)?((?:\+?\d[\s.-]?){9,13})/.exec(words(rest))?.[1].replace(/[\s.-]/g, "");
    const raw = text.slice(a, b).replace(/^(?:se llama|se llame)\s+/i, "");
    const name = cap(raw.replace(/\s+(?:con|que|y|su|cuyo|telefono|movil|numero)\b.*$/i, ""));
    if (name) return { action: "contact", kind, name, ...(phone ? { phone } : {}) };
  }
  const range = spokenRange(text);
  if (range) {
    const date = spokenDate(text);
    // Cliente: lo que sigue a «cliente» hasta una palabra de enlace.
    const c = /\bcliente\s+(.+?)(?=\s+(?:en|con|que|para|ayer|hoy|el ultimo)\b|$)/.exec(n);
    const customer = c ? cap(text.slice(c.index + c[0].length - c[1].length, c.index + c[0].length)) : undefined;
    let jobRef: string | undefined;
    if (/\bultimo trabajo\b|\btrabajo mas reciente\b/.test(n)) jobRef = "last";
    else {
      const j = /\b(?:en|del|de)\s+(?:el\s+)?trabajo\s+(?:de\s+|del\s+|llamado\s+)?(.+?)(?=\s+(?:ayer|hoy|con|para)\b|$)/.exec(n);
      if (j) jobRef = cap(text.slice(j.index + j[0].length - j[1].length, j.index + j[0].length));
    }
    return { action: "hours", customer, job: jobRef, ...range, date };
  }
  // Material: «agrega un amortiguador al último trabajo de Mari Carmen»
  const mat = /\b(?:agrega|anade|anadir|pon|ponle|mete|apunta|usa|gasta|suma|incluye)\w*\s+(?:(\d+|\w+)\s+)?(.+?)\s+(?:al|en el|a el)\s+(ultimo\s+)?trabajo\b(?:\s+(?:de|del)\s+(?:cliente\s+)?(.+))?$/d.exec(n);
  if (mat) {
    const q = mat[1] && (/^\d+$/.test(mat[1]) ? Number(mat[1]) : mat[1] === "un" || mat[1] === "una" ? 1 : NUM[mat[1]]);
    const [i0, i1] = q ? mat.indices![2] : [mat.indices![0][0] + mat[0].search(/\s/) + 1, mat.indices![2][1]];
    const c = mat.indices![4];
    return { action: "material", item: cap(text.slice(i0, i1)), quantity: q || 1, customer: c ? cap(text.slice(c[0], c[1])) : undefined, job: mat[3] || !c ? "last" : undefined };
  }
  // Gasto: «apunta un gasto de gasolina de 40 euros»
  const amount = /(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|€|eur)\b/.exec(nd);
  if (amount && /\b(?:gasto|gastos|ticket|gasolina|factura de)\b/.test(n)) {
    const cat = CATEGORY.find(([re]) => re.test(n))?.[1];
    return { action: "expense", category: cat, amount: Number(amount[1].replace(",", ".")), date: spokenDate(text) };
  }
  return null;
}
