import { currentUser, admin, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { buildRows, loadExportLines } from "@/lib/catalog-export";

// Dónde aparece un artículo del catálogo: líneas de facturas y albaranes de proveedor, con el precio de cada compra.
// Es la misma asociación que usa el CSV (referencias releídas de cada documento, código de proveedor y de fabricante). Solo el responsable.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    admin(u);
    const { id } = await params;
    const [items, lines] = await Promise.all([db.catalogItem.findMany({ where: { companyId: u.companyId } }), loadExportLines(u.companyId)]);
    const index = items.findIndex((i) => i.id === id);
    if (index < 0) throw new AppError("Artículo no encontrado.", 404);
    // La asociación por descripción compite entre artículos, por eso se calcula con todo el catálogo.
    const row = buildRows(items.map((i) => ({ reference: i.reference, supplierRef: i.supplierRef, description: i.description, brand: i.brand, unit: i.unit, supplier: i.supplier, price: Number(i.price) })), lines)[index];
    return Response.json(
      {
        how: row.how,
        uses: row.documents.map((l) => ({
          id: l.id ?? `${l.documentId}-${l.description}`,
          documentId: l.documentId,
          kind: l.kind,
          number: l.number,
          date: l.date,
          supplier: l.supplier,
          job: l.job ?? null,
          quantity: String(l.quantity),
          unit: l.unit,
          price: l.price === null ? null : String(l.price),
          discount: String(l.discount),
          net: l.net === null ? null : String(l.net),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
