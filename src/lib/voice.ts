import { db } from "@/lib/db";
import { AppError, type Actor } from "@/lib/access";
import { matchesSearch } from "@/lib/product-search";
import { dec } from "@/lib/money";

import { parseCommand, type Intent } from "@/lib/voice-parse";

export type Proposal = { text: string; summary: string; action: string; payload: Record<string, unknown> };
export type Reply = { transcript: string; proposal?: Proposal; message?: string };

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
    '- query: {"action":"query","entity":"jobs"|"unpaid"|"stock"|"hours","name"?:s}  preguntas de consulta: jobs = trabajos abiertos (name = cliente), unpaid = facturas pendientes de cobro (name = cliente), stock = existencias de un artículo (name), hours = horas acumuladas (name = cliente o trabajo).',
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
    case "query": return ["jobs", "unpaid", "stock", "hours"].includes(String(o.entity));
    case "status": return o.status === "Finalizado" || o.status === "En proceso";
    case "payment": return Number(o.amount) > 0;
    case "approve": return true;
    default: return false;
  }
}

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
  form.append("file", audio, "voz.webm");
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

export async function interpret(u: Actor, transcript: string): Promise<Reply> {
  const r = await interpretOrder(u, transcript);
  await recordVoice(u, { kind: "REPLY", transcript, result: r.proposal ? `Propone: ${r.proposal.summary}` : (r.message ?? "") });
  return r;
}

async function interpretOrder(u: Actor, transcript: string): Promise<Reply> {
  const [custs, openJobs] = await Promise.all([
    db.customer.findMany({ where: { companyId: u.companyId }, select: { name: true }, orderBy: { name: "asc" }, take: 300 }),
    db.job.findMany({ where: { companyId: u.companyId, archivedAt: null }, select: { name: true, customer: { select: { name: true } } }, orderBy: { openedAt: "desc" }, take: 12 }),
  ]);
  const names = custs.map((c) => c.name);
  let intent = parseCommand(transcript, names);
  if (intent) await recordVoice(u, { kind: "RULES", transcript, result: JSON.stringify(intent) });
  else {
    const m = await askModel(transcript, { customers: names.slice(0, 40), jobs: openJobs.map((j) => `${j.customer.name} · ${j.name}`) });
    if (m) {
      intent = m.intent;
      await recordVoice(u, { kind: "OPENAI", transcript, result: m.intent ? JSON.stringify(m.intent) : m.trace.ok ? "sin intención" : "", ...m.trace });
    }
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

  if (u.role !== "ADMIN") return { transcript, message: "Solo el responsable puede consultar o crear clientes, proveedores o trabajos." };
  if (intent.action === "query") {
    const q = intent.name?.trim() ?? "";
    const list = (xs: string[], none: string, more = 6) => (xs.length ? xs.slice(0, more).join("; ") + (xs.length > more ? `; y ${xs.length - more} más` : "") + "." : none);
    if (intent.entity === "jobs") {
      const rows = await db.job.findMany({ where: { companyId, archivedAt: null }, include: { customer: true }, orderBy: { openedAt: "desc" }, take: 200 });
      const hit = rows.filter((j) => !q || matchesSearch(q, [j.customer.name, j.name]));
      return { transcript, message: list(hit.map((j) => `${j.customer.name} · ${j.name} (${j.status})`), `No hay trabajos abiertos${q ? ` de «${q}»` : ""}.`) };
    }
    if (intent.entity === "unpaid") {
      const rows = await db.sale.findMany({ where: { companyId }, include: { job: { include: { customer: true } } }, orderBy: { date: "desc" }, take: 500 });
      const owed = rows.map((s) => ({ s, due: dec(s.net.toString()).plus(s.tax.toString()).minus(s.withholding.toString()).minus(s.collected.toString()) })).filter((x) => x.due.gt(0) && (!q || matchesSearch(q, [x.s.job.customer.name, x.s.number])));
      const total = owed.reduce((a, x) => a.plus(x.due), dec(0));
      return { transcript, message: owed.length ? `Pendiente de cobro ${total.toFixed(2)} €: ` + list(owed.map((x) => `${x.s.number} · ${x.s.job.customer.name} · ${x.due.toFixed(2)} €`), "") : `No hay facturas pendientes de cobro${q ? ` de «${q}»` : ""}.` };
    }
    if (intent.entity === "stock") {
      if (!q) return { transcript, message: "¿De qué artículo quieres saber las existencias?" };
      const lots = await db.stockLot.findMany({ where: { companyId, archivedAt: null }, select: { alias: true, description: true, reference: true, brand: true, model: true, code: true, onHand: true, unit: true } });
      const hit = lots.filter((l) => matchesSearch(q, [l.alias, l.description, l.reference, l.brand, l.model, l.code]));
      return { transcript, message: list(hit.map((l) => `${l.alias || l.description}: ${l.onHand} ${l.unit}`), `No tengo «${q}» en el almacén.`, 4) };
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
