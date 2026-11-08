"use client";
import { uuid } from "@/lib/uuid";
import { useState } from "react";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { dec } from "@/lib/money";
import type { InventoryLot } from "@/lib/inventory-types";

export default function CountForm({
  lot,
  close,
  saved,
}: {
  lot: InventoryLot;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [counted, setCounted] = useState(lot.onHand),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestKey] = useState(() => uuid());
  const valid = /^\d+(\.\d{1,4})?$/.test(counted);
  const difference = valid ? dec(counted).minus(lot.onHand).toString() : null;
  return (
    <Dialog
      open
      title="Recuento físico"
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/operations/stock-count", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lotId: lot.id,
                expected: lot.onHand,
                lastMovementId: lot.lastMovementId,
                counted,
                reason,
                requestKey,
              }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.error);
            await saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="small-note mb-4">
          <strong>{lot.description}</strong> · {lot.code}
        </p>
        <p className="mb-4">
          Existencias registradas:{" "}
          <strong>
            {lot.onHand} {lot.unit}
          </strong>
          . Reservado: {lot.reserved} {lot.unit}.
        </p>
        <div className="form-grid">
          <label>
            Cantidad contada ({lot.unit})
            <input
              type="number"
              name="counted"
              min="0"
              max="9999999999"
              step={["ud", "rollo", "pack"].includes(lot.unit) ? "1" : "0.0001"}
              required
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="full">
            Motivo del recuento
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={2000}
              placeholder="Revisión de estantería, rotura, material localizado…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <p className="small-note mt-4" aria-live="polite">
          {difference === null
            ? "Introduce una cantidad válida."
            : dec(difference).eq(0)
              ? "Se guardará el recuento sin modificar existencias."
              : `Diferencia: ${dec(difference).gt(0) ? "+" : ""}${difference} ${lot.unit}.`}
        </p>
        <p className="small-note mt-3">
          Los faltantes reducen el stock sin imputarse a una obra. Solo puedes
          recuperar faltantes anteriores de este lote. Si falta material
          reservado, revisa primero sus reservas.
        </p>
        {error && (
          <p className="error mt-4" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </Button>
          <Button loading={busy} disabled={!valid}>
            {busy ? "Guardando…" : "Confirmar recuento"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
