"use client";
import Link from "next/link";
import { useDismiss } from "./more-menu";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Link2, Maximize2, Minimize2, Pencil, Plus, RotateCcw, StickyNote, X } from "lucide-react";

type Item = { id: string; wide: boolean; title?: string; text?: string; links?: string[] };
export type HomeBlock = { id: string; title: string; node: ReactNode; wide?: boolean };
export type HomeLink = { href: string; label: string; icon: ComponentType<{ size?: number }> };

// El diseño vive en la base de datos (User.homeLayout); localStorage solo se lee una vez para migrar el diseño anterior.
const key = (userId: string) => `instala-home-v1-${userId}`;
const kind = (id: string) => (id.startsWith("note-") ? "note" : id.startsWith("links-") ? "links" : "block");

export default function HomeBoard({ userId, company, initial, blocks, links, defaultLinks }: { userId: string; company: string; initial?: unknown; blocks: HomeBlock[]; links: HomeLink[]; defaultLinks: string[] }) {
  const defaults = (): Item[] => [{ id: "links-main", wide: true, links: defaultLinks }, ...blocks.map((b) => ({ id: b.id, wide: !!b.wide }))];
  const [items, setItems] = useState<Item[]>(defaults);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const addRef = useDismiss<HTMLDivElement>(adding, () => setAdding(false));
  const [drag, setDrag] = useState("");
  const dragId = useRef("");
  const [saveError, setSaveError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const valid = (saved: unknown) => (Array.isArray(saved) ? (saved as Item[]).filter((i) => typeof i?.id === "string" && (kind(i.id) !== "block" || blocks.some((b) => b.id === i.id))) : null);
  const persist = (next: Item[]) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/operations/home-layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: next }) });
        if (!r.ok) throw Error((await r.json()).error ?? "No se pudo guardar.");
        setSaveError("");
      } catch (e) {
        setSaveError(`No se pudo guardar el diseño: ${(e as Error).message}`);
      }
    }, 500);
  };
  useEffect(() => {
    const server = valid(initial);
    if (server) return setItems(server);
    try {
      const old = valid(JSON.parse(localStorage.getItem(key(userId)) ?? "null"));
      if (old) {
        setItems(old);
        persist(old);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const save = (next: Item[]) => {
    setItems(next);
    persist(next);
  };
  const drop = (to: string) => {
    const from = items.findIndex((i) => i.id === dragId.current),
      dest = items.findIndex((i) => i.id === to);
    dragId.current = "";
    setDrag("");
    if (from < 0 || dest < 0 || from === dest) return;
    const next = [...items];
    next.splice(dest, 0, next.splice(from, 1)[0]);
    save(next);
  };
  const patch = (id: string, p: Partial<Item>) => save(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const move = (idx: number, d: number) => {
    const next = [...items];
    [next[idx], next[idx + d]] = [next[idx + d], next[idx]];
    save(next);
  };
  const add = (i: Item) => {
    save([...items, i]);
    setAdding(false);
  };
  const hidden = blocks.filter((b) => !items.some((i) => i.id === b.id));
  const label = (it: Item) => (kind(it.id) === "block" ? blocks.find((b) => b.id === it.id)?.title : it.title) || (kind(it.id) === "note" ? "Nota" : "Accesos rápidos");

  return (
    <>
      <div className="home-toolbar">
        <span className="home-company">{company}</span>
        <div className="home-tools">
          {editing && (
            <>
              <div className="home-add" ref={addRef}>
                <button type="button" className="home-btn" aria-expanded={adding} onClick={() => setAdding(!adding)}>
                  <Plus size={15} /> Añadir
                </button>
                {adding && (
                  <div className="home-menu" role="menu">
                    {hidden.map((b) => (
                      <button key={b.id} type="button" role="menuitem" onClick={() => add({ id: b.id, wide: !!b.wide })}>
                        {b.title}
                      </button>
                    ))}
                    <button type="button" role="menuitem" onClick={() => add({ id: `links-${Date.now()}`, wide: true, title: "Accesos rápidos", links: defaultLinks })}>
                      <Link2 size={14} /> Accesos rápidos nuevos
                    </button>
                    <button type="button" role="menuitem" onClick={() => add({ id: `note-${Date.now()}`, wide: false, title: "Nota", text: "" })}>
                      <StickyNote size={14} /> Nota nueva
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className="home-btn" onClick={() => confirm("¿Volver al diseño original del inicio?") && save(defaults())}>
                <RotateCcw size={15} /> Restablecer
              </button>
            </>
          )}
          <button type="button" className={`home-btn ${editing ? "primary" : ""}`} onClick={() => (setEditing(!editing), setAdding(false))}>
            {editing ? <Check size={15} /> : <Pencil size={15} />} {editing ? "Listo" : "Personalizar"}
          </button>
        </div>
      </div>
      {saveError && <p className="error" role="alert">{saveError}</p>}
      {!items.length && <p className="home-empty">Tu inicio está vacío. Pulsa «Personalizar» y «Añadir» para elegir qué quieres ver.</p>}
      <div className="home-grid">
        {items.map((it, idx) => {
          const k = kind(it.id);
          return (
            <section key={it.id} className={`home-block ${it.wide ? "wide" : ""} ${editing ? "editing" : ""} ${drag === it.id ? "dragging" : ""}`} aria-label={label(it)} onDragOver={(e) => dragId.current && e.preventDefault()} onDrop={() => drop(it.id)}>
              {editing && (
                <div className="home-edit-bar" draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", it.id); dragId.current = it.id; setTimeout(() => setDrag(it.id), 0); }} onDragEnd={() => { dragId.current = ""; setDrag(""); }}>
                  <strong title="Arrastra el bloque para moverlo">⋮⋮ {label(it)}</strong>
                  <span>
                    <button type="button" aria-label="Subir" disabled={!idx} onClick={() => move(idx, -1)}><ArrowUp size={15} /></button>
                    <button type="button" aria-label="Bajar" disabled={idx === items.length - 1} onClick={() => move(idx, 1)}><ArrowDown size={15} /></button>
                    <button type="button" aria-label={it.wide ? "Hacer más estrecho" : "Hacer más ancho"} onClick={() => patch(it.id, { wide: !it.wide })}>{it.wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
                    <button type="button" aria-label={`Quitar ${label(it)}`} onClick={() => save(items.filter((i) => i.id !== it.id))}><X size={15} /></button>
                  </span>
                </div>
              )}
              {k === "block" && blocks.find((b) => b.id === it.id)?.node}
              {k === "links" && (
                <div className="home-links-card">
                  {editing && <input aria-label="Título de los accesos" value={it.title ?? ""} placeholder="Título (opcional)" onChange={(e) => patch(it.id, { title: e.target.value })} />}
                  {!editing && it.title && it.id !== "links-main" && <h2>{it.title}</h2>}
                  <div className="home-links">
                    {links
                      .filter((l) => editing || it.links?.includes(l.href))
                      .map((l) =>
                        editing ? (
                          <label key={l.href} className={`home-link ${it.links?.includes(l.href) ? "on" : ""}`}>
                            <input type="checkbox" checked={!!it.links?.includes(l.href)} onChange={(e) => patch(it.id, { links: e.target.checked ? [...(it.links ?? []), l.href] : (it.links ?? []).filter((h) => h !== l.href) })} />
                            <l.icon size={18} /> {l.label}
                          </label>
                        ) : (
                          <Link key={l.href} href={l.href} className="home-link">
                            <l.icon size={18} /> {l.label}
                          </Link>
                        ),
                      )}
                  </div>
                </div>
              )}
              {k === "note" && (
                <div className="home-note">
                  {editing ? (
                    <>
                      <input aria-label="Título de la nota" value={it.title ?? ""} placeholder="Título (opcional)" onChange={(e) => patch(it.id, { title: e.target.value })} />
                      <textarea aria-label="Texto de la nota" maxLength={2000} value={it.text ?? ""} placeholder="Escribe aquí lo que quieras recordar" onChange={(e) => patch(it.id, { text: e.target.value })} />
                    </>
                  ) : (
                    <>
                      {it.title && <h2>{it.title}</h2>}
                      <p>{it.text || "Sin texto. Pulsa «Personalizar» para escribir."}</p>
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
