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
      limit = Math.min(200, Number(url.searchParams.get("limit")) || 30),
      pageSize = Math.min(200, Number(url.searchParams.get("pageSize")) || 0),
      page = Math.max(1, Number(url.searchParams.get("page")) || 1),
      noPriceOnly = url.searchParams.get("filter") === "noprice";
    const rows = await db.catalogItem.findMany({
      where: { companyId: u.companyId },
      orderBy: [{ description: "asc" }],
    });
    const found = rows.filter((r) => (!noPriceOnly || r.price.lte(0)) && matchesSearch(q, [r.reference, r.description, r.brand, r.supplier, r.supplierRef]));
    const start = pageSize ? (page - 1) * pageSize : 0;
    return Response.json(
      {
        items: found.slice(start, start + (pageSize || limit)).map((r) => ({ ...r, price: r.price.toString() })),
        total: found.length,
        all: rows.length,
        noPrice: rows.filter((r) => r.price.lte(0)).length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
