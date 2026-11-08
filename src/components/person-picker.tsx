"use client";
import { useMemo, useState } from "react";
import { Plus, Search, UserRound } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type Person = { id: string; name: string; sub: string[] };
type Kind = "customer" | "worker";
const TEXT = {
  customer: { choose: "Elegir cliente", create: "Crear cliente", title: "Clientes", empty: "Aún no hay clientes." },
  worker: { choose: "Elegir técnico", create: "Crear técnico", title: "Técnicos", empty: "Aún no hay técnicos." },
};

// Caja que muestra la persona elegida; al pulsarla abre un listado con buscador, ficha y botón de alta.
export function PersonPicker({
  kind,
  people,
  value,
  optional,
  onChange,
  onCreate,
  onToggle,
}: {
  kind: Kind;
  people: Person[];
  value: string;
  optional?: boolean;
  onChange: (id: string) => void;
  onCreate: (draft: Record<string, string>) => Promise<{ id: string }>;
  onToggle?: (open: boolean) => void;
}) {
  const t = TEXT[kind];
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [creating, setCreating] = useState(false),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = people.find((p) => p.id === value);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => !needle || [p.name, ...p.sub].join(" ").toLowerCase().includes(needle));
  }, [people, q]);
  const toggle = (v: boolean) => {
    setOpen(v);
    onToggle?.(v);
  };
  const pick = (id: string) => {
    onChange(id);
    toggle(false);
    setQ("");
  };
  return (
    <>
      <button type="button" className="person-box" onClick={() => toggle(true)}>
        <UserRound size={18} />
        <span>
          <strong>{current?.name ?? t.choose}</strong>
          {current?.sub[0] && <small>{current.sub.filter(Boolean).join(" · ")}</small>}
        </span>
      </button>
      {open && (
        <Dialog open onOpenChange={(v) => !v && toggle(false)} title={t.title} nested>
          {creating ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                // Los eventos de React cruzan los portales: sin esto se enviaría también el formulario de fuera.
                e.stopPropagation();
                setBusy(true);
                setError("");
                try {
                  const row = await onCreate(draft);
                  setCreating(false);
                  setDraft({});
                  pick(row.id);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="form-grid">
                <label className="full">Nombre
                  <input autoFocus required value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                {kind === "customer" ? (
                  <>
                    <label>Teléfono <span className="font-normal text-slate-400">· opcional</span>
                      <input type="tel" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                    </label>
                    <label>Correo <span className="font-normal text-slate-400">· opcional</span>
                      <input type="email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                    </label>
                    <label className="full">Dirección <span className="font-normal text-slate-400">· opcional</span>
                      <input value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
                    </label>
                  </>
                ) : (
                  <>
                    <label>Coste por hora (€)
                      <input type="number" required min="0" step="0.01" value={draft.hourlyCost ?? ""} onChange={(e) => setDraft({ ...draft, hourlyCost: e.target.value })} />
                    </label>
                    <label>Especialidad <span className="font-normal text-slate-400">· opcional</span>
                      <input value={draft.specialty ?? ""} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} />
                    </label>
                  </>
                )}
              </div>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="form-footer">
                <Button type="button" variant="outline" disabled={busy} onClick={() => setCreating(false)}>Volver</Button>
                <Button loading={busy}>{busy ? "Creando…" : t.create}</Button>
              </div>
            </form>
          ) : (
            <>
              <div className="person-tools">
                <label className="person-search">
                  <Search size={16} />
                  <input autoFocus type="search" placeholder="Buscar por nombre, teléfono o NIF" value={q} onChange={(e) => setQ(e.target.value)} />
                </label>
                <Button type="button" onClick={() => setCreating(true)}><Plus size={16} />{t.create}</Button>
              </div>
              <div className="person-list">
                {optional && (
                  <button type="button" className="person-card" onClick={() => pick("")}>
                    <strong>Sin asignar</strong>
                  </button>
                )}
                {list.map((p) => (
                  <button type="button" key={p.id} className={`person-card${p.id === value ? " on" : ""}`} onClick={() => pick(p.id)}>
                    <strong>{p.name}</strong>
                    {p.sub.filter(Boolean).map((x) => <small key={x}>{x}</small>)}
                  </button>
                ))}
                {!list.length && <p className="small-note">{people.length ? "Nadie coincide con la búsqueda." : t.empty}</p>}
              </div>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
