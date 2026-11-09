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
const LABEL: Record<Phase, string> = { idle: "Toca para hablar", listening: "Te escucho… toca para enviar", thinking: "Pensando…", speaking: "Hablando…" };

// Conversación por voz: escucha hasta que callas, responde en voz alta y pide confirmación antes de guardar.
export default function VoiceDialog({ close, confirm }: { close: () => void; confirm: (action: string, payload: unknown) => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<Proposal | null>(null);
  const alive = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopRec = useRef<{ send: () => void; cancel: () => void } | null>(null);

  const say = (t: string, then?: () => void) => {
    setLog((l) => [...l, { who: "asistente", text: t }]);
    const done = () => {
      if (!alive.current) return;
      setPhase("idle");
      then?.();
    };
    setPhase("speaking");
    const fallback = () => {
      if (!alive.current) return;
      if (!("speechSynthesis" in window)) return done();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "es-ES";
      u.onend = done;
      u.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    };
    // Voz natural del servidor interno (Piper); si falla, la del navegador.
    fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (!alive.current) return;
        const a = new Audio(URL.createObjectURL(b));
        audio.current = a;
        a.onended = done;
        a.onerror = fallback;
        return a.play().catch(fallback);
      })
      .catch(fallback);
  };

  const handle = async (said: string, keepListening: boolean) => {
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
      if ((heard && now - lastVoice > 1300) || now - t0 > (heard ? 30000 : 8000)) rec.stop();
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
