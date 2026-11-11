"use client";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useDismiss } from "./more-menu";

/** Color de una etiqueta de estado (clases .pill): la misma regla para el listado y para este filtro. */
export const pillTone = (text: string) =>
  /En proceso|Leyendo/.test(text) ? "blue" : /Finalizado|Facturado|Cobrado|Confirmado|Aprobado|guardada/.test(text) ? "green" : /Pendiente|cola|atención/.test(text) ? "orange" : "";

/** Desplegable de estados con sus colores y el número de trabajos de cada uno. */
export function StatusFilter({ options, value, onChange, counts }: { options: string[]; value: string; onChange: (v: string) => void; counts?: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div className="sf" ref={ref}>
      <button type="button" className="sf-trigger" aria-label="Filtrar por estado" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`pill ${pillTone(value)}`}>{value}</span>
        <ChevronDown size={16} className="text-slate-400" />
      </button>
      {open && (
        <ul className="sf-list" role="listbox">
          {options.map((o) => (
            <li key={o} role="option" aria-selected={o === value}>
              <button type="button" onClick={() => { onChange(o); setOpen(false); }}>
                <span className={`pill ${pillTone(o)}`}>{o}</span>
                {counts?.[o] !== undefined && <small>{counts[o]}</small>}
                {o === value && <Check size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
