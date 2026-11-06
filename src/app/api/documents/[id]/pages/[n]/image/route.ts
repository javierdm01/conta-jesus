import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { documentDir, documentForUser } from "@/lib/document-access";
import { apiError } from "@/lib/api-error";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  try {
    const u = await currentUser();
    const { id, n } = await params;
    const doc = await documentForUser(u, id);
    const page = await db.documentPage.findUnique({
      where: { documentId_page: { documentId: doc.id, page: Number(n) || 0 } },
    });
    if (!page) throw new AppError("Página no disponible.", 404);
    // scanFilename lo escribe el worker; aun así se confina a la carpeta de documentos.
    const file = path.join(documentDir(), page.scanFilename);
    if (!file.startsWith(documentDir() + path.sep))
      throw new AppError("Página no disponible.", 404);
    let bytes: Buffer;
    try {
      bytes = await readFile(/* turbopackIgnore: true */ file);
    } catch {
      throw new AppError("La imagen de esta página ya no está en el servidor.", 404);
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
