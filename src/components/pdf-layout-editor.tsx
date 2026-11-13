"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { PAGE, defaultLayout, fieldText, fields, readLayout, tableCols, totalKeys, totalLabels, type FieldData, type PdfBlock, type PdfLayout } from "@/lib/pdf-layout";

// Última factura sin importes (fechas en ISO porque llega del servidor).
export type EditorSample = Omit<FieldData, "date" | "due"> & {
  date: string;
  due?: { label: string; date: string } | null;
  lines: { description: string; quantity: string; unit: string }[];
  totals: string[];
  notes?: string | null;
};

const kindNames: Record<string, string> = { text: "Texto", box: "Caja", divider: "Línea", table: "Tabla de líneas", totals: "Totales", notes: "Anotaciones" };
const nameOf = (k: PdfBlock) => (k.kind === "field" && k.field ? fields[k.field] : k.kind === "text" ? `Texto: ${k.text.slice(0, 24) || "(vacío)"}` : kindNames[k.kind]);
// Con factura real se ven sus datos; sin ella, solo el nombre de cada dato. Los importes siempre van entre corchetes.
const preview = (k: PdfBlock, data?: FieldData) =>
  k.kind === "field" && data
    ? fieldText(k, data)
    : k.kind === "field" && k.field
    ? k.field === "title" && k.text
      ? k.text
      : `${k.label}[${fields[k.field]}]`
    : k.kind === "text"
      ? k.text
      : "";
// Totales y anotaciones siguen a la tabla: solo se mueven en horizontal.
const flowing = new Set(["totals", "notes"]);
const deletable = new Set(["text", "box", "divider"]);
const styled = (k: PdfBlock) => k.kind === "field" || k.kind === "text";

export function PdfLayoutEditor({ value, sample, previewUrl }: { value: unknown; sample?: EditorSample; previewUrl?: string }) {
  const data = useMemo<FieldData | undefined>(() => sample && { ...sample, date: new Date(sample.date), due: sample.due && { label: sample.due.label, date: new Date(sample.due.date) } }, [sample]);
  // Lo que la última factura no tiene no aparece en el editor (en otros documentos se imprime si tienen el dato).
  const shown = (k: PdfBlock) => !data || (k.kind === "field" ? !!fieldText(k, data) : k.kind === "notes" ? !!sample?.notes : true);
  const totalRows = sample ? totalKeys.flatMap((key, i) => (sample.totals.includes(key) ? [i] : [])) : totalKeys.map((_, i) => i);
  const lines = sample?.lines.slice(0, 12) ?? [];
  const [layout, setLayout] = useState<PdfLayout>(() => readLayout(value));
  const [sel, setSel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scale, setScale] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "size"; sx: number; sy: number; o: PdfBlock } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / PAGE.w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const patch = (id: string, p: Partial<PdfBlock>) => setLayout((l) => ({ blocks: l.blocks.map((k) => (k.id === id ? { ...k, ...p } : k)) }));
  const clamp = (n: number, max: number) => Math.round(Math.max(0, Math.min(max, n)));
  const current = layout.blocks.find((k) => k.id === sel);
  const tableY = layout.blocks.find((t) => t.id === "table")?.y ?? 245;
  const flowTop = tableY + 18 + Math.max(1, lines.length) * 16 + 22;

  const start = (e: React.PointerEvent, k: PdfBlock, mode: "move" | "size") => {
    e.stopPropagation();
    e.preventDefault();
    setSel(k.id);
    drag.current = { id: k.id, mode, sx: e.clientX, sy: e.clientY, o: k };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / scale,
      dy = (e.clientY - d.sy) / scale,
      o = d.o;
    if (d.mode === "move") patch(d.id, { x: clamp(o.x + dx, PAGE.w - 10), ...(flowing.has(o.kind) ? {} : { y: clamp(o.y + dy, PAGE.h - 1) }) });
    else patch(d.id, { w: Math.max(10, clamp(o.w + dx, PAGE.w - o.x)), ...(o.kind === "box" ? { h: Math.max(1, clamp(o.h + dy, PAGE.h - o.y)) } : {}) });
  };
  const add = (kind: "text" | "box" | "divider") => {
    const id = `${kind}-${Date.now().toString(36)}`;
    const k: PdfBlock = { id, kind, x: 60, y: 700, w: kind === "text" ? 160 : 200, h: kind === "box" ? 60 : 1, size: 10, color: kind === "box" ? "#cbd5e1" : kind === "divider" ? "#e2e8f0" : "#0f172a", fill: "#f8fafc", bold: false, align: "left", label: "", text: kind === "text" ? "Nuevo texto" : "", cols: [], hidden: false, hide: [] };
    setLayout((l) => ({ blocks: [...l.blocks, k] }));
    setSel(id);
  };
  const save = async (l: PdfLayout | null) => {
    setSaving(true);
    try {
      const r = await fetch("/api/operations/pdfLayout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: l }) });
      if (!r.ok) throw Error((await r.json().catch(() => ({}))).error ?? "No se pudo guardar la plantilla.");
      if (!l) setLayout(defaultLayout());
      setMsg({ ok: true, text: l ? "Plantilla guardada." : "Plantilla restablecida." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };
  const setCol = (k: PdfBlock, i: number, v: string, defaults: string[]) => {
    const cols = defaults.map((d, j) => k.cols[j] ?? d);
    cols[i] = v;
    patch(k.id, { cols });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,595px) minmax(240px,1fr)", gap: 20, padding: "0 16px 16px" }} className="pdf-editor">
      <style>{`@media(max-width:900px){.pdf-editor{grid-template-columns:1fr!important}}.pdf-editor input:not([type=checkbox]),.pdf-editor select,.pdf-editor textarea{margin:3px 0 8px;padding:6px 8px;font-size:13px}.pdf-editor input[type=color]{height:32px!important}.pdf-editor textarea{min-height:60px}.pdf-editor label{font-size:12px}.pdf-editor .form-grid{gap:0 10px}`}</style>
      <div ref={wrap}>
        <div style={{ height: PAGE.h * scale, position: "relative" }}>
          <div
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerDown={() => setSel("")}
            style={{ width: PAGE.w, height: PAGE.h, transform: `scale(${scale})`, transformOrigin: "0 0", position: "absolute", background: "#fff", border: "1px solid #dbe3e3", boxShadow: "0 4px 20px #0001", touchAction: "none", fontFamily: "Helvetica, Arial, sans-serif" }}
          >
            {layout.blocks.filter(shown).map((k) => (
              <div
                key={k.id}
                onPointerDown={(e) => start(e, k, "move")}
                title={nameOf(k)}
                style={{
                  position: "absolute", left: k.x, top: flowing.has(k.kind) ? flowTop : k.kind === "table" ? k.y - 6 : k.y, width: k.w,
                  height: k.kind === "box" ? k.h : k.kind === "divider" ? Math.max(3, k.h) : undefined,
                  cursor: "move", whiteSpace: "pre-wrap", lineHeight: 1.15, fontSize: k.size, fontWeight: k.bold ? 700 : 400, textAlign: k.align, boxSizing: "border-box",
                  color: k.color, opacity: k.hidden ? 0.25 : 1, zIndex: k.kind === "box" ? 0 : 1,
                  background: k.kind === "box" ? k.fill : k.kind === "divider" ? k.color : undefined,
                  border: k.kind === "box" ? `1px solid ${k.color}` : undefined,
                  outline: sel === k.id ? "2px solid #0f766e" : "1px dashed #0f766e33", overflow: "hidden",
                }}
              >
                {preview(k, data)}
                {k.kind === "table" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 45px 55px 40px 65px", columnGap: 10, padding: "6px 6px", background: k.fill, color: "#64748b", fontSize: 8, fontWeight: 700 }}>
                      {tableCols.map((d, i) => <span key={i} style={{ textAlign: i ? "right" : "left" }}>{k.cols[i] ?? d}</span>)}
                    </div>
                    {lines.length ? lines.map((l, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 45px 55px 40px 65px", columnGap: 10, padding: "3px 6px", borderBottom: "1px solid #f1f5f9" }}>
                        <span>{l.description}</span><span style={{ textAlign: "right" }}>{Number(l.quantity)} {l.unit}</span>
                        {["[importe]", "[dto.]", "[importe]"].map((x, j) => <span key={j} style={{ textAlign: "right", color: "#94a3b8" }}>{x}</span>)}
                      </div>
                    )) : <div style={{ padding: "4px 6px", color: "#94a3b8" }}>[Líneas del documento]</div>}
                  </>
                )}
                {k.kind === "totals" && totalRows.filter((i) => !k.hide.includes(totalKeys[i])).map((i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontWeight: i === 3 ? 700 : 400, fontSize: i === 3 ? k.size + 3 : k.size, color: i === 3 ? k.color : "#0f172a" }}>
                    <span>{k.cols[i] ?? totalLabels[i]}</span><span style={{ color: "#94a3b8" }}>[importe]</span>
                  </div>
                ))}
                {k.kind === "notes" && (
                  <>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b" }}>{k.label}</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{sample?.notes || <span style={{ color: "#94a3b8" }}>[Anotaciones del documento]</span>}</div>
                  </>
                )}
                {sel === k.id && (
                  <span onPointerDown={(e) => start(e, k, "size")} title="Cambiar tamaño" style={{ position: "absolute", right: 0, bottom: 0, width: 10, height: 10, background: "#0f766e", cursor: "nwse-resize" }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className="actions" style={{ marginBottom: 12 }}>
          <Button size="sm" variant="outline" onClick={() => add("text")}>+ Texto</Button>
          <Button size="sm" variant="outline" onClick={() => add("box")}>+ Caja</Button>
          <Button size="sm" variant="outline" onClick={() => add("divider")}>+ Línea</Button>
        </div>
        <label>Elemento
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Elige un elemento…</option>
            {layout.blocks.filter(shown).map((k) => <option key={k.id} value={k.id}>{nameOf(k)}{k.hidden ? " (oculto)" : ""}</option>)}
          </select>
        </label>
        {current ? (
          <div>
            {current.kind === "text" && (
              <label>Texto<textarea value={current.text} maxLength={2000} onChange={(e) => patch(current.id, { text: e.target.value })} /></label>
            )}
            {current.kind === "field" && current.field === "title" && (
              <label>Texto del título (vacío = FACTURA / PRESUPUESTO)<input value={current.text} maxLength={60} onChange={(e) => patch(current.id, { text: e.target.value })} /></label>
            )}
            {current.kind === "field" && current.field !== "title" && (
              <label>Texto delante del dato{current.field === "due" ? " (vacío = «Vencimiento:» / «Válido hasta:»)" : ""}<input value={current.label} maxLength={60} onChange={(e) => patch(current.id, { label: e.target.value })} /></label>
            )}
            {current.kind === "notes" && (
              <label>Encabezado<input value={current.label} maxLength={60} onChange={(e) => patch(current.id, { label: e.target.value })} /></label>
            )}
            {(current.kind === "table" || current.kind === "totals") && (
              <div className="form-grid">
                {(current.kind === "table" ? tableCols.map((_, i) => i) : totalRows).map((i) => {
                  const all = current.kind === "table" ? tableCols : totalLabels;
                  return (
                    <label key={i}>
                      {current.kind === "table" ? `Columna ${i + 1}` : (
                        <span style={{ display: "flex", justifyContent: "space-between" }}>
                          {totalLabels[i]}
                          <span><input type="checkbox" checked={!current.hide.includes(totalKeys[i])} onChange={(e) => patch(current.id, { hide: e.target.checked ? current.hide.filter((h) => h !== totalKeys[i]) : [...current.hide, totalKeys[i]] })} />Mostrar</span>
                        </span>
                      )}
                      <input value={current.cols[i] ?? all[i]} maxLength={40} disabled={current.kind === "totals" && current.hide.includes(totalKeys[i])} onChange={(e) => setCol(current, i, e.target.value, all)} />
                    </label>
                  );
                })}
              </div>
            )}
            <div className="form-grid">
              <label>X<input type="number" value={current.x} onChange={(e) => patch(current.id, { x: clamp(+e.target.value, PAGE.w - 10) })} /></label>
              {!flowing.has(current.kind) && <label>Y<input type="number" value={current.y} onChange={(e) => patch(current.id, { y: clamp(+e.target.value, PAGE.h - 1) })} /></label>}
              <label>Ancho<input type="number" value={current.w} onChange={(e) => patch(current.id, { w: Math.max(10, clamp(+e.target.value, PAGE.w)) })} /></label>
              {(current.kind === "box" || current.kind === "divider") && <label>{current.kind === "box" ? "Alto" : "Grosor"}<input type="number" value={current.h} onChange={(e) => patch(current.id, { h: Math.max(1, clamp(+e.target.value, PAGE.h)) })} /></label>}
              {!["box", "divider"].includes(current.kind) && <label>Tamaño de letra<input type="number" min={5} max={48} value={current.size} onChange={(e) => patch(current.id, { size: Math.min(48, Math.max(5, +e.target.value || 10)) })} /></label>}
              <label>{current.kind === "box" ? "Borde" : "Color"}<input type="color" value={current.color} onChange={(e) => patch(current.id, { color: e.target.value })} style={{ padding: 2 }} /></label>
              {(current.kind === "box" || current.kind === "table") && <label>Fondo{current.kind === "table" ? " del encabezado" : ""}<input type="color" value={current.fill} onChange={(e) => patch(current.id, { fill: e.target.value })} style={{ padding: 2 }} /></label>}
              {styled(current) && (
                <label>Alineación
                  <select value={current.align} onChange={(e) => patch(current.id, { align: e.target.value as PdfBlock["align"] })}>
                    <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>
                  </select>
                </label>
              )}
            </div>
            {styled(current) && (
              <label style={{ marginBottom: 8 }}><input type="checkbox" checked={current.bold} onChange={(e) => patch(current.id, { bold: e.target.checked })} />Negrita</label>
            )}
            {deletable.has(current.kind) ? (
              <button className="text-button" style={{ color: "#ab493b" }} onClick={() => { setLayout((l) => ({ blocks: l.blocks.filter((k) => k.id !== current.id) })); setSel(""); }}>Eliminar</button>
            ) : current.kind !== "table" && (
              <label><input type="checkbox" checked={current.hidden} onChange={(e) => patch(current.id, { hidden: e.target.checked })} />Ocultar en el PDF</label>
            )}
            {(current.kind === "table" || flowing.has(current.kind)) && (
              <p className="small-note" style={{ marginTop: 8 }}>{current.kind === "table" ? "La tabla crece con las líneas; arrástrala para cambiar dónde empieza." : "Se coloca justo debajo de la tabla; solo puedes moverlo a izquierda o derecha."}</p>
            )}
            {current.kind === "field" && <p className="small-note" style={{ marginTop: 8 }}>Si el documento no tiene este dato, la línea no se imprime.</p>}
          </div>
        ) : (
          <p className="small-note">Pulsa un elemento en la hoja o elígelo en la lista. Arrástralo para moverlo y usa la esquina para cambiar su ancho.</p>
        )}
        {msg && <p className={msg.ok ? "small-note" : "error"} style={{ marginTop: 12 }} role="status">{msg.text}</p>}
        <div className="form-footer" style={{ flexWrap: "wrap" }}>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => window.confirm("¿Volver al diseño original?") && save(null)}>Restablecer</Button>
          {previewUrl && <a className="text-button" style={{ alignSelf: "center" }} href={previewUrl} target="_blank" rel="noreferrer">Ver última factura</a>}
          <Button size="sm" disabled={saving} onClick={() => save(layout)}>{saving ? "Guardando…" : "Guardar plantilla"}</Button>
        </div>
      </div>
    </div>
  );
}
