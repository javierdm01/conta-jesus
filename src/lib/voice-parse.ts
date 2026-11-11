// Entiende órdenes habladas frecuentes SIN IA (0 tokens). Lo que no reconoce pasa al modelo.
export type Intent =
  | { action: "hours"; customer?: string; job?: string; start: string; end: string; date?: string }
  | { action: "expense"; category?: string; amount: number; concept?: string; date?: string }
  | { action: "job"; customer: string; name: string }
  | { action: "material"; item: string; quantity: number; customer?: string; job?: string }
  | { action: "contact"; kind: "customer" | "supplier"; name: string; phone?: string }
  | { action: "find"; kind?: "customer" | "supplier"; name: string }
  | { action: "query"; entity: "jobs" | "unpaid" | "stock" | "hours" | "customers" | "suppliers" | "quotes" | "lowstock"; name?: string }
  | { action: "status"; customer?: string; job?: string; status: "Finalizado" | "En proceso" }
  | { action: "payment"; customer?: string; number?: string; amount: number }
  | { action: "approve"; customer?: string; job?: string };

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

/** Cliente conocido (de la base de datos) mencionado en cualquier punto de la frase, aunque no diga «cliente». */
function knownCustomer(text: string, n: string, known: string[]) {
  const words = ` ${n.replace(/[^a-z0-9]+/g, ' ')} `;
  const hit = known.filter((k) => k.trim().length > 2 && words.includes(` ${plain(k).replace(/[^a-z0-9]+/g, ' ').trim()} `)).sort((a, b) => b.length - a.length)[0];
  return hit ? cap(hit) : undefined;
}
const ARTICLE = /^(?:la|el|los|las|lo|un|una|unos|unas)\s+/;

export function parseCommand(text: string, known: string[] = []): Intent | null {
  const n = plain(text),
    nd = words(n);
  // Crear trabajo: «crea un trabajo para Juan que se llame Reforma baño»
  const job = /\b(?:crea|crear|nuevo|abre|abrir|anade|anadir)\s+(?:un\s+)?trabajo\s+(?:para|de)\s+(?:el\s+|la\s+)?(?:cliente\s+)?(.+?)\s+(?:que se llame|que se llama|llamado|de nombre|con nombre)\s+(.+)$/d.exec(n);
  if (job) {
    const [[c0, c1], [n0, n1]] = [job.indices![1], job.indices![2]];
    return { action: "job", customer: cap(text.slice(c0, c1)), name: cap(text.slice(n0, n1)) };
  }
  // Crear trabajo sin «que se llame»: «crea un trabajo de instalación de aire a cliente Rodolfo», «crea un trabajo al cliente Rodolfo», «nuevo trabajo para Rodolfo»
  const j2 = /\b(?:cre|abr|anad|nuev|haz)\w*\s+(?:un\s+|el\s+)?(?:nuevo\s+)?trabajo\b(.*)$/d.exec(n);
  if (j2) {
    const rest = n.slice(j2.indices![1][0]), off = j2.indices![1][0];
    const m =
      /\s(?:para|a|al|a la|del?)\s+(?:el\s+|la\s+)?cliente\s+(.+)$/d.exec(rest) ??
      /(?:^|\s)(?:para|al|a la)\s+(?:el\s+|la\s+)?(.+)$/d.exec(rest);
    if (m) {
      const [c0, c1] = m.indices![1];
      const customer = cap(text.slice(off + c0, off + c1).replace(/[?!.¿¡\s]+$/, ""));
      const name = cap(text.slice(off, off + m.index).replace(/^\s*(?:de|que se llame|que se llama|llamado)\s+/i, "")) || "Trabajo";
      if (customer) return { action: "job", customer, name };
    }
  }
  // Estado de un trabajo: «marca como finalizado el último trabajo de Rodolfo», «reabre el último trabajo»
  const done = /\b(?:marca|marcar|pon|poner|deja|dejar|cierra|cerrar|da|dar|termina|terminar|finaliza|finalizar)\w*\b.*\b(?:finalizad\w*|terminad\w*|acabad\w*|cerrad\w*|finalizar|terminar)\b/.test(n);
  const reopen = /\b(?:reabre|reabrir|reabrelo|reabrela|vuelve a abrir)\b|\b(?:pon|marca|deja)\w*\b.*\ben proceso\b/.test(n);
  if ((done || reopen) && /\btrabajo\b/.test(n)) {
    const c = /\b(?:de|del)\s+(?:la\s+)?(?:cliente\s+)?(.+?)\s*[?!.]*$/d.exec(n.replace(/^.*\btrabajo\b/, ""));
    const tail = n.replace(/^.*\btrabajo\b/, "");
    const off = n.length - tail.length;
    const customer = c ? cap(text.slice(off + c.indices![1][0], off + c.indices![1][1])) : knownCustomer(text, n, known);
    return { action: "status", customer, job: "last", status: reopen && !done ? "En proceso" : "Finalizado" };
  }
  // Listados: «sácame una lista de todos los clientes», «muéstrame los trabajos de Rodolfo», «qué facturas tengo pendientes», «material con poco stock»
  const LISTS: [RegExp, "customers" | "suppliers" | "jobs" | "quotes" | "unpaid" | "lowstock"][] = [
    [/\bclientes\b/, "customers"],
    [/\bproveedores\b/, "suppliers"],
    [/\b(?:presupuestos?)\b/, "quotes"],
    [/\bfacturas?\b.*\b(?:pendientes?|sin cobrar|por cobrar|impagadas?)\b|\bpendientes? de cobro\b|\bque me deben\b/, "unpaid"],
    [/\b(?:poco|bajo|sin)\s+(?:stock|material|existencias)\b|\b(?:stock|material|existencias)\s+(?:bajo|minimo)\b|\bse (?:esta )?acaba/, "lowstock"],
    [/\btrabajos\b/, "jobs"],
  ];
  if (/\b(?:list|saca|muestr|ensen|dame|dime|ver|cuales|cuantos|cuantas|que|todos|todas)\w*\b/.test(n) && !/\b(?:crea|crear|nuevo|nueva|abre|anade|agrega)\b/.test(n)) {
    const hit = LISTS.find(([re]) => re.test(n));
    if (hit) {
      let name = "";
      if (hit[1] === "jobs") {
        const at = n.search(/trabajos/) + 8;
        const m = /^\s*(?:de|del|para)\s+(?:el\s+|la\s+)?(?:cliente\s+)?(.+?)\s*[?!.]*$/d.exec(n.slice(at));
        if (m) name = cap(text.slice(at + m.indices![1][0], at + m.indices![1][1]));
      }
      return { action: "query", entity: hit[1], ...(name ? { name } : {}) };
    }
  }
  // Consulta: «¿me puedes buscar el cliente Francisco Javier?», «dime los datos del proveedor Sonepar»
  const find = /\b(?:busca|buscar|buscame|encuentra|encontrar|encuentrame|dime|muestrame|datos|informacion|donde esta|quien es)\w*\b.*?\b(cliente|proveedor)\s+(.+)$/d.exec(n);
  if (find) {
    const [a, b] = find.indices![2];
    const name = cap(text.slice(a, b).replace(/[?!.¿¡\s]+$/, ""));
    if (name) return { action: "find", kind: find[1] === "cliente" ? "customer" : "supplier", name };
  }
  // Alta de contacto: «créame al cliente Francisco», «añade a Francisco como cliente», «nuevo proveedor Sonepar con el teléfono 600 123 456»
  const VERB = String.raw`\b(?:cre|haz|hazme|nuevo|nueva|abre|anad|registr|da de alta|dame de alta|apunt|agreg|pon|mete)\w*`;
  const ct =
    new RegExp(String.raw`${VERB}\s+(?:(?:un|una|el|la|al|a la|a el|a)\s+)?(?:nuevo\s+|nueva\s+)?(cliente|proveedor|usuario)\s*(?:que se llame|que se llama|llamado|llamada|de nombre|con nombre|de|:)?\s*(.+)$`, "d").exec(n) ??
    new RegExp(String.raw`${VERB}\s+(?:(?:un|una|el|la|al|a la|a)\s+)?(?:nuevo\s+|nueva\s+)?(.+?)\s+como\s+(?:un\s+|una\s+)?(cliente|proveedor)\b(.*)$`, "d").exec(n);
  if (ct) {
    const byKind = ct[1] === "cliente" || ct[1] === "proveedor" || ct[1] === "usuario";
    const kind = (byKind ? ct[1] : ct[2]) === "proveedor" ? "supplier" : "customer"; // «usuario» = cliente
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
    let customer = c ? cap(text.slice(c.index + c[0].length - c[1].length, c.index + c[0].length)) : undefined;
    customer ??= knownCustomer(text, n, known);
    // Sin la palabra «cliente»: «… con Juan», «… para María José».
    if (!customer) {
      const w = /\b(?:con|para)\s+(?:el\s+|la\s+)?(?!ultimo\b|trabajo\b)(.+?)(?=\s+(?:en|que|ayer|hoy|el ultimo)\b|$)/.exec(n);
      if (w) customer = cap(text.slice(w.index + w[0].length - w[1].length, w.index + w[0].length));
    }
    let jobRef: string | undefined;
    if (/\bultimo trabajo\b|\btrabajo mas reciente\b/.test(n)) jobRef = "last";
    else {
      const j = /\b(?:en|del|de)\s+(?:el\s+)?trabajo\s+(?:de\s+|del\s+|llamado\s+)?(.+?)(?=\s+(?:ayer|hoy|con|para)\b|$)/.exec(n);
      if (j) jobRef = cap(text.slice(j.index + j[0].length - j[1].length, j.index + j[0].length));
    }
    // «en el trabajo de Mari Carmen»: si lo que sigue es un cliente conocido, es el cliente, no el nombre del trabajo.
    const jc = jobRef && jobRef !== "last" ? known.find((k) => plain(k) === plain(jobRef!)) : undefined;
    if (jc) (customer ??= cap(jc)), (jobRef = "last");
    return { action: "hours", customer, job: jobRef, ...range, date };
  }
  // Material: verbo + objeto + «(que hay) para/en/a/al (el/un) (último) trabajo» + cliente opcional.
  // «agrega un amortiguador al último trabajo de Mari Carmen», «añade la suspensión que hay para un trabajo del cliente Federico»
  const mat = /\b(?:agreg|anad|pon|met|us|gast|sum|inclu|apunt)\w*\s+(.+?)\s+(?:que (?:hay|tenemos|tengo)\s+)?(?:para|en|a|al)\s+(?:el\s+|un\s+|ese\s+)?(ultimo\s+)?trabajo\b(.*)$/d.exec(n);
  if (mat) {
    const [i0, i1] = mat.indices![1];
    let item = text.slice(i0, i1);
    const first = plain(item.split(/\s+/)[0]);
    const q = /^\d+$/.test(first) ? Number(first) : first === "un" || first === "una" ? 1 : NUM[first];
    if (q) item = item.replace(/^\S+\s+/, "");
    item = item.replace(ARTICLE, "").replace(/\s+que (?:hay|tenemos|tengo)\b.*$/i, "");
    const rest = mat[3] ?? "";
    const c = /\b(?:de|del)\s+(?:la\s+)?(?:cliente\s+)?(.+?)\s*$/.exec(rest);
    const customer = c ? cap(text.slice(mat.index + mat[0].length - rest.length + c.index + c[0].length - c[1].length, mat.index + mat[0].length)) : knownCustomer(text, n, known);
    if (item.trim()) return { action: "material", item: cap(item), quantity: q || 1, customer, job: mat[2] || !customer ? "last" : undefined };
  }
  // Gasto: «apunta un gasto de gasolina de 40 euros»
  const amount = /(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|€|eur)\b/.exec(nd);
  if (amount && /\b(?:gasto|gastos|ticket|gasolina|factura de)\b/.test(n)) {
    const cat = CATEGORY.find(([re]) => re.test(n))?.[1];
    return { action: "expense", category: cat, amount: Number(amount[1].replace(",", ".")), date: spokenDate(text) };
  }
  return null;
}
