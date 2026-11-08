"use client";
import { useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Copy, FolderUp, Files } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { uploadDocument } from "@/lib/optimize-upload";

type Item = { file: File; state: "wait" | "up" | "ok" | "dup" | "err"; msg?: string };
const OK = /\.(pdf|jpe?g|png|webp)$/i;

// Subida de varios archivos o de una carpeta entera. El tipo (factura, abono, albarán) lo decide el servidor al leer cada documento.
export default function BulkUpload({ close, done }: { close: () => void; done: () => Promise<void> }) {
  const [items, setItems] = useState<Item[]>([]),
    [running, setRunning] = useState(false),
    [finished, setFinished] = useState(false);
  const files = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null);
  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []).filter((f) => OK.test(f.name));
    setItems(chosen.map((file) => ({ file, state: "wait" as const })));
    setFinished(false);
  };
  const set = (i: number, patch: Partial<Item>) => setItems((cur) => cur.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const run = async () => {
    setRunning(true);
    let next = 0;
    // Tres a la vez: rápido sin saturar el servidor ni el lector.
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        set(i, { state: "up" });
        try {
          await uploadDocument(items[i].file, { kind: "AUTO" });
          set(i, { state: "ok" });
        } catch (e) {
          const msg = (e as Error).message;
          set(i, /ya est[aá] registrado/i.test(msg) ? { state: "dup", msg: "Ya estaba subido" } : { state: "err", msg });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setRunning(false);
    setFinished(true);
    await done();
  };
  const count = (s: Item["state"]) => items.filter((x) => x.state === s).length;
  return (
    <Dialog open wide title="Subir varios documentos o una carpeta" onOpenChange={(v) => !v && !running && close()}>
      <p className="small-note mb-3">
        Facturas, abonos y albaranes de proveedor. Se leen solos y se clasifican por su título; después puedes archivar de golpe los que cuadren.
      </p>
      <div className="actions mb-3">
        <Button type="button" variant="outline" disabled={running} onClick={() => files.current?.click()}><Files size={16} /> Elegir archivos</Button>
        <Button type="button" variant="outline" disabled={running} onClick={() => folder.current?.click()}><FolderUp size={16} /> Elegir carpeta</Button>
        <input ref={files} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" onChange={(e) => pick(e.target.files)} />
        <input ref={folder} type="file" hidden multiple onChange={(e) => pick(e.target.files)} {...{ webkitdirectory: "", directory: "" }} />
      </div>
      {items.length > 0 && (
        <>
          <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #ececec", borderRadius: 12 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", borderTop: i ? "1px solid #f3f5f5" : 0, fontSize: 13 }}>
                <span style={{ width: 20, display: "grid", placeItems: "center" }}>
                  {it.state === "up" ? <Spinner /> : it.state === "ok" ? <CheckCircle2 size={16} color="#0f766e" /> : it.state === "dup" ? <Copy size={16} color="#b7791f" /> : it.state === "err" ? <CircleAlert size={16} color="#b42318" /> : null}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.file.name}</span>
                <small className="muted">{it.msg ?? (it.state === "ok" ? "Subido" : `${Math.max(1, Math.round(it.file.size / 1024))} KB`)}</small>
              </div>
            ))}
          </div>
          {finished && (
            <p className="small-note mt-3" role="status">
              {count("ok")} subidos{count("dup") ? ` · ${count("dup")} ya estaban` : ""}{count("err") ? ` · ${count("err")} con error` : ""}. Se están leyendo: aparecerán en «Pendientes de revisar».
            </p>
          )}
        </>
      )}
      <div className="form-footer">
        <Button type="button" variant="outline" disabled={running} onClick={close}>{finished ? "Cerrar" : "Cancelar"}</Button>
        {!finished && (
          <Button type="button" loading={running} disabled={!items.length} onClick={run}>
            {running ? `Subiendo ${count("ok") + count("dup") + count("err")}/${items.length}…` : `Subir ${items.length || ""} documentos`}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
