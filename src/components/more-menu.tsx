"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

/** Cierra un menú abierto al pulsar fuera, al tocar Escape o al perder el foco con el teclado. */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    const focus = (e: FocusEvent) => !ref.current?.contains(e.target as Node) && close();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusin", focus);
    };
  }, [open, close]);
  return ref;
}

/** Menú «Más»: desplegable en escritorio, hoja inferior en móvil. Se cierra solo al elegir una opción. */
export function MoreMenu({ label = "Más", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div className="mm" ref={ref}>
      <button type="button" className="mm-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={16} /> {label}
      </button>
      {open && (
        <>
          <div className="mm-backdrop" aria-hidden onClick={() => setOpen(false)} />
          <div className="mm-list" role="menu" onClick={() => setOpen(false)}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}
