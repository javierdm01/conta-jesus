"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Sparkles } from "lucide-react";

const KEY = "instala-fab-hidden";
const HIDE_X = 54; // cuánto se desplaza a la derecha al ocultarse (queda un borde visible)

/**
 * Botón flotante del asistente (solo móvil), como el de Meta AI: tócalo para hablar, arrástralo a la derecha para
 * esconderlo y, con la pestaña asomando, arrástrala a la izquierda (o tócala) para sacarlo.
 */
export function AssistantFab({ onOpen }: { onOpen: () => void }) {
  const [hidden, setHidden] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);
  const remember = (h: boolean) => {
    setHidden(h);
    try {
      localStorage.setItem(KEY, h ? "1" : "0");
    } catch {}
  };

  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const d = e.clientX - start.current.x;
    if (Math.abs(d) > 6) start.current.moved = true;
    setDx(hidden ? Math.min(0, Math.max(-HIDE_X, d)) : Math.max(0, Math.min(HIDE_X + 20, d)));
  };
  const end = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    const d = e.clientX - (s?.x ?? e.clientX);
    setDx(0);
    if (!s) return;
    if (!s.moved) return hidden ? remember(false) : onOpen();
    if (!hidden && d > 36) remember(true);
    else if (hidden && d < -24) remember(false);
  };

  return (
    <button
      type="button"
      className={`va-fab${hidden ? " hidden" : ""}`}
      aria-label={hidden ? "Mostrar el asistente" : "Abrir el asistente"}
      style={{ transform: `translateX(${(hidden ? HIDE_X : 0) + dx}px)`, transition: dragging ? "none" : "transform .22s cubic-bezier(.2,.8,.2,1)" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, moved: false };
        setDragging(true);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
        setDx(0);
      }}
    >
      {hidden ? <ChevronLeft size={22} /> : <Sparkles size={26} />}
    </button>
  );
}
