"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Download, Eye, EyeOff, Minus, Plus } from "lucide-react";
import { FIELD_LABEL, type FieldKind, type ViewerBox } from "@/lib/evidence-boxes";
import { FIELD_COLOR } from "./evidence-style";

type PageMeta = { page: number; width: number; height: number; scanQuality: string };
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "No se pudo cargar el documento.");
  return data as { pages: PageMeta[] };
};
const MIN = 1, MAX = 4;

export default function DocumentViewer({
  documentId,
  boxes,
  activeId,
  onSelect,
}: {
  documentId: string;
  boxes: ViewerBox[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  const { data, error } = useSWR(`/api/documents/${documentId}/pages`, fetcher);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [show, setShow] = useState(true);
  const [imageError, setImageError] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; zoom: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const pages = data?.pages ?? [];
  const meta = pages.find((p) => p.page === page) ?? pages[0];
  const visible = boxes.filter((b) => b.page === (meta?.page ?? page));

  // Al enfocar un campo se muestra su página y se centra su recuadro.
  useEffect(() => {
    const target = boxes.find((b) => b.id === activeId);
    if (!target) return;
    if (target.page !== page) {
      setPage(target.page);
      return;
    }
    const el = stage.current, inner = el?.firstElementChild as HTMLElement | null;
    if (!el || !inner) return;
    el.scrollTo({
      left: (target.box[0] + target.box[2] / 2) * inner.offsetWidth - el.clientWidth / 2,
      top: (target.box[1] + target.box[3] / 2) * inner.offsetHeight - el.clientHeight / 2,
      behavior: "smooth",
    });
  }, [activeId, boxes, page, zoom]);
  useEffect(() => setImageError(false), [page]);

  if (error)
    return (
      <div className="doc-viewer-empty" role="alert">
        <p>{error.message}</p>
        <a className="text-button inline-flex gap-2" href={`/api/documents/${documentId}`} target="_blank" rel="noreferrer">
          <Download size={16} /> Abrir original
        </a>
      </div>
    );
  if (!data) return <div className="doc-viewer-empty">Cargando documento…</div>;
  if (!meta)
    return (
      <div className="doc-viewer-empty">
        <p>No hay imagen preparada para este documento (se subió antes de esta función o no se pudo leer).</p>
        <a className="text-button inline-flex gap-2" href={`/api/documents/${documentId}`} target="_blank" rel="noreferrer">
          <Download size={16} /> Abrir original
        </a>
      </div>
    );

  const kinds = [...new Set(visible.map((b) => b.kind))] as FieldKind[];
  const clamp = (z: number) => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100));
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  return (
    <div className="doc-viewer">
      <div className="doc-viewer-bar">
        <button type="button" aria-label="Alejar" onClick={() => setZoom((z) => clamp(z - 0.5))}><Minus size={18} /></button>
        <span aria-live="polite">{Math.round(zoom * 100)} %</span>
        <button type="button" aria-label="Acercar" onClick={() => setZoom((z) => clamp(z + 0.5))}><Plus size={18} /></button>
        <button type="button" aria-pressed={show} onClick={() => setShow((s) => !s)}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />} {show ? "Ocultar recuadros" : "Ver recuadros"}
        </button>
        {pages.length > 1 && (
          <select aria-label="Página" value={meta.page} onChange={(e) => setPage(Number(e.target.value))}>
            {pages.map((p) => <option key={p.page} value={p.page}>Página {p.page}</option>)}
          </select>
        )}
        <a href={`/api/documents/${documentId}`} target="_blank" rel="noreferrer" aria-label="Abrir original"><Download size={18} /></a>
      </div>
      {meta.scanQuality === "fallback" && (
        <p className="small-note doc-viewer-note">No se detectó el contorno del papel; se muestra sin recortar.</p>
      )}
      <div
        className="doc-viewer-stage"
        ref={stage}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          setZoom((z) => clamp(z - e.deltaY / 400));
        }}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) gesture.current = { distance: distance(), zoom };
          else if (e.pointerType === "mouse" && stage.current)
            drag.current = { x: e.clientX, y: e.clientY, left: stage.current.scrollLeft, top: stage.current.scrollTop };
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2 && gesture.current)
            setZoom(clamp(gesture.current.zoom * (distance() / gesture.current.distance)));
          else if (drag.current && stage.current) {
            stage.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
            stage.current.scrollTop = drag.current.top - (e.clientY - drag.current.y);
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          gesture.current = null;
          drag.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          gesture.current = null;
          drag.current = null;
        }}
      >
        <div className="doc-viewer-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${meta.width} / ${meta.height}` }}>
          {imageError ? (
            <p className="error m-4" role="alert">La imagen de esta página ya no está en el servidor. Usa «Abrir original».</p>
          ) : (
            <img
              src={`/api/documents/${documentId}/pages/${meta.page}/image`}
              alt={`Página ${meta.page} del documento`}
              draggable={false}
              onError={() => setImageError(true)}
            />
          )}
          {show && !imageError &&
            visible.map((b) => (
              <button
                type="button"
                key={b.id}
                className={`doc-box${b.id === activeId ? " active" : ""}${b.approx ? " approx" : ""}`}
                style={{
                  left: `${b.box[0] * 100}%`, top: `${b.box[1] * 100}%`,
                  width: `${b.box[2] * 100}%`, height: `${b.box[3] * 100}%`,
                  ["--box-color" as string]: FIELD_COLOR[b.kind],
                }}
                aria-label={`${b.label}${b.approx ? " (aproximado)" : ""}`}
                onClick={() => onSelect?.(b.id)}
              >
                <span className="doc-box-label">{b.label}{b.approx ? " ≈" : ""}</span>
              </button>
            ))}
        </div>
      </div>
      {show && kinds.length > 0 && (
        <ul className="doc-viewer-legend" aria-label="Leyenda de recuadros">
          {kinds.map((k) => (
            <li key={k}><i style={{ background: FIELD_COLOR[k] }} />{FIELD_LABEL[k]}</li>
          ))}
          <li className="small-note">Borde discontinuo (≈): posición aproximada</li>
        </ul>
      )}
    </div>
  );
}
