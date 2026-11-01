"use client";
import { useId, useState } from "react";
import { useSWRConfig } from "swr";
import type { Supplier } from "@/lib/workspace-types";
import { Button } from "./ui/button";

export function SupplierPicker({
  suppliers,
  value,
  onChange,
  name,
  initial,
}: {
  suppliers: Supplier[];
  value: string;
  onChange: (id: string) => void;
  name?: string;
  initial?: { name: string; taxId: string; phone: string; email: string };
}) {
  const id = useId(),
    { mutate } = useSWRConfig();
  const [created, setCreated] = useState<Supplier[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState(
    initial ?? { name: "", taxId: "", phone: "", email: "" },
  );
  const options = [
    ...new Map([...suppliers, ...created].map((s) => [s.id, s])).values(),
  ];
  const save = async () => {
    if (busy || !draft.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const existing = options.find(
        (s) =>
          draft.taxId.trim() &&
          s.taxId.replace(/[\s-]/g, "").toUpperCase() ===
            draft.taxId.replace(/[\s-]/g, "").toUpperCase(),
      );
      if (existing) {
        onChange(existing.id);
        setOpen(false);
        return;
      }
      const response = await fetch("/api/operations/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setCreated((list) => [...list, data]);
      onChange(data.id);
      setOpen(false);
      void mutate("/api/state");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo crear el proveedor.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label htmlFor={id}>Proveedor</label>
      <select
        id={id}
        name={name}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecciona proveedor</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Cerrar alta de proveedor" : "Crear proveedor"}
      </Button>
      {open && (
        <fieldset
          className="rounded-xl border border-slate-200 p-4 mt-3"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        >
          <legend className="font-bold">Nuevo proveedor</legend>
          {initial && (
            <p className="small-note mb-3">
              Datos propuestos desde la factura. Compruébalos antes de crear.
            </p>
          )}
          {(
            [
              ["name", "Nombre del proveedor"],
              ["taxId", "NIF / CIF"],
              ["phone", "Teléfono"],
              ["email", "Correo del proveedor"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type={
                  key === "email" ? "email" : key === "phone" ? "tel" : "text"
                }
                value={draft[key]}
                maxLength={key === "name" ? 200 : 2000}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Button
            type="button"
            disabled={busy || !draft.name.trim()}
            onClick={() => void save()}
          >
            {busy ? "Creando…" : "Guardar y seleccionar proveedor"}
          </Button>
        </fieldset>
      )}
    </div>
  );
}
