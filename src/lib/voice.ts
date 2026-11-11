import { db } from "@/lib/db";
import { AppError, type Actor } from "@/lib/access";
import { matchesSearch } from "@/lib/product-search";
import { dec } from "@/lib/money";

import { parseCommand, type Intent } from "@/lib/voice-parse";
import { jobPath } from "@/lib/job-path";
import { validateSql } from "@/lib/ai-sql";

export type Proposal = { text: string; summary: string; action: string; payload: Record<string, unknown> };
export type ListItem = { label: string; detail?: string; href?: string };
export type Reply = { transcript: string; proposal?: Proposal; message?: string; list?: { title: string; items: ListItem[] } };

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Fecha hablada → YYYY-MM-DD (hoy si no se dijo nada). */
function resolveDate(s?: string) {
  const d = new Date();
  if (s === "yesterday") d.setDate(d.getDate() - 1);
  else if (s === "2daysago") d.setDate(d.getDate() - 2);
  else if (s?.startsWith("weekday:")) {
    const back = (d.getDay() - Number(s.slice(8)) + 7) % 7;
    d.setDate(d.getDate() - back);
  }
  return iso(d);
}

type Trace = { model: string; promptTokens: number; completionTokens: number; ms: number; ok: boolean; error: string };
// Precio por millón de tokens (USD); por defecto gpt-4o-mini. Se puede ajustar con OPENAI_PRICE_IN / OPENAI_PRICE_OUT.
const PRICE_IN = Number(process.env.OPENAI_PRICE_IN ?? 0.15), PRICE_OUT = Number(process.env.OPENAI_PRICE_OUT ?? 0.6);
const costOf = (t: Trace) => (t.promptTokens * PRICE_IN + t.completionTokens * PRICE_OUT) / 1e6;

export async function recordVoice(u: Actor, row: { kind: string; transcript?: string; result?: string } & Partial<Trace>) {
  try {
    await db.voiceLog.create({
      data: {
        companyId: u.companyId,
        userId: u.id,
        kind: row.kind,
        transcript: (row.transcript ?? "").slice(0, 500),
        result: (row.result ?? "").slice(0, 500),
        model: row.model ?? "",
        promptTokens: row.promptTokens ?? 0,
        completionTokens: row.completionTokens ?? 0,
        costUsd: row.kind === "OPENAI" ? costOf(row as Trace) : 0,
        ms: row.ms ?? 0,
        ok: row.ok ?? true,
        error: (row.error ?? "").slice(0, 300),
      },
    });
  } catch {} // la trazabilidad nunca debe romper la orden
}

/** Pide al modelo solo el JSON de la orden (~400 tokens). Sin clave, no se llama. */
// Si OpenAI rechaza la clave, no se vuelve a intentar durante 10 minutos (cada intento fallido añadía latencia).
let llmDownUntil = 0;
const llmBroken = () => Date.now() < llmDownUntil;
type Ctx = { customers: string[]; jobs: string[] };

/** «Conocimiento» del asistente: qué acciones existen, qué variables lleva cada una y qué datos reales tiene la empresa. */
function systemPrompt(c: Ctx) {
  const d = new Date();
  return [
    `Eres el asistente de voz de una empresa de instalaciones eléctricas. Hoy es ${iso(d)} (${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d.getDay()]}).`,
    "Convierte la orden hablada en UN solo JSON, sin texto extra. Acciones y variables (? = opcional):",
    '- hours: {"action":"hours","customer"?,"job"?,"start":"HH:MM","end":"HH:MM","date"?}  registrar horas trabajadas.',
    '- material: {"action":"material","item":s,"quantity":n,"customer"?,"job"?}  material del almacén gastado en un trabajo (item sin artículo: "enchufe", no "los enchufes").',
    '- expense: {"action":"expense","category"?:AUTONOMO|SEGURO|VEHICULO|COMBUSTIBLE|DIETAS|OTHER,"amount":n,"concept"?,"date"?}  gasto de la empresa.',
    '- job: {"action":"job","customer":s,"name":s}  crear un trabajo nuevo para un cliente.',
    '- contact: {"action":"contact","kind":"customer"|"supplier","name":s,"phone"?}  dar de alta un cliente o proveedor (nunca es "job").',
    '- find: {"action":"find","kind"?:"customer"|"supplier","name":s}  buscar/consultar un cliente o proveedor que ya existe y decir sus datos.',
    '- query: {"action":"query","entity":"jobs"|"unpaid"|"stock"|"hours"|"customers"|"suppliers"|"quotes"|"lowstock","name"?:s}  consultas y listados: jobs = trabajos abiertos (name = cliente), unpaid = facturas pendientes de cobro (name = cliente), stock = existencias de un artículo (name), hours = horas acumuladas (name = cliente o trabajo), customers = lista de clientes, suppliers = lista de proveedores, quotes = presupuestos pendientes de aprobar, lowstock = material por debajo del mínimo.',
    '- status: {"action":"status","customer"?,"job"?,"status":"Finalizado"|"En proceso"}  marcar un trabajo como finalizado o reabrirlo.',
    '- payment: {"action":"payment","customer"?,"number"?,"amount":n}  registrar que un cliente ha pagado un importe de una factura (number = número de factura si lo dice).',
    '- approve: {"action":"approve","customer"?,"job"?}  aprobar el presupuesto de un trabajo.',
    '- none: {"action":"none"}  si no es ninguna de las anteriores.',
    'Valores: job = "last" si dice «último trabajo» o no concreta ninguno; date = "yesterday" | "2daysago" | "weekday:0-6" (0=domingo) o se omite si es hoy; horas en 24 h («5 y media» tras «8 y media» = 17:30).',
    "La transcripción puede tener errores de reconocimiento: corrige nombres usando las listas y devuelve el nombre EXACTO de la lista cuando haya coincidencia.",
    c.customers.length ? `Clientes: ${c.customers.join(", ")}.` : "",
    c.jobs.length ? `Trabajos abiertos (cliente · trabajo): ${c.jobs.join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}

/** La respuesta del modelo no es de fiar: solo se aceptan acciones conocidas con sus campos mínimos. */
function validIntent(o: Record<string, unknown>) {
  switch (o.action) {
    case "hours": case "expense": case "job": case "contact": case "material": return true;
    case "find": return typeof o.name === "string";
    case "query": return ["jobs", "unpaid", "stock", "hours", "customers", "suppliers", "quotes", "lowstock"].includes(String(o.entity));
    case "status": return o.status === "Finalizado" || o.status === "En proceso";
    case "payment": return Number(o.amount) > 0;
    case "approve": return true;
    default: return false;
  }
}

// Esquema que ve el modelo (solo nombres de tablas y columnas; nunca datos de la empresa).
const AI_SCHEMA = `PostgreSQL. Solo puedes consultar estas vistas (todo en minúsculas, ya filtradas por empresa y permisos):
ai.customers(id, name, tax_id, phone, email, address, hourly_rate)
ai.jobs(id, number, name, customer, status, service, address, worker, planned_at, opened_at, finished_at, archived)  -- status: 'Pendiente','En proceso','Finalizado','Facturado','Cobrado'
ai.sales(id, number, customer, job, date, due_at, net, tax, withholding, collected, total, pending)  -- facturas de venta; pending = lo que falta por cobrar
ai.quotes(id, number, name, customer, job, date, net, tax, total, approved)  -- presupuestos
ai.stock(id, name, reference, brand, unit, on_hand, minimum, location)  -- almacén; poco stock: on_hand <= minimum AND minimum > 0
ai.hours(date, worker, customer, job, hours, billable, activity, hourly_cost)  -- horas trabajadas
ai.suppliers(id, name, phone, email, contact)
ai.expenses(id, date, description, amount, tax, category)  -- gastos generales
ai.catalog(id, reference, description, brand, unit, price, supplier)  -- catálogo de materiales
Reglas: una sola sentencia SELECT (admite WITH, JOIN, GROUP BY, ORDER BY), sin punto y coma, sin comillas dobles, solo esas vistas y funciones de agregación/fecha habituales. Nombres de personas o cosas: ILIKE '%texto%'. Fechas: CURRENT_DATE, date_trunc('month', CURRENT_DATE). Importes en euros.`;

type Row = Record<string, unknown>;
const fmtCell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" }).format(v);
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "bigint") return v.toString();
  const n = typeof v === "number" ? v : typeof v === "object" && v !== null && "toNumber" in v ? (v as { toNumber(): number }).toNumber() : NaN;
  if (!Number.isNaN(n)) return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n);
  return String(v);
};

/** Ejecuta la consulta ya validada: transacción de solo lectura, rol sin permisos salvo las vistas «ai», tiempo y filas limitados. */
async function runReadOnly(u: Actor, sql: string): Promise<Row[]> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL ROLE ai_reader");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 4000");
      await tx.$queryRaw`SELECT set_config('app.company', ${u.companyId}, true), set_config('app.admin', ${u.role === "ADMIN" ? "1" : "0"}, true), set_config('app.worker', ${u.worker?.id ?? ""}, true)`;
      return (await tx.$queryRawUnsafe(`SELECT * FROM (${sql}) AS q LIMIT 100`)) as Row[];
    },
    { timeout: 8000 },
  );
}

/**
 * Pregunta abierta: el modelo solo ve el esquema y la pregunta, y devuelve una consulta SELECT que se valida y se ejecuta
 * aquí. Los datos nunca salen de la base de datos. Sirve a responsable y técnicos (cada uno ve solo lo suyo).
 */
async function chat(u: Actor, text: string, history: Turn[]): Promise<Reply | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || llmBroken()) return null;
  const model = process.env.OPENAI_VOICE_MODEL || "gpt-4o-mini";
  const t0 = Date.now();
  const trace: Trace = { model, promptTokens: 0, completionTokens: 0, ms: 0, ok: false, error: "" };
  const system = [
    `Eres el asistente de voz de una empresa de instalaciones eléctricas. Hoy es ${iso(new Date())}. Contestas preguntas consultando la base de datos con una consulta SELECT.`,
    AI_SCHEMA,
    'Responde SOLO con un JSON: {"sql": string, "say": string, "none": string, "title": string, "label": string, "detail": string[]}.',
    '- say: frase corta en español para decir en voz alta; puede llevar {n} (número de filas) y {columna} (valor de esa columna en la primera fila). Ejemplo: "Te deben {total} euros en {n} facturas".',
    "- none: frase si no hay resultados. title: título de la lista. label: columna que da nombre a cada fila de la lista. detail: columnas con más datos (máx. 3).",
    '- Si la pregunta no se puede contestar con esas vistas, o pide crear o cambiar algo, devuelve {"say": "..."} sin "sql" explicando brevemente qué puedes hacer o cómo pedirlo (ejemplo: «créame al cliente Francisco»).',
    "Da nombres claros a las columnas (AS) y limita a lo necesario.",
  ].join("\n");
  // Solo las preguntas anteriores del usuario (nunca las respuestas, que llevan datos) para entender «¿y de Rodolfo?».
  const messages: { role: string; content: string }[] = [
    { role: "system", content: system },
    ...history.filter((h) => h.who === "tú").slice(-3).map((h) => ({ role: "user", content: String(h.text).slice(0, 300) })),
    { role: "user", content: text.slice(0, 500) },
  ];
  let executed = "";
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ model, response_format: { type: "json_object" }, temperature: 0, max_tokens: 400, messages }),
      });
      if (!r.ok) throw Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const body = await r.json();
      trace.promptTokens += body.usage?.prompt_tokens ?? 0;
      trace.completionTokens += body.usage?.completion_tokens ?? 0;
      const content: string = body.choices[0].message.content;
      const o = JSON.parse(content);
      trace.ok = true;
      if (typeof o.sql !== "string" || !o.sql.trim()) {
        if (typeof o.say !== "string" || !o.say.trim()) return null;
        await recordVoice(u, { kind: "OPENAI", transcript: text, result: `Chat: ${o.say}`, ...trace, ms: Date.now() - t0 });
        return { transcript: text, message: o.say.slice(0, 500) };
      }
      const v = validateSql(o.sql);
      let rows: Row[] | null = null;
      let problem = "";
      if (!v.ok) problem = v.error;
      else {
        executed = v.sql;
        try {
          rows = await runReadOnly(u, v.sql);
        } catch (e) {
          problem = String((e as Error).message).split("\n").filter(Boolean).pop()?.slice(0, 200) ?? "Error de consulta.";
        }
      }
      if (!rows) {
        messages.push({ role: "assistant", content });
        messages.push({ role: "user", content: `La consulta falló: ${problem} Corrígela y vuelve a responder con el mismo JSON.` });
        continue;
      }
      await recordVoice(u, { kind: "OPENAI", transcript: text, result: `SQL: ${executed} → ${rows.length} filas`, ...trace, ms: Date.now() - t0 });
      if (!rows.length) return { transcript: text, message: String(o.none || "No he encontrado nada.").slice(0, 300) };
      const first = rows[0];
      const say = String(o.say || "Esto es lo que he encontrado.")
        .replace(/\{(\w+)\}/g, (_m, k: string) => (k === "n" ? String(rows!.length) : fmtCell(first[k])))
        .slice(0, 300);
      const cols = Object.keys(first);
      const label = typeof o.label === "string" && cols.includes(o.label) ? o.label : cols[0];
      const detail: string[] = (Array.isArray(o.detail) ? o.detail : []).filter((c: unknown): c is string => typeof c === "string" && cols.includes(c) && c !== label).slice(0, 3);
      const showList = rows.length > 1 || detail.length > 0;
      return {
        transcript: text,
        message: say,
        ...(showList
          ? {
              list: {
                title: String(o.title || "Resultado").slice(0, 80),
                items: rows.slice(0, 50).map((r) => ({ label: fmtCell(r[label]) || "—", detail: detail.map((c) => `${c.replace(/_/g, " ")}: ${fmtCell(r[c])}`).filter((x) => !x.endsWith(": ")).join(" · ") })),
              },
            }
          : {}),
      };
    }
    throw Error("No se pudo construir una consulta válida.");
  } catch (e) {
    if (/^OpenAI (401|403)/.test((e as Error).message)) llmDownUntil = Date.now() + 600_000;
    await recordVoice(u, { kind: "OPENAI", transcript: text, result: executed ? `SQL: ${executed}` : "", ...trace, ms: Date.now() - t0, ok: false, error: (e as Error).message });
    return null;
  }
}

// Preguntas claras: van directas a la consulta abierta, sin gastar una llamada a interpretar órdenes.
const plainText = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const QUESTION = /^[¿\s]*(?:cuant|que |cual|quien|quienes|donde|cuando|como |dime|dame|hay |tengo|tenemos|tienes|me queda|nos queda|ha |han |sabes|puedes decirme|me puedes decir|en que|a quien|de quien)/;

async function askModel(text: string, ctx: Ctx): Promise<{ intent: Intent | null; trace: Trace } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || llmBroken()) return null;
  const model = process.env.OPENAI_VOICE_MODEL || "gpt-4o-mini";
  const t0 = Date.now();
  const trace: Trace = { model, promptTokens: 0, completionTokens: 0, ms: 0, ok: false, error: "" };
  try {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 150,
      messages: [
        {
          role: "system",
          content: systemPrompt(ctx),
        },
        { role: "user", content: text.slice(0, 500) },
      ],
    }),
  });
  if (!r.ok) throw Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = await r.json();
  trace.promptTokens = body.usage?.prompt_tokens ?? 0;
  trace.completionTokens = body.usage?.completion_tokens ?? 0;
  const o = JSON.parse(body.choices[0].message.content);
  trace.ok = true;
  return { intent: validIntent(o) ? o : null, trace: { ...trace, ms: Date.now() - t0 } };
  } catch (e) {
    if (/^OpenAI (401|403)/.test((e as Error).message)) llmDownUntil = Date.now() + 600_000;
    return { intent: null, trace: { ...trace, ms: Date.now() - t0, error: (e as Error).message } };
  }
}

export async function transcribe(u: Actor, audio: File, hint = "") {
  const t0 = Date.now();
  const url = process.env.VOICE_URL;
  if (!url) throw new AppError("El servicio de voz no está configurado.", 503);
  const form = new FormData();
  form.append("file", audio, audio.name || "voz.webm");
  if (hint) form.append("prompt", hint);
  const r = await fetch(`${url}/transcribe`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!r?.ok) {
    await recordVoice(u, { kind: "STT", ok: false, ms: Date.now() - t0, error: "Fallo de transcripción" });
    throw new AppError("No se pudo transcribir el audio. Inténtalo de nuevo o escribe la orden.", 502);
  }
  const text = String((await r.json()).text ?? "").trim();
  await recordVoice(u, { kind: "STT", transcript: text, model: "whisper-small", ms: Date.now() - t0 });
  return text;
}

export type Turn = { who: string; text: string };
export async function interpret(u: Actor, transcript: string, history: Turn[] = []): Promise<Reply> {
  const r = await interpretOrder(u, transcript, history);
  await recordVoice(u, { kind: "REPLY", transcript, result: r.proposal ? `Propone: ${r.proposal.summary}` : (r.message ?? "") });
  return r;
}

async function interpretOrder(u: Actor, transcript: string, history: Turn[]): Promise<Reply> {
  const [custs, openJobs] = await Promise.all([
    db.customer.findMany({ where: { companyId: u.companyId }, select: { name: true }, orderBy: { name: "asc" }, take: 300 }),
    db.job.findMany({ where: { companyId: u.companyId, archivedAt: null }, select: { name: true, customer: { select: { name: true } } }, orderBy: { openedAt: "desc" }, take: 12 }),
  ]);
  const names = custs.map((c) => c.name);
  let intent = parseCommand(transcript, names);
  if (intent) await recordVoice(u, { kind: "RULES", transcript, result: JSON.stringify(intent) });
  else {
    const m = QUESTION.test(plainText(transcript)) ? null : await askModel(transcript, { customers: names.slice(0, 40), jobs: openJobs.map((j) => `${j.customer.name} · ${j.name}`) });
    if (m) {
      intent = m.intent;
      await recordVoice(u, { kind: "OPENAI", transcript, result: m.intent ? JSON.stringify(m.intent) : m.trace.ok ? "sin intención" : "", ...m.trace });
    }
  }
  // Frase abierta que no es una orden: el modelo contesta con los datos de la empresa (solo el responsable).
  if (!intent) {
    const c = await chat(u, transcript, history);
    if (c) return c;
  }
  if (!intent) return { transcript, message: (llmBroken() ? "El asistente avanzado no está activo (la clave de OpenAI no es válida; avisa al responsable). " : "") + "No he entendido la orden. Prueba, por ejemplo: «créame al cliente Francisco»." };
  const companyId = u.companyId;

  if (intent.action === "hours" || intent.action === "material" || intent.action === "status") {
    const mine = u.worker?.id;
    if (intent.action === "hours" && !mine && u.role !== "ADMIN") return { transcript, message: "Tu usuario no tiene un trabajador asociado para registrar horas." };
    const jobs = await db.job.findMany({
      where: { companyId, archivedAt: null, ...(u.role !== "ADMIN" ? { workerId: mine ?? "none" } : {}) },
      include: { customer: true },
      orderBy: { openedAt: "desc" },
      take: 300,
    });
    const pool = intent.customer ? jobs.filter((j) => matchesSearch(intent.customer!, [j.customer.name])) : jobs;
    if (!pool.length) return { transcript, message: intent.customer ? `No encuentro al cliente «${intent.customer}» con trabajos.` : "No hay trabajos." };
    let job = pool[0]; // «último trabajo» o, sin dato, el más reciente
    if (intent.job && intent.job !== "last") {
      const hit = pool.find((j) => matchesSearch(intent.job!, [j.name, j.number]));
      if (!hit) return { transcript, message: `No encuentro el trabajo «${intent.job}».` };
      job = hit;
    }
    if (intent.action === "status") {
      if (u.role !== "ADMIN" && intent.status !== "Finalizado") return { transcript, message: "El técnico solo puede marcar trabajos como finalizados." };
      return {
        transcript,
        proposal: { text: transcript, action: "status", summary: `${intent.status === "Finalizado" ? "Marcar finalizado" : "Reabrir"}: ${job.customer.name} · ${job.number} ${job.name}`, payload: { jobId: job.id, status: intent.status } },
      };
    }
    if (intent.action === "material") {
      const lots = await db.stockLot.findMany({ where: { companyId, archivedAt: null, onHand: { gt: 0 } }, select: { id: true, alias: true, description: true, reference: true, brand: true, model: true, code: true, onHand: true, unit: true } });
      const hits = lots.filter((l) => matchesSearch(intent.item, [l.alias, l.description, l.reference, l.brand, l.model, l.code])).sort((a, b) => Number(b.onHand) - Number(a.onHand));
      if (!hits.length) return { transcript, message: `No tengo «${intent.item}» en el inventario con existencias.` };
      const lot = hits[0];
      if (Number(lot.onHand) < intent.quantity) return { transcript, message: `Solo quedan ${lot.onHand} de «${lot.alias || lot.description}».` };
      return {
        transcript,
        proposal: {
          text: transcript,
          action: "stock-move",
          summary: `Material: ${intent.quantity} × ${lot.alias || lot.description} · ${job.customer.name} · ${job.number} ${job.name}${hits.length > 1 ? ` (hay ${hits.length} artículos parecidos)` : ""}`,
          payload: { lotId: lot.id, kind: "USE", quantity: String(intent.quantity), jobId: job.id, notes: "Por voz", requestKey: crypto.randomUUID() },
        },
      };
    }
    // El responsable sin ficha de trabajador imputa al trabajador del trabajo (o al primero de la empresa).
    const workerId = mine ?? job.workerId ?? (await db.worker.findFirst({ where: { companyId }, select: { id: true } }))?.id;
    if (!workerId) return { transcript, message: "No hay ningún trabajador al que imputar las horas." };
    const date = resolveDate(intent.date);
    return {
      transcript,
      proposal: {
        text: transcript,
        action: "hours",
        summary: `Horas ${intent.start}–${intent.end} · ${date} · ${job.customer.name} · ${job.number} ${job.name}`,
        payload: { jobId: job.id, workerId, date, startTime: intent.start, endTime: intent.end, activity: "Otras", billable: true, notes: "Por voz", requestKey: crypto.randomUUID() },
      },
    };
  }

  if (intent.action === "expense") {
    if (u.role !== "ADMIN") return { transcript, message: "Solo el responsable puede apuntar gastos." };
    const category = intent.category ?? "OTHER";
    const date = resolveDate(intent.date);
    return {
      transcript,
      proposal: {
        text: transcript,
        action: "overhead",
        summary: `Gasto ${intent.amount.toFixed(2)} € · ${category} · ${date}`,
        payload: { description: intent.concept || `Gasto por voz (${category.toLowerCase()})`, amount: intent.amount.toFixed(2), tax: "0", date, category },
      },
    };
  }

  if (u.role !== "ADMIN" && (intent.action === "query" || intent.action === "find")) {
    const c = await chat(u, transcript, history); // las vistas de consulta ya limitan al técnico a lo suyo
    if (c) return c;
  }
  if (u.role !== "ADMIN") return { transcript, message: "Solo el responsable puede consultar o crear clientes, proveedores o trabajos." };
  if (intent.action === "query") {
    const q = intent.name?.trim() ?? "";
    // Respuesta tipo lista: se dice una frase corta y el listado se enseña en pantalla.
    const show = (title: string, items: ListItem[], spoken: string, none: string): Reply =>
      items.length ? { transcript, message: spoken, list: { title, items: items.slice(0, 50) } } : { transcript, message: none };
    const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
    if (intent.entity === "customers") {
      const rows = await db.customer.findMany({ where: { companyId }, include: { _count: { select: { jobs: { where: { archivedAt: null } } } } }, orderBy: { name: "asc" } });
      const hit = rows.filter((c) => !q || matchesSearch(q, [c.name, c.taxId, c.email, c.phone]));
      return show("Clientes", hit.map((c) => ({ label: c.name, detail: [c.phone, c._count.jobs ? n(c._count.jobs, "trabajo abierto", "trabajos abiertos") : ""].filter(Boolean).join(" · "), href: `/clientes/${c.id}` })), `Tienes ${n(hit.length, "cliente", "clientes")}.${hit.length > 50 ? " Te enseño los 50 primeros." : " Te los enseño."}`, "Aún no hay clientes.");
    }
    if (intent.entity === "suppliers") {
      const rows = await db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } });
      const hit = rows.filter((s) => !q || matchesSearch(q, [s.name, s.taxId, s.email, s.contact]));
      return show("Proveedores", hit.map((s) => ({ label: s.name, detail: [s.contact, s.phone].filter(Boolean).join(" · "), href: `/cuentas/${s.id}` })), `Tienes ${n(hit.length, "proveedor", "proveedores")}. Te los enseño.`, "Aún no hay proveedores.");
    }
    if (intent.entity === "quotes") {
      const rows = await db.quote.findMany({ where: { companyId, approved: false }, include: { job: { include: { customer: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
      const hit = rows.filter((x) => !q || matchesSearch(q, [x.job.customer.name, x.job.name, x.number, x.name]));
      return show("Presupuestos pendientes de aprobar", hit.map((x) => ({ label: `${x.number || x.name} · ${x.job.customer.name}`, detail: `${dec(x.net.toString()).plus(x.tax.toString()).toFixed(2)} € · ${x.job.name}`, href: `/presupuestos/${x.id}` })), `Hay ${n(hit.length, "presupuesto pendiente", "presupuestos pendientes")} de aprobar.`, "No hay presupuestos pendientes de aprobar.");
    }
    if (intent.entity === "lowstock") {
      const lots = await db.stockLot.findMany({ where: { companyId, archivedAt: null, minimum: { gt: 0 } } });
      const low = lots.filter((l) => Number(l.onHand) <= Number(l.minimum));
      return show("Material por debajo del mínimo", low.map((l) => ({ label: l.alias || l.description, detail: `${l.onHand} ${l.unit} (mínimo ${l.minimum})`, href: "/inventario" })), `Hay ${n(low.length, "artículo", "artículos")} por debajo del mínimo.`, "Ningún artículo está por debajo del mínimo.");
    }
    if (intent.entity === "jobs") {
      const rows = await db.job.findMany({ where: { companyId, archivedAt: null }, include: { customer: true }, orderBy: { openedAt: "desc" }, take: 200 });
      const hit = rows.filter((j) => !q || matchesSearch(q, [j.customer.name, j.name]));
      return show("Trabajos abiertos", hit.map((j) => ({ label: j.name, detail: `${j.customer.name} · ${j.status}`, href: jobPath(j) })), `Hay ${n(hit.length, "trabajo abierto", "trabajos abiertos")}${q ? ` de «${q}»` : ""}.`, `No hay trabajos abiertos${q ? ` de «${q}»` : ""}.`);
    }
    if (intent.entity === "unpaid") {
      const rows = await db.sale.findMany({ where: { companyId }, include: { job: { include: { customer: true } } }, orderBy: { date: "desc" }, take: 500 });
      const owed = rows.map((s) => ({ s, due: dec(s.net.toString()).plus(s.tax.toString()).minus(s.withholding.toString()).minus(s.collected.toString()) })).filter((x) => x.due.gt(0) && (!q || matchesSearch(q, [x.s.job.customer.name, x.s.number])));
      const total = owed.reduce((a, x) => a.plus(x.due), dec(0));
      return show("Facturas pendientes de cobro", owed.map((x) => ({ label: `${x.s.number} · ${x.s.job.customer.name}`, detail: `${x.due.toFixed(2)} € pendientes`, href: `/facturas-venta/${x.s.id}` })), `Pendiente de cobro ${total.toFixed(2)} € en ${n(owed.length, "factura", "facturas")}.`, `No hay facturas pendientes de cobro${q ? ` de «${q}»` : ""}.`);
    }
    if (intent.entity === "stock") {
      if (!q) return { transcript, message: "¿De qué artículo quieres saber las existencias?" };
      const lots = await db.stockLot.findMany({ where: { companyId, archivedAt: null }, select: { alias: true, description: true, reference: true, brand: true, model: true, code: true, onHand: true, unit: true } });
      const hit = lots.filter((l) => matchesSearch(q, [l.alias, l.description, l.reference, l.brand, l.model, l.code]));
      if (!hit.length) {
        const cat = (await db.catalogItem.findMany({ where: { companyId }, take: 2000 })).filter((c) => matchesSearch(q, [c.reference, c.description, c.brand, c.supplier, c.supplierRef]));
        if (cat.length) return show("En el catálogo", cat.map((c) => ({ label: c.description, detail: Number(c.price) > 0 ? `${Number(c.price).toFixed(2)} €` : "", href: "/catalogo" })), `No hay «${q}» en el almacén, pero está en el catálogo.`, "");
        return { transcript, message: `No tengo «${q}» en el almacén.` };
      }
      return show("Existencias", hit.map((l) => ({ label: l.alias || l.description, detail: `${l.onHand} ${l.unit}`, href: "/inventario" })), hit.length === 1 ? `${hit[0].alias || hit[0].description}: ${hit[0].onHand} ${hit[0].unit}.` : `Encontré ${n(hit.length, "artículo", "artículos")} de «${q}».`, "");
    }
    const entries = await db.timeEntry.findMany({ where: { companyId }, include: { job: { include: { customer: true } } }, orderBy: { date: "desc" }, take: 1000 });
    const hit = entries.filter((e) => !q || matchesSearch(q, [e.job.customer.name, e.job.name]));
    const total = hit.reduce((a, e) => a.plus(e.hours.toString()), dec(0));
    return { transcript, message: hit.length ? `${total.toFixed(2)} horas en ${hit.length} registros${q ? ` de «${q}»` : ""}.` : `No hay horas registradas${q ? ` de «${q}»` : ""}.` };
  }
  if (intent.action === "payment") {
    const amount = Number(intent.amount);
    const rows = await db.sale.findMany({ where: { companyId }, include: { job: { include: { customer: true } } }, orderBy: { date: "desc" }, take: 500 });
    const due = (s: (typeof rows)[number]) => dec(s.net.toString()).plus(s.tax.toString()).minus(s.withholding.toString()).minus(s.collected.toString());
    const hit = rows.filter((s) => (intent.number ? s.number.toLowerCase() === intent.number.toLowerCase() : due(s).gt(0)) && (!intent.customer || matchesSearch(intent.customer, [s.job.customer.name])));
    if (!hit.length) return { transcript, message: "No encuentro esa factura pendiente de cobro." };
    if (hit.length > 1) return { transcript, message: `Hay ${hit.length} facturas que encajan (${hit.slice(0, 4).map((s) => s.number).join(", ")}). Dime el número de factura.` };
    const s = hit[0], collected = dec(s.collected.toString()).plus(amount);
    if (collected.gt(dec(s.net.toString()).plus(s.tax.toString()).minus(s.withholding.toString()))) return { transcript, message: `El cobro supera lo pendiente de la factura ${s.number} (${due(s).toFixed(2)} €).` };
    return {
      transcript,
      proposal: { text: transcript, action: "payment", summary: `Cobro de ${amount.toFixed(2)} € · ${s.job.customer.name} · factura ${s.number} (pendiente tras el cobro: ${due(s).minus(amount).toFixed(2)} €)`, payload: { saleId: s.id, collected: collected.toFixed(2) } },
    };
  }
  if (intent.action === "approve") {
    const jobs = await db.job.findMany({ where: { companyId, archivedAt: null }, include: { customer: true }, orderBy: { openedAt: "desc" }, take: 300 });
    const pool = intent.customer ? jobs.filter((j) => matchesSearch(intent.customer!, [j.customer.name])) : jobs;
    const job = intent.job && intent.job !== "last" ? pool.find((j) => matchesSearch(intent.job!, [j.name, j.number])) : pool[0];
    if (!job) return { transcript, message: "No encuentro ese trabajo." };
    const quote = await db.quote.findFirst({ where: { jobId: job.id, approved: false }, orderBy: { id: "desc" } });
    if (!quote) return { transcript, message: `El trabajo «${job.name}» no tiene presupuestos pendientes de aprobar.` };
    return { transcript, proposal: { text: transcript, action: "approveQuote", summary: `Aprobar presupuesto «${quote.name}» · ${job.customer.name} · ${job.number} ${job.name}`, payload: { quoteId: quote.id } } };
  }
  if (intent.action === "find") {
    const hits: { label: string; name: string; phone: string; email: string; address: string; extra: string }[] = [];
    if (intent.kind !== "supplier") {
      const rows = await db.customer.findMany({ where: { companyId }, include: { jobs: { where: { archivedAt: null }, select: { name: true }, take: 3 } } });
      for (const x of rows) if (matchesSearch(intent.name, [x.name])) hits.push({ label: "cliente", name: x.name, phone: x.phone, email: x.email, address: x.address, extra: x.jobs.length ? `trabajos abiertos: ${x.jobs.map((j) => j.name).join(", ")}` : "sin trabajos abiertos" });
    }
    if (intent.kind !== "customer") {
      const rows = await db.supplier.findMany({ where: { companyId } });
      for (const x of rows) if (matchesSearch(intent.name, [x.name])) hits.push({ label: "proveedor", name: x.name, phone: x.phone, email: x.email, address: "", extra: x.contact ? `contacto: ${x.contact}` : "" });
    }
    if (!hits.length) return { transcript, message: `No encuentro a «${intent.name}».` };
    if (hits.length > 1) return { transcript, message: `Hay ${hits.length} que encajan: ${hits.slice(0, 5).map((h) => `${h.name} (${h.label})`).join(", ")}. Dime el nombre completo.` };
    const h = hits[0];
    return { transcript, message: [`${h.name}, ${h.label}`, h.phone && `teléfono ${h.phone}`, h.email, h.address, h.extra].filter(Boolean).join(" · ") + "." };
  }
  if (intent.action === "contact") {
    const label = intent.kind === "customer" ? "cliente" : "proveedor";
    const rows = await (intent.kind === "customer" ? db.customer.findMany({ where: { companyId }, select: { name: true } }) : db.supplier.findMany({ where: { companyId }, select: { name: true } }));
    const dup = rows.find((x) => x.name.toLowerCase() === intent.name.toLowerCase());
    return {
      transcript,
      proposal: {
        text: transcript,
        action: intent.kind,
        summary: `Nuevo ${label}: ${intent.name}${dup ? " (ya existe uno con ese nombre)" : ""}`,
        payload: { name: intent.name, taxId: "", phone: intent.phone ?? "", email: "", address: "", contact: "", terms: "" },
      },
    };
  }
  const customers = await db.customer.findMany({ where: { companyId }, select: { id: true, name: true } });
  const c = customers.find((x) => matchesSearch(intent.customer, [x.name]));
  if (!c) return { transcript, message: `No encuentro al cliente «${intent.customer}».` };
  return {
    transcript,
    proposal: {
      text: transcript,
      action: "job",
      summary: `Nuevo trabajo «${intent.name}» para ${c.name}`,
      payload: { name: intent.name, customerId: c.id, address: "", service: "Otros" },
    },
  };
}
