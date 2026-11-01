import { currentUser, admin, AppError } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import {
  parsePeriod,
  quarterReport,
  quarterCsvs,
  quarterZip,
  verifyQuarterFiles,
} from "@/lib/quarters";
import { zipStream } from "@/lib/zip";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    admin(u);
    const q = new URL(req.url).searchParams;
    let period;
    try {
      period = parsePeriod(q.get("year"), q.get("quarter"));
    } catch {
      throw new AppError("Elige un año y trimestre válidos.");
    }
    const report = await quarterReport(u.companyId, period);
    const format = q.get("format"),
      base = `trimestre-${period.year}-T${period.quarter}`;
    if (format === "zip" || format === "check") {
      const entries = await quarterZip(u.companyId, report);
      const files = await verifyQuarterFiles(entries);
      if (format === "check")
        return Response.json(
          { files, ready: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      await db.audit.create({
        data: {
          companyId: u.companyId,
          userId: u.id,
          action: `Preparar paquete ${period.year} T${period.quarter} · ${files} archivos`,
          entityId: `${period.year}-T${period.quarter}`,
        },
      });
      return new Response(zipStream(entries), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${base}.zip"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (format === "csv")
      return new Response(quarterCsvs(report)["resumen.csv"], {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
