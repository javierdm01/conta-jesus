"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

type SourceCaps = { id: "Platen" | "Feeder"; colorModes: ("RGB24" | "Grayscale8")[]; resolutions: number[] };
type ScannerInfo = { id: string; name: string; online: boolean; model?: string; state?: string; adf?: string; error?: string; sources: SourceCaps[] };
type Phase = "idle" | "scanning" | "uploading" | "failed";

const json = async (r: Response) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(body.error ?? "No se pudo completar la operación.");
  return body;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const closest = (list: number[], want: number) => (list.length ? list.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)) : want);

// Escanea por red (eSCL) desde una impresora configurada y entrega el PDF para procesarlo con el OCR de siempre.
export function ScanPanel({ canStart, onScanned, onBack }: { canStart: () => boolean; onScanned: (file: File) => Promise<void>; onBack: () => void }) {
  const [scanners, setScanners] = useState<ScannerInfo[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [scannerId, setScannerId] = useState("");
  const [source, setSource] = useState<"Platen" | "Feeder">("Platen");
  const [color, setColor] = useState<"RGB24" | "Grayscale8">("Grayscale8");
  const [dpi, setDpi] = useState(300);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pages, setPages] = useState(0);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const job = useRef("");
  const alive = useRef(true);

  const load = async () => {
    setLoadError("");
    setScanners(null);
    try {
      const { scanners } = (await json(await fetch("/api/scanners", { cache: "no-store" }))) as { scanners: ScannerInfo[] };
      setScanners(scanners);
      const first = scanners.find((s) => s.online) ?? scanners[0];
      if (first) pick(first);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      if (job.current) fetch(`/api/scans/${job.current}/cancel`, { method: "POST" }).catch(() => {});
    };
  }, []);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  // Valores pensados para el OCR: alimentador si hay, escala de grises y 300 ppp (o lo más parecido).
  const pick = (s: ScannerInfo, src?: "Platen" | "Feeder") => {
    setScannerId(s.id);
    const caps = s.sources.find((x) => x.id === src) ?? s.sources.find((x) => x.id === "Feeder" && s.adf !== "ScannerAdfEmpty") ?? s.sources[0];
    if (!caps) return;
    setSource(caps.id);
    setColor(caps.colorModes.includes("Grayscale8") ? "Grayscale8" : caps.colorModes[0] ?? "RGB24");
    setDpi(closest(caps.resolutions.filter((r) => r >= 150 && r <= 300), 300) || closest(caps.resolutions, 300));
  };
  const scanner = scanners?.find((s) => s.id === scannerId);
  const caps = scanner?.sources.find((x) => x.id === source);

  const send = async (f: File) => {
    setPhase("uploading");
    setError("");
    try {
      await onScanned(f);
    } catch (e) {
      setError((e as Error).message);
      setPhase("failed");
    }
  };
  const start = async () => {
    if (!scanner || !canStart()) return;
    setError("");
    setFile(null);
    setPreview("");
    setPages(0);
    setPhase("scanning");
    try {
      const { id } = await json(await fetch(`/api/scanners/${scanner.id}/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, color, dpi }) }));
      job.current = id;
      for (;;) {
        await sleep(1000);
        if (!alive.current) return;
        const st = await json(await fetch(`/api/scans/${id}`, { cache: "no-store" }));
        setPages(st.pages);
        if (st.state === "done") break;
        if (st.state !== "scanning") throw Error(st.error ?? "El escaneo no se completó.");
      }
      const r = await fetch(`/api/scans/${id}/pdf`, { cache: "no-store" });
      if (!r.ok) await json(r);
      job.current = "";
      const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      const f = new File([await r.blob()], `Escaneo-${stamp}.pdf`, { type: "application/pdf" });
      setFile(f);
      setPreview(URL.createObjectURL(f));
      await send(f);
    } catch (e) {
      job.current = "";
      if (!alive.current) return;
      setError((e as Error).message);
      setPhase("failed");
    }
  };
  const cancel = async () => {
    if (job.current) await fetch(`/api/scans/${job.current}/cancel`, { method: "POST" }).catch(() => {});
  };

  const busy = phase === "scanning" || phase === "uploading";
  if (loadError || !scanners)
    return (
      <div className="mb-4">
        <p className="small-note" role="status">{loadError ? "" : "Buscando escáneres…"}</p>
        {loadError && <p className="error" role="alert">{loadError}</p>}
        <div className="actions">
          {loadError && <Button type="button" size="sm" variant="outline" onClick={load}>Reintentar</Button>}
          <Button type="button" size="sm" variant="outline" onClick={onBack}>Volver</Button>
        </div>
      </div>
    );
  if (!scanners.length)
    return (
      <div className="mb-4">
        <p className="error" role="alert">No hay ningún escáner configurado. El responsable debe añadir la impresora en la variable SCANNERS del servidor (consulta docs/ESCANER.md).</p>
        <Button type="button" size="sm" variant="outline" onClick={onBack}>Volver</Button>
      </div>
    );

  return (
    <div className="mb-4">
      <label>
        Escáner
        <select value={scannerId} disabled={busy} onChange={(e) => pick(scanners.find((s) => s.id === e.target.value)!)}>
          {scanners.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.online ? (s.model ? ` · ${s.model}` : "") : " · sin conexión"}</option>
          ))}
        </select>
      </label>
      <p className="small-note" role="status" style={{ marginTop: -10, marginBottom: 12 }}>
        <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 6, background: scanner?.online ? (scanner.state === "Idle" ? "#2bb38f" : "#d6a13b") : "#c2410c" }} />
        {!scanner?.online ? scanner?.error : scanner.state === "Idle" ? "Disponible" : "Ocupado: espera a que termine"}
        {scanner?.online && " · "}
        {scanner?.online && <button type="button" className="text-button" onClick={load} disabled={busy}>Actualizar</button>}
      </p>
      {scanner?.online && caps && (
        <div className="form-grid">
          <label>
            Origen
            <select value={source} disabled={busy} onChange={(e) => pick(scanner, e.target.value as "Platen" | "Feeder")}>
              {scanner.sources.map((s) => <option key={s.id} value={s.id}>{s.id === "Feeder" ? "Alimentador (varias hojas)" : "Cristal (una hoja)"}</option>)}
            </select>
          </label>
          <label>
            Color
            <select value={color} disabled={busy} onChange={(e) => setColor(e.target.value as "RGB24" | "Grayscale8")}>
              {caps.colorModes.map((m) => <option key={m} value={m}>{m === "RGB24" ? "Color" : "Escala de grises"}</option>)}
            </select>
          </label>
          <label>
            Resolución
            <select value={dpi} disabled={busy} onChange={(e) => setDpi(Number(e.target.value))}>
              {(caps.resolutions.length ? caps.resolutions : [200, 300]).map((r) => <option key={r} value={r}>{r} ppp{r === 300 ? " (recomendado)" : ""}</option>)}
            </select>
          </label>
        </div>
      )}
      {source === "Feeder" && scanner?.adf === "ScannerAdfEmpty" && <p className="small-note">Coloca las hojas en el alimentador antes de escanear.</p>}
      {phase === "scanning" && <p className="small-note" role="status" aria-live="polite">Escaneando… {pages ? `${pages} página${pages > 1 ? "s" : ""} recibida${pages > 1 ? "s" : ""}` : "esperando a la impresora"}</p>}
      {phase === "uploading" && <p className="small-note" role="status" aria-live="polite">Enviando al lector de documentos…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {preview && <iframe src={preview} title="Vista previa del documento escaneado" style={{ width: "100%", height: 320, border: "1px solid #dbe3e3", borderRadius: 9, marginBottom: 12 }} />}
      <div className="actions">
        {phase === "scanning" ? (
          <Button type="button" variant="outline" size="sm" onClick={cancel}>Cancelar escaneo</Button>
        ) : (
          <Button type="button" size="sm" loading={phase === "uploading"} disabled={busy || !scanner?.online || !caps} onClick={start}>
            {phase === "failed" || file ? "Volver a escanear" : "Escanear y procesar"}
          </Button>
        )}
        {phase === "failed" && file && <Button type="button" size="sm" variant="outline" onClick={() => send(file)}>Reintentar envío</Button>}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onBack}>Volver</Button>
      </div>
    </div>
  );
}
