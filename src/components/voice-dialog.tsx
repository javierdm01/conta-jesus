"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Proposal } from "@/lib/voice";

type Reply = { transcript?: string; proposal?: Proposal; message?: string; error?: string };
type Phase = "idle" | "listening" | "thinking" | "speaking";
type Line = { who: "tú" | "asistente"; text: string };

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
const LABEL: Record<Phase, string> = { idle: "Toca para hablar", listening: "Te escucho… toca para enviar", thinking: "Pensando…", speaking: "Hablando…" };

// Conversación por voz: escucha hasta que callas, responde en voz alta y pide confirmación antes de guardar.
export default function VoiceDialog({ close, confirm }: { close: () => void; confirm: (action: string, payload: unknown) => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const cache = useRef(new Map<string, Promise<Blob>>()); // audio ya generado: las frases repetidas suenan al instante
  const pending = useRef<Proposal | null>(null);
  const alive = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopRec = useRef<{ send: () => void; cancel: () => void } | null>(null);

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
          const a = new Audio(URL.createObjectURL(b));
          audio.current = a;
          a.onended = () => play(i + 1);
          a.onerror = fallback;
          return a.play().then(start, fallback);
        })
        .catch(fallback);
    };
    play(0);
  };
  const say = (t: string, then?: () => void) => {
    setPhase("thinking");
    speak(
      t,
      () => {
        if (!alive.current) return;
        setPhase("idle");
        then?.();
      },
      () => (setLog((l) => [...l, { who: "asistente", text: t }]), setPhase("speaking")),
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

  const handle = async (said: string, keepListening: boolean) => {
    // Un «sí»/«no» suelto sin nada pendiente (eco, o repetido) no es una orden: se ignora sin gastar una consulta.
    const n0 = plain(said);
    if (!pending.current && n0.length < 20 && (YES.test(n0) || NO.test(n0))) return keepListening && alive.current ? listen() : undefined;
    setLog((l) => [...l, { who: "tú", text: said }]);
    const next = () => keepListening && alive.current && listen();
    const p = pending.current;
    if (p) {
      const n = plain(said);
      if (YES.test(n)) {
        pending.current = null;
        setPhase("thinking");
        try {
          await confirm(p.action, p.payload);
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
      const r = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: said }) });
      const d: Reply = await r.json();
      if (d.proposal) {
        pending.current = d.proposal;
        return say(`${d.proposal.summary}. ¿Lo guardo?`, next);
      }
      say(d.message ?? d.error ?? "No he entendido.", next);
    } catch {
      say("No me he podido conectar.", next);
    }
  };

  // Escucha una frase: graba cuando detecta voz y se para tras ~1,3 s de silencio.
  const listen = async () => {
    setError("");
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("No se puede usar el micrófono (hace falta https o localhost y dar permiso). Escribe la orden.");
    }
    const s = stream.current;
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(s).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const rec = new MediaRecorder(s);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    let heard = false, lastVoice = Date.now(), cancelled = false;
    const t0 = Date.now();
    const tick = setInterval(() => {
      an.getByteTimeDomainData(buf);
      const level = Math.max(...buf.map((x) => Math.abs(x - 128))) / 128;
      const now = Date.now();
      if (level > 0.08) (heard = true), (lastVoice = now);
      if ((heard && now - lastVoice > 1000) || now - t0 > (heard ? 30000 : 8000)) rec.stop();
    }, 100);
    const end = () => rec.state !== "inactive" && rec.stop();
    stopRec.current = { send: end, cancel: () => ((cancelled = true), end()) };
    rec.onstop = async () => {
      clearInterval(tick);
      ctx.close();
      stopRec.current = null;
      if (cancelled || !alive.current) return setPhase("idle");
      if (!heard) return setPhase("idle"); // nadie habló: se queda esperando
      setPhase("thinking");
      const f = new FormData();
      f.append("audio", new Blob(chunks, { type: rec.mimeType }), "voz.webm");
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

  const toggle = () => {
    if (phase === "listening") stopRec.current?.send();
    else if (phase === "idle") listen();
    else if (phase === "speaking") (audio.current?.pause(), speechSynthesis.cancel(), setPhase("idle"));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()} title="Habla con el asistente">
      <div className="grid gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={phase === "thinking"}
          aria-label={LABEL[phase]}
          className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-white transition ${phase === "listening" ? "animate-pulse bg-red-500" : phase === "speaking" ? "bg-teal-500" : "bg-teal-700"}`}
        >
          {phase === "idle" ? <MicOff size={34} /> : <Mic size={34} />}
        </button>
        <p className="text-center text-sm text-slate-500">{LABEL[phase]}</p>
        <details className="rounded-xl border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">Voz y velocidad</summary>
          <div className="mt-2 grid gap-2">
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
        </details>
        {phase === "listening" && (
          <Button variant="outline" onClick={() => stopRec.current?.cancel()}>Cancelar grabación</Button>
        )}
        {error && <p className="error">{error}</p>}
        <div className="grid max-h-60 gap-2 overflow-auto">
          {log.map((l, i) => (
            <div key={i} className={`rounded-xl px-3 py-2 text-sm ${l.who === "tú" ? "ml-8 bg-slate-100" : "mr-8 border"}`}>
              {l.text}
            </div>
          ))}
        </div>
        {pending.current && phase === "idle" && (
          <div className="flex gap-2">
            <Button onClick={() => handle("sí", false)}>Confirmar y guardar</Button>
            <Button variant="outline" onClick={() => handle("no", false)}>Cancelar</Button>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const t = text.trim();
            if (!t) return;
            setText("");
            handle(t, false);
          }}
        >
          <input className="flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="…o escribe la orden" />
          <Button variant="outline" disabled={!text.trim() || phase === "thinking"}>Enviar</Button>
        </form>
      </div>
    </Dialog>
  );
}
