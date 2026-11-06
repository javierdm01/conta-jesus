import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { matchesSearch, recommendedPrice } from "@/lib/product-search";
export async function GET(req: Request) {
  try {
    const u = await currentUser(),
      q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const admin = u.role === "ADMIN";
    const lots = await db.stockLot.findMany({
      where: { companyId: u.companyId },
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
    return Response.json(
      {
        items: found
          .slice(0, 30)
          .map((l) => ({
            id: l.id,
            code: l.code,
            alias: l.alias,
            description: l.description,
            reference: l.reference,
            unit: l.unit,
            onHand: l.onHand.toString(),
            ...(admin
              ? {
                  recommendedPrice: recommendedPrice(
                    l.totalValue?.toString(),
                    l.received.toString(),
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
