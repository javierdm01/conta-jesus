"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Mic, Send, Settings2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Proposal } from "@/lib/voice";

type ListData = { title: string; items: { label: string; detail?: string; href?: string }[] };
type Reply = { transcript?: string; proposal?: Proposal; message?: string; error?: string; list?: ListData };
type Phase = "idle" | "listening" | "thinking" | "speaking";
type Line = { who: "tú" | "asistente"; text: string; list?: ListData };

const plain = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const YES = /^(si|vale|ok|okey|confirma|confirmo|guardalo|guardala|adelante|correcto|dale|hazlo|claro|perfecto|de acuerdo)\b/;
const NO = /^(no|cancela|cancelalo|olvidalo|deja|para)\b/;
const VOICES = [
  { id: "k-dora", label: "Natural · Dora (mujer)" },
  { id: "k-alex", label: "Natural · Alex (hombre)" },
  { id: "k-santa", label: "Natural · Santa (hombre)" },
  { id: "davefx", label: "España · Davefx" },
  { id: "sharvard-0", label: "España · Sharvard A" },
  { id: "sharvard-1", label: "España · Sharvard B" },
  { id: "claude", label: "México · Claude" },
  { id: "ald", label: "México · Ald" },
  { id: "browser", label: "Voz del navegador" },
];
type Prefs = { voice: string; speed: number };
const loadPrefs = (): Prefs => {
  try {
    const p = JSON.parse(localStorage.getItem("instala-voice") ?? "null");
    if (p && VOICES.some((v) => v.id === p.voice)) return { voice: p.voice, speed: Math.min(Math.max(Number(p.speed) || 1, 0.7), 1.5) };
  } catch {}
  return { voice: "k-dora", speed: 1 };
};
const FIXED = ["Hecho, guardado.", "Vale, lo dejo sin guardar."];
const LABEL: Record<Phase, string> = { idle: "Toca el micrófono para hablar", listening: "Te escucho… toca para enviar", thinking: "Pensando…", speaking: "Hablando…" };
const STATUS: Record<Phase, string> = { idle: "Listo", listening: "Escuchando…", thinking: "Pensando…", speaking: "Hablando…" };
// Sugerencias tipo Copilot: lo que suele venir después de cada acción. «▮» marca dónde queda el cursor si el texto se completa a mano.
type Chip = { label: string; text: string; fill?: boolean; admin?: boolean; flow?: "hours" | "material"; customer?: string };
const C = (label: string, text = label, o: Partial<Chip> = {}): Chip => ({ label, text, ...o });
const SUGGESTIONS: Chip[] = [
  C("¿Cuánto me deben?", "¿Cuánto me deben en total?", { admin: true }),
  C("Lista de clientes", "Sácame una lista de todos los clientes", { admin: true }),
  C("Trabajos abiertos", "Muéstrame los trabajos abiertos"),
  C("Material con poco stock", "Dime el material con poco stock"),
  C("Horas de este mes", "¿Cuántas horas llevo este mes?"),
];
const of = (c?: string) => (c ? ` de ${c}` : "");
const HOURS = (c?: string) => C("Registrar horas", "", { flow: "hours", customer: c });
const MATERIAL = (c?: string) => C("Añadir material", "", { flow: "material", customer: c });
const FINISH = (c?: string) => C("Marcar finalizado", `Marca como finalizado el último trabajo${of(c)}`);
const OPEN = C("Trabajos abiertos", "Muéstrame los trabajos abiertos");
const OWED = C("¿Cuánto me deben?", "¿Cuánto me deben en total?", { admin: true });
const UNPAID = C("Facturas pendientes", "¿Qué facturas tengo pendientes de cobro?", { admin: true });
const LOW = C("Material con poco stock", "Dime el material con poco stock");
const MONTH_HOURS = C("Horas de este mes", "¿Cuántas horas llevo este mes?");
// Después de guardar una acción (action = la que confirma el servidor; summary = el texto que se le leyó al usuario).
function followUps(action: string, payload: Record<string, unknown>, summary: string): Chip[] {
  const parts = summary.split(" · ");
  switch (action) {
    case "customer": {
      const n = String(payload.name ?? "");
      return [C("Crear un trabajo", `Crea un trabajo para ${n}`, { admin: true }), C("Ver sus trabajos", `Muéstrame los trabajos de ${n}`), C("Lista de clientes", "Sácame una lista de todos los clientes", { admin: true })];
    }
    case "supplier":
      return [C("Lista de proveedores", "Sácame la lista de proveedores", { admin: true }), LOW, C("Añadir otro proveedor", "Créame al proveedor ▮", { fill: true, admin: true })];
    case "job": {
      const c = /para (.+)$/.exec(summary)?.[1];
      return [HOURS(c), MATERIAL(c), C("Crear presupuesto", "¿Qué presupuestos hay pendientes?", { admin: true })];
    }
    case "hours": {
      const c = parts[3];
      return [MATERIAL(c), FINISH(c), MONTH_HOURS];
    }
    case "stock-move": {
      const c = parts[1];
      return [HOURS(c), FINISH(c), LOW];
    }
    case "status":
      return /finalizado/i.test(summary) ? [UNPAID, OWED, OPEN] : [HOURS(), MATERIAL(), OPEN];
    case "overhead":
      return [C("Gastos de este mes", "¿Cuánto he gastado este mes?", { admin: true }), OWED, OPEN];
    case "payment":
      return [UNPAID, OWED, OPEN];
    case "approveQuote":
      return [HOURS(), MATERIAL(), C("Presupuestos pendientes", "¿Qué presupuestos hay pendientes de aprobar?", { admin: true })];
    default:
      return [OPEN, OWED, LOW];
  }
}
// Después de una consulta o una respuesta.
function afterAnswer(title?: string): Chip[] {
  const t = (title ?? "").toLowerCase();
  if (t.includes("cliente")) return [OPEN, UNPAID, C("Crear un cliente", "Créame al cliente ▮", { fill: true, admin: true })];
  if (t.includes("trabajo")) return [HOURS(), MATERIAL(), UNPAID];
  if (t.includes("factura")) return [OWED, OPEN, C("Registrar un cobro", "Registra un cobro de ▮ euros", { fill: true, admin: true })];
  if (t.includes("presupuesto")) return [UNPAID, OPEN, OWED];
  if (t.includes("mínimo") || t.includes("existencias") || t.includes("catálogo")) return [C("Lista de proveedores", "Sácame la lista de proveedores", { admin: true }), LOW, OPEN];
  if (t.includes("proveedor")) return [LOW, OWED, OPEN];
  return [OPEN, OWED, LOW];
}
const FALLBACK: Chip[] = [C("Crear un cliente", "Créame al cliente ▮", { fill: true, admin: true }), HOURS(), MATERIAL(), C("Lista de clientes", "Sácame una lista de todos los clientes", { admin: true })];
// Conversación guiada: si falta un dato (horas, día, material, trabajo) el asistente lo pregunta en vez de inventarlo.
type Flow = { kind: "hours" | "material"; customer?: string; step: "range" | "day" | "job" | "item"; data: { range?: string; day?: string; item?: string } };
const DAY_CHIPS: Chip[] = [C("Hoy", "hoy"), C("Ayer", "ayer"), C("Anteayer", "anteayer")];
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const MAX_REC = 15; // segundos
const mmss = (s: number) => `0:${String(Math.min(Math.floor(s), MAX_REC)).padStart(2, "0")}`;

// Conversación por voz: escucha hasta que callas, responde en voz alta y pide confirmación antes de guardar.
export default function VoiceDialog({ close, confirm, admin = true, jobs = [] }: { close: () => void; admin?: boolean; jobs?: { label: string; customer: string }[]; confirm: (action: string, payload: unknown, meta: { text: string; summary: string }) => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [follow, setFollow] = useState<Chip[]>([]);
  const [levels, setLevels] = useState<number[]>(() => Array(32).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const cache = useRef(new Map<string, Promise<Blob>>()); // audio ya generado: las frases repetidas suenan al instante
  const pending = useRef<Proposal | null>(null);
  const alive = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopRec = useRef<{ send: () => void; cancel: () => void } | null>(null);
  const flow = useRef<Flow | null>(null);
  const player = useRef<HTMLAudioElement | null>(null); // un solo <audio>: iOS solo deja sonar el que se «desbloqueó» con un toque
  const ctxRef = useRef<AudioContext | null>(null); // un solo AudioContext, creado con un toque (en Safari un contexto nuevo nace en pausa)
  const unlocked = useRef(false);
  const [vvh, setVvh] = useState<number | null>(null);
  const getCtx = () => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    return (ctxRef.current ??= new AC());
  };
  // Se llama con el primer toque dentro del asistente: desbloquea sonido y micrófono para el resto de la conversación.
  const unlock = () => {
    if (unlocked.current) return;
    unlocked.current = true;
    try {
      const a = (player.current ??= new Audio());
      a.src = SILENT_WAV;
      a.play().then(() => a.pause()).catch(() => {});
    } catch {}
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {}
    try {
      void getCtx().resume();
    } catch {}
  };

  const speech = (t: string) => {
    const { voice, speed } = prefsRef.current;
    const k = `${voice}|${speed}|${t}`;
    let p = cache.current.get(k);
    if (!p) {
      p = fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, voice, speed }) }).then((r) => (r.ok ? r.blob() : Promise.reject()));
      p.catch(() => cache.current.delete(k));
      cache.current.set(k, p);
    }
    return p;
  };
  // Solo audio (sin añadir a la conversación): voz del servidor (Piper) o, si falla o se elige, la del navegador.
  // onStart: se llama cuando empieza a sonar (para mostrar el texto a la vez que la voz).
  const speak = (t: string, done: () => void, onStart?: () => void) => {
    let started = false;
    const start = () => (started || ((started = true), onStart?.()));
    const fallback = () => {
      if (!alive.current) return;
      start();
      if (!("speechSynthesis" in window)) return done();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "es-ES";
      u.rate = prefsRef.current.speed;
      u.onend = done;
      u.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    };
    if (prefsRef.current.voice === "browser") return fallback();
    // Por frases y en paralelo: la primera suena en cuanto está lista, sin esperar a generar el resto.
    const jobs = (t.match(/[^.!?]+[.!?]*/g) ?? [t]).map((s) => s.trim()).filter(Boolean).map(speech);
    const play = (i: number) => {
      if (i >= jobs.length) return done();
      jobs[i]
        .then((b) => {
          if (!alive.current) return;
          const a = (player.current ??= new Audio());
          const url = URL.createObjectURL(b);
          audio.current = a;
          a.onended = () => (URL.revokeObjectURL(url), play(i + 1));
          a.onerror = fallback;
          a.src = url;
          return a.play().then(start, fallback);
        })
        .catch(fallback);
    };
    play(0);
  };
  const say = (t: string, then?: () => void, list?: ListData) => {
    setPhase("thinking");
    speak(
      t,
      () => {
        if (!alive.current) return;
        setPhase("idle");
        then?.();
      },
      () => (setLog((l) => [...l, { who: "asistente", text: t, list }]), setPhase("speaking")),
    );
  };
  const choose = (p: Prefs) => {
    setPrefs(p);
    try {
      localStorage.setItem("instala-voice", JSON.stringify(p));
    } catch {}
  };
  useEffect(() => {
    if (prefs.voice !== "browser") FIXED.forEach((t) => speech(t).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  const nextListen = (keep: boolean) => () => keep && alive.current && listen();
  // Pregunta un dato que falta; las respuestas rápidas salen como botones y, si la conversación es por voz, vuelve a escuchar.
  const askFlow = (q: string, chips: Chip[], keep: boolean) => {
    setFollow(chips);
    say(q, nextListen(keep));
  };
  const startFlow = (kind: "hours" | "material", customer: string | undefined, keep: boolean) => {
    flow.current = { kind, customer, step: kind === "hours" ? "range" : "item", data: {} };
    askFlow(kind === "hours" ? "¿De qué hora a qué hora? Por ejemplo, de 8 a 5." : "¿Qué material y cuántas unidades? Por ejemplo, 3 enchufes.", [], keep);
  };
  const handleFlow = (said: string, keep: boolean): Promise<void> | void => {
    const f = flow.current!;
    const n = plain(said);
    const next = nextListen(keep);
    if (NO.test(n) || /^(cancela|olvida|deja)/.test(n)) {
      flow.current = null;
      setFollow([]);
      return say("Vale, lo dejo.", next);
    }
    const compose = (customer?: string): Promise<void> | void => {
      const cmd =
        f.kind === "hours"
          ? `Registra horas ${f.data.range} en el último trabajo${of(customer)}${f.data.day ? ` ${f.data.day}` : ""}`
          : `Añade ${f.data.item} al último trabajo${of(customer)}`;
      flow.current = null;
      return handle(cmd, keep, false);
    };
    const askJob = () => {
      f.step = "job";
      const chips = [...jobs.slice(0, 5).map((j) => C(j.label, j.customer)), C("El último trabajo", "__last")];
      askFlow("¿En qué trabajo?", chips, keep);
    };
    if (f.step === "range") {
      const times = (n.match(/\d+|\b(?:una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/g) ?? []).length;
      if (times < 2) return askFlow("No te he entendido. Dime la hora de inicio y la de fin, por ejemplo «de 8 a 5».", [], keep);
      f.data.range = /^(?:de|desde)\b/.test(n) ? said : `de ${said}`;
      f.step = "day";
      return askFlow("¿Qué día fue?", DAY_CHIPS, keep);
    }
    if (f.step === "day") {
      f.data.day = /antes de ayer|anteayer/.test(n) ? "anteayer" : /^hoy/.test(n) ? "" : /^ayer/.test(n) ? "ayer" : said;
      return f.customer ? compose(f.customer) : askJob();
    }
    if (f.step === "item") {
      f.data.item = said;
      return f.customer ? compose(f.customer) : askJob();
    }
    return compose(said === "__last" ? undefined : said);
  };
  const handle = async (said: string, keepListening: boolean, echo = true): Promise<void> => {
    if (echo) {
      setLog((l) => [...l, { who: "tú", text: said }]);
      setFollow([]);
    }
    if (flow.current) return handleFlow(said, keepListening);
    // Un «sí»/«no» suelto sin nada pendiente (eco, o repetido) no es una orden: se ignora sin gastar una consulta.
    const n0 = plain(said);
    if (!pending.current && n0.length < 20 && (YES.test(n0) || NO.test(n0))) return keepListening && alive.current ? listen() : undefined;
    // «Registra horas» sin decir de cuándo a cuándo: se pregunta, nunca se supone un horario.
    if (!pending.current && echo && /\b(?:registr|apunt|anad|pon|met|agreg)\w*\b.*\bhoras?\b/.test(n0) && !/\b(?:de|desde)\s+\S+\s+(?:a|hasta)\s+\S+/.test(n0)) return startFlow("hours", undefined, keepListening);
    const next = () => keepListening && alive.current && listen();
    const p = pending.current;
    if (p) {
      const n = plain(said);
      if (YES.test(n)) {
        pending.current = null;
        setPhase("thinking");
        try {
          await confirm(p.action, p.payload, { text: p.text, summary: p.summary });
          setFollow(followUps(p.action, p.payload, p.summary));
          return say("Hecho, guardado.", next);
        } catch {
          return say("No he podido guardarlo.", next);
        }
      }
      if (NO.test(n)) {
        pending.current = null;
        return say("Vale, lo dejo sin guardar.", next);
      }
      pending.current = null; // orden nueva: se descarta la anterior
    }
    setPhase("thinking");
    try {
      const r = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: said, history: log.slice(-6).map((l) => ({ who: l.who, text: l.text })) }) });
      const d: Reply = await r.json();
      if (d.proposal) {
        pending.current = d.proposal;
        return say(`${d.proposal.summary}. ¿Lo guardo?`, next);
      }
      setFollow(d.message?.startsWith("No he entendido") ? FALLBACK : afterAnswer(d.list?.title ?? d.message));
      say(d.message ?? d.error ?? "No he entendido.", next, d.list);
    } catch {
      say("No me he podido conectar.", next);
    }
  };

  // Escucha una frase: graba cuando detecta voz y se para al callar (máximo 15 s). Funciona en Chrome y Safari del móvil.
  const listen = async () => {
    setError("");
    if (typeof MediaRecorder === "undefined") return setError("Este navegador no permite grabar audio. Escribe la orden.");
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      return setError("No se puede usar el micrófono: hace falta conexión segura (https) y dar permiso al navegador. Escribe la orden.");
    }
    const s = stream.current;
    const ctx = getCtx();
    await ctx.resume().catch(() => {});
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    const src = ctx.createMediaStreamSource(s);
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    // Si el navegador no deja analizar el sonido (contexto en pausa), se graba igualmente y se corta a mano o a los 15 s.
    const vad = ctx.state === "running";
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"].find((m) => MediaRecorder.isTypeSupported?.(m));
    const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let heard = !vad, lastVoice = Date.now(), cancelled = false, floor = 0, samples = 0;
    const t0 = Date.now();
    setLevels(Array(32).fill(0));
    setElapsed(0);
    const tick = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += ((x - 128) / 128) ** 2;
      const level = Math.sqrt(sum / buf.length);
      const now = Date.now();
      // El ruido de fondo de cada móvil se mide al principio; la voz es lo que lo supera con claridad.
      if (samples < 5) (floor = Math.max(floor, level)), samples++;
      else if (vad && level > Math.max(0.03, floor * 2.2)) (heard = true), (lastVoice = now);
      setLevels((l) => [...l.slice(1), Math.min(1, level * 5)]);
      setElapsed((now - t0) / 1000);
      // Se corta solo: 1,2 s de silencio tras hablar, 8 s si nadie habla y 15 s como máximo.
      if ((vad && heard && now - lastVoice > 1200) || now - t0 > (heard ? MAX_REC * 1000 : 8000)) rec.stop();
    }, 100);
    const end = () => rec.state !== "inactive" && rec.stop();
    stopRec.current = { send: end, cancel: () => ((cancelled = true), end()) };
    rec.onstop = async () => {
      clearInterval(tick);
      src.disconnect();
      stopRec.current = null;
      if (cancelled || !alive.current) return setPhase("idle");
      const type = rec.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (!heard || blob.size < 1500) return setPhase("idle"); // nadie habló (o fue un toque): se queda esperando
      setPhase("thinking");
      const f = new FormData();
      f.append("audio", blob, /mp4|aac/.test(type) ? "voz.m4a" : "voz.webm");
      try {
        const r = await fetch("/api/voice?stt", { method: "POST", body: f });
        const d: Reply = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!d.transcript?.trim()) return listen();
        await handle(d.transcript, true);
      } catch (e) {
        setPhase("idle");
        setError((e as Error).message || "No se pudo transcribir.");
      }
    };
    rec.start();
    setPhase("listening");
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopRec.current?.cancel();
      stream.current?.getTracks().forEach((t) => t.stop());
      audio.current?.pause();
      speechSynthesis?.cancel();
    };
  }, []);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log, phase]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  // iOS no encoge la pantalla al salir el teclado: se ajusta la altura al área visible real.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia("(max-width:760px)").matches) return;
    const on = () => {
      setVvh(vv.height);
      if (window.scrollY) window.scrollTo(0, 0);
    };
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const onChip = (c: Chip) => {
    unlock();
    if (c.flow) {
      setLog((l) => [...l, { who: "tú", text: c.label }]);
      return startFlow(c.flow, c.customer, false);
    }
    if (!c.fill) return handle(c.text, false);
    const at = c.text.indexOf("▮");
    setText(c.text.replace("▮", ""));
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(at, at);
    });
  };
  const submitText = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    handle(t, false);
  };
  const toggle = () => {
    if (phase === "listening") stopRec.current?.send();
    else if (phase === "idle") listen();
    else if (phase === "speaking") (audio.current?.pause(), speechSynthesis.cancel(), setPhase("idle"));
  };

  return (
    <div className="va-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="va" role="dialog" aria-modal="true" aria-label="Asistente" style={vvh ? { height: vvh } : undefined} onPointerDownCapture={unlock}>
        <header className="va-head">
          <span className="va-avatar"><Sparkles size={20} /></span>
          <div className="va-title">
            <strong>Asistente</strong>
            <small className={phase !== "idle" ? "on" : ""}>{STATUS[phase]}</small>
          </div>
          <button type="button" className="va-icon" aria-label="Voz y velocidad" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}><Settings2 size={20} /></button>
          <button type="button" className="va-icon" aria-label="Cerrar" onClick={close}><X size={22} /></button>
        </header>
        {showSettings && (
          <div className="va-settings">
            <label>
              Voz
              <select value={prefs.voice} onChange={(e) => choose({ ...prefs, voice: e.target.value })}>
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </label>
            <label>
              Velocidad: {prefs.speed.toFixed(2)}×
              <input type="range" min={0.7} max={1.5} step={0.05} value={prefs.speed} onChange={(e) => choose({ ...prefs, speed: Number(e.target.value) })} />
            </label>
            <Button variant="outline" disabled={phase !== "idle"} onClick={() => (setPhase("speaking"), speak("Hola, soy tu asistente. ¿Qué apunto hoy?", () => alive.current && setPhase("idle")))}>
              Probar voz
            </Button>
          </div>
        )}
        <div className="va-chat" aria-live="polite">
          {!log.length && (
            <div className="va-welcome">
              <span className="va-avatar big"><Sparkles size={28} /></span>
              <h2>¿En qué te ayudo?</h2>
              <p>Pregúntame lo que quieras de tus clientes, trabajos, facturas o almacén, o dime qué apuntar.</p>
            </div>
          )}
          {log.map((l, i) => (
            <div key={i} className={`va-msg ${l.who === "tú" ? "me" : "bot"}`}>
              <div className="va-bubble">{l.text}</div>
              {l.list && (
                <div className="va-list">
                  <div className="va-list-head"><strong>{l.list.title}</strong><span>{l.list.items.length}</span></div>
                  <ul>
                    {l.list.items.map((it, j) => {
                      const inner = (
                        <>
                          <span className="va-item-main">
                            <b>{it.label}</b>
                            {it.detail && <small>{it.detail}</small>}
                          </span>
                          {it.href && <ChevronRight size={18} />}
                        </>
                      );
                      return <li key={j}>{it.href ? <a href={it.href} onClick={close}>{inner}</a> : <div>{inner}</div>}</li>;
                    })}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {phase === "thinking" && (
            <div className="va-msg bot"><div className="va-bubble va-typing" aria-label="Pensando"><i /><i /><i /></div></div>
          )}
          {error && <p className="va-error" role="alert">{error}</p>}
          <div ref={endRef} />
        </div>
        {pending.current && phase === "idle" && (
          <div className="va-confirm">
            <Button onClick={() => handle("sí", false)}>Confirmar y guardar</Button>
            <Button variant="outline" onClick={() => handle("no", false)}>Cancelar</Button>
          </div>
        )}
        {phase !== "listening" && phase !== "thinking" && !pending.current && !text && (() => {
          const chips = (log.length ? (follow.length ? follow : []) : SUGGESTIONS).filter((c) => admin || !c.admin);
          return chips.length ? (
            <div className="va-chips" role="list" aria-label="Sugerencias">
              {log.length > 0 && <span className="va-chips-label"><Sparkles size={14} /> Siguiente</span>}
              {chips.map((c) => (
                <button key={c.label} type="button" role="listitem" onClick={() => onChip(c)}>{c.label}</button>
              ))}
            </div>
          ) : null;
        })()}
        <form
          className="va-bar"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            submitText();
          }}
        >
          {phase === "listening" ? (
            <div className="va-rec" role="status" aria-label="Grabando">
              <span className="va-rec-dot" />
              <div className="va-wave" aria-hidden>
                {levels.map((l, i) => (
                  <i key={i} style={{ height: `${Math.max(10, l * 100)}%` }} />
                ))}
              </div>
              <span className="va-time">{mmss(elapsed)} / 0:{MAX_REC}</span>
              <span className="va-prog" style={{ width: `${Math.min(100, (elapsed / MAX_REC) * 100)}%` }} />
            </div>
          ) : (
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe o habla…" enterKeyHint="send" aria-label="Escribe tu pregunta u orden" />
          )}
          {text.trim() ? (
            <button type="submit" className="va-mic send" aria-label="Enviar" disabled={phase === "thinking"}><Send size={22} /></button>
          ) : (
            <button type="button" className={`va-mic ${phase}`} onClick={toggle} disabled={phase === "thinking"} aria-label={LABEL[phase]}>
              <Mic size={24} />
            </button>
          )}
        </form>
        {phase === "listening" && (
          <button type="button" className="va-cancel" onClick={() => stopRec.current?.cancel()}>Cancelar grabación</button>
        )}
      </section>
    </div>
  );
}
