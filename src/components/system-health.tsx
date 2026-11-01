"use client";
import useSWR from "swr";
import Link from "next/link";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
type Health = {
  checkedAt: string;
  database: boolean;
  ocr: { lastSeen: string | null; recent: boolean };
  backup: {
    failedAt?: string | null;
    latest: {
      id: string;
      completedAt: string;
      integrityVerified: boolean;
    } | null;
    recent: boolean;
  };
  queue: Record<string, number>;
  oldestQueuedAt: string | null;
  failed: { id: string; originalName: string; error: string | null }[];
};
const date = (d: string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("es-ES", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Madrid",
      }).format(new Date(d))
    : "Sin registro";
export default function SystemHealth() {
  const { data, error, mutate } = useSWR<Health>(
    "/api/system",
    async (url) => {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    },
    { refreshInterval: 30000 },
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Estado del sistema</h2>
          <p>OCR, documentos pendientes y última copia de seguridad.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void mutate().catch(() => {});
          }}
        >
          <RefreshCw size={15} />
          Comprobar estado
        </Button>
      </div>
      {error && (
        <p className="error px-6" role="alert">
          No se pudo comprobar el estado: {error.message}
        </p>
      )}
      {!data && !error && (
        <p className="small-note px-6 pb-5" role="status">
          Consultando servicios…
        </p>
      )}
      {data && (
        <>
          <div className="health-grid">
            <div>
              <strong>Base de datos</strong>
              <span className="pill green">Responde</span>
              <small>Consulta: {date(data.checkedAt)}</small>
            </div>
            <div>
              <strong>Procesador OCR</strong>
              <span className={`pill ${data.ocr.recent ? "green" : "orange"}`}>
                {data.ocr.recent ? "Señal reciente" : "Sin señal reciente"}
              </span>
              <small>Última señal: {date(data.ocr.lastSeen)}</small>
            </div>
            <div>
              <strong>Copia de seguridad</strong>
              <span
                className={`pill ${!data.backup.failedAt && data.backup.recent && data.backup.latest?.integrityVerified ? "green" : "orange"}`}
              >
                {data.backup.failedAt
                  ? "Último intento fallido"
                  : data.backup.recent && data.backup.latest?.integrityVerified
                    ? "Reciente y verificada"
                    : "Revisar copia"}
              </span>
              <small>{date(data.backup.latest?.completedAt)}</small>
              {data.backup.failedAt && (
                <small role="alert">
                  Fallo: {date(data.backup.failedAt)}. Se reintentará
                  automáticamente; revisa el servicio si persiste.
                </small>
              )}
            </div>
          </div>
          <p className="small-note px-6 pb-4">
            En cola: {data.queue.QUEUED ?? 0} · Procesando:{" "}
            {data.queue.PROCESSING ?? 0} · Por revisar: {data.queue.REVIEW ?? 0}{" "}
            · Con error: {data.queue.FAILED ?? 0}
            {data.oldestQueuedAt &&
              ` · Pendiente más antiguo: ${date(data.oldestQueuedAt)}`}
          </p>
          {data.failed.length > 0 && (
            <div className="record-list">
              {data.failed.map((d) => (
                <div className="record" key={d.id}>
                  <div>
                    <strong>{d.originalName}</strong>
                    <small>{d.error || "Requiere revisión"}</small>
                  </div>
                  <Link className="text-button" href="/facturas">
                    Revisar documento
                  </Link>
                </div>
              ))}
            </div>
          )}
          <p className="small-note px-6 pb-5">
            <ShieldCheck className="inline mr-2" size={14} />
            La verificación de integridad comprueba los archivos de la copia. La
            restauración se ensaya por separado; no equivale a tener una copia
            externa.
          </p>
        </>
      )}
    </section>
  );
}
