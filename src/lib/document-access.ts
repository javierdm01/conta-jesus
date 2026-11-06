import path from "node:path";
import { db } from "./db";
import { AppError, accessibleJob, type Actor } from "./access";

export const documentDir = () =>
  path.resolve(/* turbopackIgnore: true */ process.env.DOCUMENT_DIR ?? "data/documents");

// Misma regla que la descarga del original: el responsable ve los de su empresa;
// el técnico solo sus subidas de trabajos que le pertenecen.
export async function documentForUser(u: Actor, id: string) {
  const doc = await db.document.findFirst({ where: { id, companyId: u.companyId } });
  if (!doc) throw new AppError("Documento no encontrado.", 404);
  if (u.role !== "ADMIN") {
    if (doc.uploaderId !== u.id || !doc.jobId)
      throw new AppError("Acceso no permitido.", 403);
    await accessibleJob(u, doc.jobId);
  }
  return doc;
}
