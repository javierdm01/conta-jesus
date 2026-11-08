import { currentUser, admin } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { matchesSearch } from "@/lib/product-search";

// Base de conocimiento de materiales (presupuestos). Solo el responsable.
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    admin(u);
    const url = new URL(req.url),
      q = url.searchParams.get("q")?.trim().slice(0, 100) ?? "",
      limit = Math.min(200, Number(url.searchParams.get("limit")) || 30);
    const rows = await db.catalogItem.findMany({
      where: { companyId: u.companyId },
      orderBy: [{ description: "asc" }],
    });
    const found = rows.filter((r) => matchesSearch(q, [r.reference, r.description, r.brand, r.supplier, r.supplierRef]));
    return Response.json(
      {
        items: found.slice(0, limit).map((r) => ({ ...r, price: r.price.toString() })),
        total: found.length,
        all: rows.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
