import { currentUser, admin } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { matchesSearch } from "@/lib/product-search";
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    admin(u);
    const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 100);
    if (!q || q.length < 2) return Response.json([]);
    const rows = await db.document.findMany({
      where: { companyId: u.companyId },
      select: {
        id: true,
        originalName: true,
        number: true,
        status: true,
        text: true,
        lines: { select: { reference: true, description: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const matches = rows
      .filter((d) =>
        matchesSearch(q, [
          d.originalName,
          d.number,
          d.text,
          d.supplier?.name,
          ...d.lines.flatMap((l) => [l.reference, l.description]),
        ]),
      )
      .slice(0, 15);
    return Response.json(
      matches.map(({ id, originalName, number, status }) => ({
        id,
        originalName,
        number,
        status,
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
