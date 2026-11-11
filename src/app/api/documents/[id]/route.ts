import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/access";
import { documentDir, documentForUser } from "@/lib/document-access";
import { apiError } from "@/lib/api-error";

// El original del documento. Con ?inline=1 se abre en el navegador (para verlo); sin él, se descarga.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    const doc = await documentForUser(u, (await params).id);
    const bytes = await readFile(/* turbopackIgnore: true */ path.join(documentDir(), doc.filename));
    const inline = new URL(req.url).searchParams.has("inline") && /^(application\/pdf|image\/(jpeg|png|webp))$/.test(doc.mime);
    return new Response(bytes, {
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="documento.${doc.filename.split(".").pop()}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
