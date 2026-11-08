import { currentUser, admin, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { buildAccounts, supplierDocs, supplierRanking } from "@/lib/supplier-accounts";

// Cuentas de compras. Sin supplierId: ranking de proveedores. Con él: detalle (facturas, abonos, albaranes, artículos).
// year=AAAA o all.
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    admin(u);
    const q = new URL(req.url).searchParams,
      raw = q.get("year") ?? "",
      year = /^\d{4}$/.test(raw) ? Number(raw) : null,
      supplierId = q.get("supplierId");
    if (!supplierId) return Response.json(await supplierRanking(u.companyId, year), { headers: { "Cache-Control": "no-store" } });
    const supplier = await db.supplier.findFirst({ where: { id: supplierId, companyId: u.companyId }, select: { id: true, name: true, taxId: true } });
    if (!supplier) throw new AppError("Proveedor no encontrado.", 404);
    const docs = await supplierDocs(u.companyId, supplierId);
    return Response.json(
      {
        supplier,
        ...buildAccounts(docs, year),
        // Para asociar un abono: facturas y albaranes confirmados del proveedor (de todos los años).
        linkable: docs.filter((d) => d.kind !== "CREDIT").map((d) => ({ id: d.id, kind: d.kind, number: d.number, date: d.date, net: d.net })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
