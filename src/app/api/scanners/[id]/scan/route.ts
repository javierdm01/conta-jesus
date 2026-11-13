import { z } from "zod";
import { currentUser, checkOrigin, AppError } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { configuredScanners, startScan } from "@/lib/escl";

export const runtime = "nodejs";

// Inicia un escaneo en segundo plano; el navegador consulta /api/scans/{id} hasta que termina.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(req);
    const u = await currentUser();
    const { id } = await params;
    const scanner = configuredScanners().find((s) => s.id === id);
    if (!scanner) throw new AppError("Escáner no configurado.", 404);
    const o = z
      .object({ source: z.enum(["Platen", "Feeder"]), color: z.enum(["RGB24", "Grayscale8"]), dpi: z.number().int().min(75).max(600) })
      .parse(await req.json());
    return Response.json({ id: startScan(scanner, o, u.id) }, { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
