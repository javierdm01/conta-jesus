import { db } from "@/lib/db";
import { AppError, type Actor } from "@/lib/access";
import { matchesSearch } from "@/lib/product-search";

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

async function record(u: Actor, row: { kind: string; transcript?: string; result?: string } & Partial<Trace>) {
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
async function askModel(text: string): Promise<{ intent: Intent | null; trace: Trace } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
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
          content:
            'Devuelve solo JSON. Una de: {"action":"hours","customer":?,"job":? ("last" si dice último trabajo),"start":"HH:MM","end":"HH:MM","date":? ("yesterday"|"2daysago"|"weekday:0-6")} | {"action":"expense","category":?(AUTONOMO|SEGURO|VEHICULO|COMBUSTIBLE|DIETAS|OTHER),"amount":n,"concept":?,"date":?} | {"action":"job","customer":s,"name":s} | {"action":"material","item":s,"quantity":n,"customer":?,"job":? ("last" si dice último trabajo)} | {"action":"contact","kind":"customer"|"supplier","name":s,"phone":?} | {"action":"none"}. Horas en 24h (tarde = +12). Crear/dar de alta un cliente o proveedor es "contact", nunca "job".',
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
  return { intent: o.action === "hours" || o.action === "expense" || o.action === "job" || o.action === "contact" || o.action === "material" ? o : null, trace: { ...trace, ms: Date.now() - t0 } };
  } catch (e) {
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
    await record(u, { kind: "STT", ok: false, ms: Date.now() - t0, error: "Fallo de transcripción" });
    throw new AppError("No se pudo transcribir el audio. Inténtalo de nuevo o escribe la orden.", 502);
  }
  const text = String((await r.json()).text ?? "").trim();
  await record(u, { kind: "STT", transcript: text, model: "whisper-small", ms: Date.now() - t0 });
  return text;
}

export async function interpret(u: Actor, transcript: string): Promise<Reply> {
  let intent = parseCommand(transcript);
  if (intent) await record(u, { kind: "RULES", transcript, result: JSON.stringify(intent) });
  else {
    const m = await askModel(transcript);
    if (m) {
      intent = m.intent;
      await record(u, { kind: "OPENAI", transcript, result: m.intent ? JSON.stringify(m.intent) : m.trace.ok ? "sin intención" : "", ...m.trace });
    }
  }
  if (!intent) return { transcript, message: "No he entendido la orden. Prueba, por ejemplo: «créame al cliente Francisco», «apunta de 8 y media a 5 y media al cliente Juan, en el último trabajo», «añade dos enchufes al último trabajo» o «apunta un gasto de gasolina de 40 euros»." };
  const companyId = u.companyId;

  if (intent.action === "hours" || intent.action === "material") {
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

  if (u.role !== "ADMIN") return { transcript, message: "Solo el responsable puede crear clientes, proveedores o trabajos." };
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
