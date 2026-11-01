"use client";
import { useState, useEffect } from "react";
import {
  Printer,
  ArrowLeft,
  Tag,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  printerProfiles,
  printerSettings,
  type PrinterProfile,
} from "@/lib/label-profiles";
type Label = {
  code: string;
  description: string;
  reference: string;
  location: string;
  brand: string;
  model: string;
  received: string;
  unit: string;
  supplier: string;
  document: string;
  count: number;
  qr: string;
  barcode: string;
};
export default function LabelPreview({ labels }: { labels: Label[] }) {
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]),
    [profileName, setProfileName] = useState(""),
    [profileId, setProfileId] = useState(""),
    [profileNotice, setProfileNotice] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(labels.map((l) => [l.code, l.count])),
  );
  const [settings, setSettings] = useState({
      width: 62,
      height: 40,
      format: "roll",
      code: "qr",
      margin: 0,
      gap: 0,
    }),
    [showLocation, setShowLocation] = useState(true),
    [showSupplier, setShowSupplier] = useState(true);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("instala-label-printer-v1") ?? "null",
      );
      const valid = printerSettings(stored);
      if (valid) setSettings(valid);
      setProfiles(
        printerProfiles(
          JSON.parse(
            localStorage.getItem("instala-label-profiles-v1") ?? "null",
          ),
        ),
      );
    } catch {}
  }, []);
  const total = labels.reduce((a, l) => a + (counts[l.code] ?? 0), 0),
    width = Math.min(105, Math.max(25, Number(settings.width) || 62)),
    height = Math.min(150, Math.max(20, Number(settings.height) || 40)),
    margin = Math.max(0, Math.min(20, Number(settings.margin) || 0)),
    gap = Math.max(0, Math.min(10, Number(settings.gap) || 0)),
    columns =
      settings.format === "roll"
        ? 1
        : Math.max(1, Math.floor((210 - margin * 2 + gap) / (width + gap)));
  const rows = labels.flatMap((l) =>
    Array.from(
      { length: Math.max(0, Math.min(500, counts[l.code] || 0)) },
      (_, i) => ({
        ...l,
        key: `${l.code}-${i}`,
      }),
    ),
  );
  return (
    <main className="label-workspace">
      <aside className="label-controls no-print">
        <a href="/inventario" className="text-button inline-flex gap-2 mb-7">
          <ArrowLeft size={16} />
          Volver al almacén
        </a>
        <div className="eyebrow">PREPARADO PARA TU IMPRESORA</div>
        <h1 className="mt-3 mb-2">Tus etiquetas.</h1>
        <p className="small-note mb-6">
          {total} etiquetas · {labels.length} lotes. Cada copia conserva el
          identificador del artículo.
        </p>
        <div className="label-copy-counts">
          <strong>Copias por artículo</strong>
          {labels.map((l) => (
            <label key={l.code}>
              {l.description}
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                aria-label={`Copias de ${l.description}`}
                value={counts[l.code]}
                onChange={(e) =>
                  setCounts({ ...counts, [l.code]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
        <div className="label-copy-counts label-profile-controls">
          <strong>Perfiles de impresora</strong>
          <label>
            Perfil guardado
            <select
              value={profileId}
              onChange={(e) => {
                const p = profiles.find((x) => x.id === e.target.value);
                setProfileId(p?.id ?? "");
                setProfileName(p?.name ?? "");
                if (p) {
                  setSettings(p.settings);
                  setShowLocation(p.showLocation);
                  setShowSupplier(p.showSupplier);
                  setProfileNotice(
                    "Perfil aplicado. Comprueba una etiqueta en la impresora.",
                  );
                }
              }}
            >
              <option value="">Medidas personalizadas</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nombre del perfil
            <input
              type="text"
              maxLength={60}
              value={profileName}
              placeholder="Rollo almacén 62 × 40"
              onChange={(e) => setProfileName(e.target.value)}
            />
          </label>
          <div className="actions mt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={!profileName.trim() || !printerSettings(settings)}
              onClick={() => {
                const name = profileName.trim();
                const existing = profiles.find(
                  (p) =>
                    p.name.toLocaleLowerCase("es") ===
                    name.toLocaleLowerCase("es"),
                );
                if (!existing && profiles.length >= 12) {
                  setProfileNotice(
                    "Puedes guardar hasta 12 perfiles por navegador.",
                  );
                  return;
                }
                const profile = {
                  id: existing?.id ?? crypto.randomUUID(),
                  name,
                  settings: { ...settings },
                  showLocation,
                  showSupplier,
                };
                const next = [
                  ...profiles.filter((p) => p.id !== profile.id),
                  profile,
                ];
                try {
                  localStorage.setItem(
                    "instala-label-profiles-v1",
                    JSON.stringify({ version: 1, profiles: next }),
                  );
                  setProfiles(next);
                  setProfileId(profile.id);
                  setProfileNotice("Perfil guardado en este navegador.");
                } catch {
                  setProfileNotice(
                    "No se pudo guardar el perfil en este navegador.",
                  );
                }
              }}
            >
              Guardar perfil
            </Button>
            {profileId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = profiles.filter((p) => p.id !== profileId);
                  try {
                    localStorage.setItem(
                      "instala-label-profiles-v1",
                      JSON.stringify({ version: 1, profiles: next }),
                    );
                    setProfiles(next);
                    setProfileId("");
                    setProfileName("");
                    setProfileNotice(
                      "Perfil eliminado. Las medidas actuales se conservan.",
                    );
                  } catch {
                    setProfileNotice("No se pudo eliminar el perfil.");
                  }
                }}
              >
                Eliminar perfil
              </Button>
            )}
          </div>
          {profileNotice && (
            <p className="small-note mt-3" role="status">
              {profileNotice}
            </p>
          )}
        </div>
        {total > 500 && (
          <p className="error">Máximo 500 etiquetas por tanda.</p>
        )}
        <label>
          Tipo de impresión
          <select
            value={settings.format}
            onChange={(e) =>
              setSettings({
                ...settings,
                format: e.target.value,
                margin: e.target.value === "roll" ? 0 : 7,
                gap: e.target.value === "roll" ? 0 : 2.5,
              })
            }
          >
            <option value="roll">Impresora de etiquetas en rollo</option>
            <option value="a4">Hoja A4 de etiquetas</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            Ancho (mm)
            <input
              type="number"
              min="25"
              max="105"
              step="0.1"
              value={settings.width}
              onChange={(e) =>
                setSettings({ ...settings, width: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Alto (mm)
            <input
              type="number"
              min="20"
              max="150"
              step="0.1"
              value={settings.height}
              onChange={(e) =>
                setSettings({ ...settings, height: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label>
          Código de la etiqueta
          <select
            value={settings.code}
            onChange={(e) => setSettings({ ...settings, code: e.target.value })}
          >
            <option value="qr">QR · abre la ficha con el móvil</option>
            <option value="barcode">Código de barras · Code 128</option>
            <option value="both">QR y código de barras</option>
          </select>
        </label>
        {settings.format === "a4" && (
          <div className="form-grid">
            <label>
              Margen de hoja (mm)
              <input
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={settings.margin}
                onChange={(e) =>
                  setSettings({ ...settings, margin: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Separación (mm)
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={settings.gap}
                onChange={(e) =>
                  setSettings({ ...settings, gap: Number(e.target.value) })
                }
              />
            </label>
          </div>
        )}
        <label className="label-checkbox">
          <input
            type="checkbox"
            checked={showLocation}
            onChange={(e) => setShowLocation(e.target.checked)}
          />
          Mostrar ubicación
        </label>
        <label className="label-checkbox">
          <input
            type="checkbox"
            checked={showSupplier}
            onChange={(e) => setShowSupplier(e.target.checked)}
          />
          Mostrar proveedor y albarán
        </label>
        <div className="label-printer-tip">
          <SlidersHorizontal size={19} />
          <p>
            En el diálogo de impresión, elige tu impresora y el tamaño del
            rollo. Usa escala <strong>100 %</strong> y desactiva cabeceras y
            pies. Las medidas iniciales son ajustables; comprueba una etiqueta
            antes de lanzar la tanda.
          </p>
        </div>
        <Button
          className="w-full"
          disabled={
            total < 1 ||
            total > 500 ||
            Object.values(counts).some((c) => !Number.isInteger(c) || c < 1)
          }
          onClick={() => {
            try {
              localStorage.setItem(
                "instala-label-printer-v1",
                JSON.stringify(settings),
              );
            } catch {}
            window.print();
          }}
        >
          <Printer size={17} />
          Imprimir {total} etiquetas
        </Button>
        <p className="small-note mt-4">
          Se recordará el tamaño en este navegador. La impresión usa el
          controlador de tu impresora; no descuenta existencias.
        </p>
      </aside>
      <section className="label-preview-area">
        <header className="label-preview-heading no-print">
          <div>
            <Tag size={20} />
            <strong>Vista previa de impresión</strong>
          </div>
          <span>
            {width} × {height} mm ·{" "}
            {settings.format === "roll"
              ? "una etiqueta por página"
              : `${columns} columnas`}
          </span>
        </header>
        <div
          className={`label-sheet ${settings.format}`}
          style={{
            gridTemplateColumns: `repeat(${columns},${width}mm)`,
            gap: `${gap}mm`,
            padding: settings.format === "a4" ? `${margin}mm` : 0,
          }}
        >
          {rows.map((l) => (
            <article
              data-testid="printed-label"
              className={`printed-label code-${settings.code}`}
              key={l.key}
              style={{ width: `${width}mm`, height: `${height}mm` }}
            >
              <div className="printed-label-main">
                {settings.code !== "barcode" && (
                  <div
                    className="printed-qr"
                    aria-label={`QR ${l.code}`}
                    dangerouslySetInnerHTML={{ __html: l.qr }}
                  />
                )}
                <div className="printed-label-info">
                  <strong className="printed-description">
                    {l.description}
                  </strong>
                  {l.reference && <span>Ref. {l.reference}</span>}
                  {(l.brand || l.model) && (
                    <span>{[l.brand, l.model].filter(Boolean).join(" ")}</span>
                  )}
                  {showLocation && l.location && <b>{l.location}</b>}
                  {showSupplier && (l.supplier || l.document) && (
                    <small>
                      {l.supplier}
                      {l.document && ` · ${l.document}`}
                    </small>
                  )}
                  <small>
                    Recibido:{" "}
                    {new Intl.NumberFormat("es-ES", {
                      maximumFractionDigits: 4,
                    }).format(Number(l.received))}{" "}
                    {l.unit}
                  </small>
                </div>
              </div>
              {settings.code !== "qr" && (
                <div
                  className="printed-barcode"
                  aria-label={`Código de barras ${l.code}`}
                  dangerouslySetInnerHTML={{ __html: l.barcode }}
                />
              )}
              <div className="printed-code">{l.code}</div>
            </article>
          ))}
        </div>
      </section>
      <style>{`@media print { @page { size: ${settings.format === "roll" ? `${width}mm ${height}mm` : "A4"}; margin: 0; } .label-sheet.roll .printed-label { break-after: page; } .label-sheet.a4 { padding: ${margin}mm !important; gap: ${gap}mm !important; } }`}</style>
    </main>
  );
}
