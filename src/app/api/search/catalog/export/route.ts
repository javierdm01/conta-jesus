import { currentUser, admin } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { catalogCsv } from "@/lib/catalog-export";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
// CSV del catálogo con el último precio unitario pagado y el enlace al documento (solo el responsable).
// ?format=codes: JSON con los códigos de cada artículo (referencia y ref. del proveedor).
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    admin(u);
    if (new URL(req.url).searchParams.get("format") === "codes") {
      const items = await db.catalogItem.findMany({ where: { companyId: u.companyId }, select: { reference: true, supplierRef: true, description: true, brand: true, supplier: true }, orderBy: { description: "asc" } });
      const codes = items.filter((i) => i.reference || i.supplierRef);
      return new Response(JSON.stringify(codes, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="catalogo-codigos.json"', "Cache-Control": "no-store" },
      });
    }
    const { csv } = await catalogCsv(u.companyId, new URL(req.url).origin);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="catalogo-materiales.csv"', "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
