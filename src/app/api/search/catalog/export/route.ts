import { currentUser, admin } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { catalogCsv } from "@/lib/catalog-export";

export const dynamic = "force-dynamic";
// CSV del catálogo con el último precio unitario pagado y el enlace al documento (solo el responsable).
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    admin(u);
    const { csv } = await catalogCsv(u.companyId, new URL(req.url).origin);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="catalogo-materiales.csv"', "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
