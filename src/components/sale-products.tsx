"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { dec } from "@/lib/money";
import { Button } from "./ui/button";
export type SaleProduct = {
  id: string;
  alias: string;
  description: string;
  unit: string;
  recommendedPrice?: string | null;
  brand?: string | null;
  location?: string | null;
  code?: string;
  reference?: string;
};
export type SaleProductLine = {
  lotId: string;
  description: string;
  unit: string;
  quantity: string;
  price: string;
};
export const productLine = (p: SaleProduct): SaleProductLine => ({
  lotId: p.id,
  description: p.alias || p.description,
  unit: p.unit,
  quantity: "1",
  price: p.recommendedPrice ?? "",
});
export default function SaleProducts({
  lines,
  onChange,
}: {
  lines: SaleProductLine[];
  onChange: (lines: SaleProductLine[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, error, isLoading } = useSWR<{
    items: SaleProduct[];
    total: number;
  }>(
    `/api/search/products?q=${encodeURIComponent(term)}`,
    async (url: string) => {
      const r = await fetch(url);
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      return body;
    },
  );
  const browsing = !!query.trim() || !lines.length;
  const waiting = query.trim() !== term || isLoading;
  return (
    <section className="sale-products">
      <h3>Artículos de la factura</h3>
      <label>
        Buscar por nombre, alias o referencia
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej. cable azul, enchufe, referencia…"
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}
      {browsing && waiting && <p role="status">Buscando artículos…</p>}
      {browsing && !waiting && (
        <div className="sale-product-results">
          {data?.items.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                setQuery("");
                const found = lines.find((l) => l.lotId === p.id);
                onChange(
                  found
                    ? lines.map((l) =>
                        l === found
                          ? {
                              ...l,
                              quantity: dec(l.quantity || 0)
                                .plus(1)
                                .toString(),
                            }
                          : l,
                      )
                    : [...lines, productLine(p)],
                );
              }}
            >
              <strong>{p.alias || p.description}</strong>
              <small>
                {p.reference || p.code} ·{" "}
                {p.recommendedPrice == null
                  ? "Precio pendiente"
                  : `${p.recommendedPrice} € / ${p.unit} recomendado`}
              </small>
            </button>
          ))}
        </div>
      )}
      {browsing && !waiting && data && !data.items.length && (
        <p role="status">
          No hay artículos que coincidan. Prueba otra palabra o referencia.
        </p>
      )}
      {browsing && !waiting && data && data.total > data.items.length && (
        <p className="small-note">
          Mostrando {data.items.length} de {data.total}. Escribe para afinar la
          búsqueda.
        </p>
      )}
      {lines.map((l, i) => (
        <fieldset className="sale-product-line" key={l.lotId}>
          <legend>Artículo {i + 1}</legend>
          <div className="form-grid">
            <label className="full">
              Concepto en factura
              <input
                required
                maxLength={200}
                value={l.description}
                onChange={(e) =>
                  onChange(
                    lines.map((x, j) =>
                      j === i ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Cantidad ({l.unit})
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                required
                value={l.quantity}
                onChange={(e) =>
                  onChange(
                    lines.map((x, j) =>
                      j === i ? { ...x, quantity: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Precio de venta sin IVA (€)
              <input
                type="number"
                min="0"
                step="0.0001"
                required
                value={l.price}
                onChange={(e) =>
                  onChange(
                    lines.map((x, j) =>
                      j === i ? { ...x, price: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
          >
            Quitar artículo {i + 1}
          </Button>
        </fieldset>
      ))}
      {!!lines.length && (
        <p className="small-note">
          Propuesta: coste + 30 %, sin IVA. Puedes ajustar el precio. Esta
          factura conserva el concepto aunque después cambies el alias; las
          existencias se controlan al registrar el uso del material.
        </p>
      )}
    </section>
  );
}
