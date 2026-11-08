"use client";
import { Plus, Trash2 } from "lucide-react";
import { dec, lineNet } from "@/lib/money";

export type Line = {
  key: string;
  lotId?: string;
  catalogId?: string;
  description: string;
  unit: string;
  quantity: string;
  price: string;
};
export const newLine = (p: Partial<Line> = {}): Line => ({
  key: crypto.randomUUID(),
  description: "",
  unit: "ud",
  quantity: "1",
  price: "",
  ...p,
});
export const lineTotal = (l: Line) => {
  try {
    return l.quantity && l.price ? lineNet(l.quantity, l.price) : "0.00";
  } catch {
    return "0.00";
  }
};
export const linesNet = (lines: Line[]) =>
  lines.reduce((a, l) => a.plus(lineTotal(l)), dec(0)).toDecimalPlaces(2).toFixed(2);

const eur = (n: string) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n));

// Tabla de líneas editable: concepto, cantidad, precio y total. Los botones para añadir van como hijos.
export function LinesEditor({
  lines,
  onChange,
  priceLabel = "Precio",
  children,
}: {
  lines: Line[];
  onChange: (l: Line[]) => void;
  priceLabel?: string;
  children?: React.ReactNode;
}) {
  const set = (key: string, patch: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <section className="lines-ed">
      <div className="lines-tools">
        {children}
        <button type="button" className="text-button" onClick={() => onChange([...lines, newLine()])}>
          <Plus size={14} /> Línea manual
        </button>
      </div>
      {lines.length ? (
        <div className="lines-grid">
          <div className="lines-head">
            <span>Concepto</span>
            <span>Cant.</span>
            <span>{priceLabel}</span>
            <span>Total</span>
            <span />
          </div>
          {lines.map((l) => (
            <div className="lines-row" key={l.key}>
              <input aria-label="Concepto" placeholder="Concepto" value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} />
              <input aria-label="Cantidad" type="number" min="0" step="any" value={l.quantity} onChange={(e) => set(l.key, { quantity: e.target.value })} />
              <input aria-label={priceLabel} type="number" min="0" step="any" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} />
              <strong>{eur(lineTotal(l))}</strong>
              <button type="button" aria-label="Quitar línea" onClick={() => onChange(lines.filter((x) => x.key !== l.key))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="small-note">Aún no hay líneas. Usa los botones de arriba para añadirlas.</p>
      )}
    </section>
  );
}
