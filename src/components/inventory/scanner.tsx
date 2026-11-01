"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
export default function Scanner({
  onResult,
}: {
  onResult: (value: string) => void;
}) {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw Error(
            "La cámara necesita HTTPS y permiso del navegador. Puedes introducir el código o usar un lector USB.",
          );
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (disposed) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current!,
          (result) => {
            if (result && !disposed) {
              disposed = true;
              onResult(result.getText());
              stop?.();
            }
          },
        );
        stop = () => controls.stop();
        if (disposed) controls.stop();
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    }
    start();
    return () => {
      disposed = true;
      stop?.();
    };
  }, [onResult]);
  return (
    <div>
      <video ref={video} className="scanner-video" muted playsInline />
      <p className="small-note my-3">
        Apunta al QR o al código de barras de la etiqueta.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onResult(value);
        }}
      >
        <label>
          Código o enlace de la etiqueta
          <input
            autoComplete="off"
            autoFocus
            placeholder="LT-…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
        <Button type="submit" className="w-full">
          Abrir ficha
        </Button>
      </form>
    </div>
  );
}
