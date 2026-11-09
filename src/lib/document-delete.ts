import { unlink } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, accessibleJob, type Actor } from "./access";
import { documentDir } from "./document-access";
import * as v from "./validation";

export type DeleteFacts = {
  status: string;
  kind: string;
  confirmedAt: Date | null;
  lockedUntil: Date | null;
  lines: number;
  costs: number;
  stockLots: number;
  valuedLots: number;
  replacedBy: boolean;
  saleAttachments?: number;
};

// Motivo por el que un documento no puede eliminarse, o null si puede.
export function deleteBlocker(f: DeleteFacts, now = new Date()): string | null {
  if (f.status === "PROCESSING" && f.lockedUntil && f.lockedUntil > now)
    return "Se está leyendo ahora mismo. Espera a que termine e inténtalo de nuevo.";
  if (f.status === "CONFIRMED" || f.confirmedAt)
    return "Ya está confirmado y forma parte de la contabilidad o del almacén; no puede eliminarse.";
  const used = [
    f.lines && `${f.lines} línea(s) de documento`,
    f.costs && `${f.costs} coste(s)`,
    (f.stockLots || f.valuedLots) && `${f.stockLots + f.valuedLots} lote(s) de material`,
    f.replacedBy && "otro documento que lo sustituye",
    f.saleAttachments && `${f.saleAttachments} factura(s) con este documento adjunto`,
  ].filter(Boolean);
  return used.length ? `Tiene datos asociados: ${used.join(", ")}.` : null;
}

const input = z.object({ ids: z.array(v.id).min(1).max(50) });
const counts = { select: { lines: true, costs: true, stockLots: true, valuedLots: true, saleAttachments: true } } as const;
const factsOf = (d: {
  status: string; kind: string; confirmedAt: Date | null; lockedUntil: Date | null;
  replacedBy: { id: string } | null;
  _count: { lines: number; costs: number; stockLots: number; valuedLots: number; saleAttachments: number };
}): DeleteFacts => ({ ...d, ...d._count, replacedBy: !!d.replacedBy });

async function removeFile(relative: string) {
  const dir = documentDir(), file = path.join(dir, relative);
  if (!file.startsWith(dir + path.sep)) return;
  try {
    await unlink(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      console.error(`No se pudo borrar ${relative}:`, e);
  }
}

export async function deleteDocuments(u: Actor, raw: unknown) {
  const ids = [...new Set(input.parse(raw).ids)];
  const docs = await db.document.findMany({
    where: { id: { in: ids }, companyId: u.companyId },
    select: { id: true, uploaderId: true, jobId: true },
  });
  if (docs.length !== ids.length) throw new AppError("Documento no encontrado.", 404);
  if (u.role !== "ADMIN")
    for (const d of docs) {
      if (d.uploaderId !== u.id || !d.jobId) throw new AppError("Acceso no permitido.", 403);
      await accessibleJob(u, d.jobId);
    }
  const deleted: { id: string; files: string[] }[] = [];
  const blocked: { id: string; reason: string; status: number }[] = [];
  try {
    await db.$transaction(
      async (tx) => {
        for (const id of ids) {
          const d = await tx.document.findFirst({
            where: { id, companyId: u.companyId },
            include: { pages: { select: { scanFilename: true } }, replacedBy: { select: { id: true } }, _count: counts },
          });
          if (!d) {
            blocked.push({ id, reason: "Ya se había eliminado.", status: 404 });
            continue;
          }
          const reason = deleteBlocker(factsOf(d));
          if (reason) {
            blocked.push({ id, reason, status: 409 });
            continue;
          }
          await tx.document.delete({ where: { id } });
          await tx.audit.create({
            data: { companyId: u.companyId, userId: u.id, action: "Eliminar documento", entityId: id },
          });
          deleted.push({ id, files: [d.filename, ...d.pages.map((p) => p.scanFilename)] });
        }
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034")
      throw new AppError("El documento cambió mientras se eliminaba; inténtalo de nuevo.", 409);
    throw e;
  }
  if (ids.length === 1 && blocked[0]) throw new AppError(blocked[0].reason, blocked[0].status);
  // Los archivos se borran tras confirmar la transacción: un fallo aquí no revierte la baja.
  for (const d of deleted) for (const f of d.files) await removeFile(f);
  return { deleted: deleted.map((d) => d.id), blocked: blocked.map(({ id, reason }) => ({ id, reason })) };
}
