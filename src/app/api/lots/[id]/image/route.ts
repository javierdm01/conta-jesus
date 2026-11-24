import sharp from "sharp";
import { admin, checkOrigin, currentUser, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { uploadImage } from "@/lib/cloudinary";

export const runtime = "nodejs";
// Foto propia de un artículo del almacén: se reduce, se sube a Cloudinary y queda guardada en el lote.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(req);
    const u = await currentUser();
    admin(u);
    const { id } = await params;
    const lot = await db.stockLot.findFirst({ where: { id, companyId: u.companyId }, select: { id: true } });
    if (!lot) throw new AppError("Artículo no encontrado.", 404);
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/")) throw new AppError("Elige una imagen.");
    if (file.size > 15_000_000) throw new AppError("La imagen es demasiado grande (máx. 15 MB).", 413);
    const bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 80_000_000 })
      .rotate()
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
      .catch(() => { throw new AppError("No se pudo leer la imagen."); });
    const imageUrl = await uploadImage(bytes);
    await db.stockLot.update({ where: { id: lot.id }, data: { imageUrl } });
    return Response.json({ imageUrl });
  } catch (e) {
    return apiError(e);
  }
}
