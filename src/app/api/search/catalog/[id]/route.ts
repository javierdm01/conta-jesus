import { currentUser, admin, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";

// Dónde aparece un artículo del catálogo: líneas de albaranes y facturas de proveedor con su referencia
// (de fabricante o del proveedor), con el precio de cada compra. Solo el responsable.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    admin(u);
    const { id } = await params;
    const item = await db.catalogItem.findFirst({ where: { id, companyId: u.companyId } });
    if (!item) throw new AppError("Artículo no encontrado.", 404);
    const refs = [item.reference, item.supplierRef].filter(Boolean);
    // Muchas líneas leídas de PDF no traen referencia: también se busca por el principio del nombre.
    const name = item.description.trim().slice(0, 25);
    const or = [
      ...refs.map((r) => ({ reference: { equals: r, mode: "insensitive" as const } })),
      ...(name.length >= 12 ? [{ description: { contains: name, mode: "insensitive" as const } }] : []),
    ];
    const lines = or.length
      ? await db.documentLine.findMany({
          where: { OR: or, document: { companyId: u.companyId, kind: { in: ["PURCHASE", "DELIVERY", "CREDIT"] } } },
          include: { document: { select: { id: true, kind: true, number: true, date: true, supplier: { select: { name: true } }, job: { select: { id: true, name: true } } } } },
          orderBy: { document: { date: "desc" } },
          take: 100,
        })
      : [];
    return Response.json(
      {
        uses: lines.map((l) => ({
          id: l.id,
          documentId: l.document.id,
          kind: l.document.kind,
          number: l.document.number,
          date: l.document.date,
          supplier: l.document.supplier?.name ?? "",
          job: l.document.job,
          quantity: l.quantity.toString(),
          unit: l.unit,
          price: l.price?.toString() ?? null,
          discount: l.discount.toString(),
          net: l.net?.toString() ?? null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
