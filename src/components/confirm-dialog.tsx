"use client";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Modal de «¿Estás seguro?» para borrados: sustituye a window.confirm (que en el móvil queda feo y se salta). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Sí, eliminar",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()} title={title} nested>
      <div className="confirm-body">
        <span className="confirm-ico" aria-hidden><AlertTriangle size={26} /></span>
        <p>{message}</p>
      </div>
      <div className="form-footer">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="button" className="bg-red-600 hover:bg-red-700" loading={busy} onClick={onConfirm}>{busy ? "Eliminando…" : confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
