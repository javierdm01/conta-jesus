import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { documentForUser } from "@/lib/document-access";
import { apiError } from "@/lib/api-error";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    const doc = await documentForUser(u, (await params).id);
    const withWords = new URL(req.url).searchParams.get("words") === "1";
    const pages = await db.document
      .findUniqueOrThrow({ where: { id: doc.id } })
      .pages({
        orderBy: { page: "asc" },
        select: {
          page: true,
          width: true,
          height: true,
          scanQuality: true,
          words: withWords,
        },
      });
    return Response.json({ pages }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
