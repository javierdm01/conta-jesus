import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { cents, dec } from "@/lib/money";
import { matchesSearch, recommendedPrice } from "@/lib/product-search";
export async function GET(req: Request) {
  try {
    const u = await currentUser(),
      q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const admin = u.role === "ADMIN";
    const lots = await db.stockLot.findMany({
      where: { companyId: u.companyId, archivedAt: null },
      select: {
        id: true,
        code: true,
        alias: true,
        description: true,
        reference: true,
        brand: true,
        model: true,
        family: true,
        location: true,
        notes: true,
        unit: true,
        onHand: true,
        received: true,
        totalValue: true,
        salePrice: true,
        imageUrl: true,
        document: {
          select: { number: true, supplier: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const found = lots.filter((l) =>
      matchesSearch(q, [
        l.alias,
        l.description,
        l.reference,
        l.code,
        l.brand,
        l.model,
        l.family,
        l.location,
        l.notes,
        ...(admin ? [l.document?.supplier?.name, l.document?.number] : []),
      ]),
    );
    const shown = found.slice(0, 30);
    // Sin foto propia, se usa la del catálogo con la misma referencia.
    const refs = [...new Set(shown.filter((l) => !l.imageUrl && l.reference).map((l) => l.reference))];
    const catalogImages = new Map<string, string>();
    if (refs.length)
      for (const c of await db.catalogItem.findMany({
        where: { companyId: u.companyId, imageUrl: { not: "" }, OR: [{ reference: { in: refs } }, { supplierRef: { in: refs } }] },
        select: { reference: true, supplierRef: true, imageUrl: true },
      }))
        for (const r of [c.reference, c.supplierRef]) if (r && !catalogImages.has(r)) catalogImages.set(r, c.imageUrl);
    return Response.json(
      {
        items: shown
          .map((l) => ({
            imageUrl: l.imageUrl || catalogImages.get(l.reference) || "",
            ownImage: !!l.imageUrl,
            id: l.id,
            code: l.code,
            alias: l.alias,
            description: l.description,
            reference: l.reference,
            unit: l.unit,
            onHand: l.onHand.toString(),
            brand: l.brand,
            model: l.model,
            location: l.location,
            ...(admin
              ? {
                  unitCost:
                    l.totalValue != null && l.received.gt(0)
                      ? cents(dec(l.totalValue.toString()).div(l.received.toString()))
                      : null,
                  recommendedPrice: recommendedPrice(
                    l.totalValue?.toString(),
                    l.received.toString(),
                    l.salePrice?.toString(),
                  ),
                }
              : {}),
          })),
        total: found.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
