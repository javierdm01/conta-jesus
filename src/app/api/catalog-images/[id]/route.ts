import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { currentUser, AppError } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { documentDir } from "@/lib/document-access";

export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser(), { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new AppError("Imagen no encontrada", 404);
    const item = await db.catalogItem.findFirst({ where: { id, companyId: user.companyId }, select: { imageUrl: true } });
    if (!item) throw new AppError("Imagen no encontrada", 404);
    const hash = new URL(item.imageUrl, "http://localhost").searchParams.get("v");
    const headers = { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", ...(hash ? { ETag: `"${hash}"` } : {}) };
    if (hash && req.headers.get("if-none-match") === `"${hash}"`) return new Response(null, { status: 304, headers });
    const bytes = await readFile(path.join(documentDir(), "catalog-images", `${id}.webp`)).catch(() => { throw new AppError("Imagen no encontrada", 404); });
    return new Response(new Uint8Array(bytes), { headers });
  } catch (error) { return apiError(error); }
}
