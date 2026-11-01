import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser, admin } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const u = await currentUser();
    admin(u);
    const [heartbeat, queue, failed, oldest] = await Promise.all([
      db.systemHeartbeat.findUnique({ where: { service: "ocr" } }),
      db.document.groupBy({
        by: ["status"],
        where: { companyId: u.companyId },
        _count: true,
      }),
      db.document.findMany({
        where: { companyId: u.companyId, status: "FAILED" },
        select: { id: true, originalName: true, error: true },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
      db.document.findFirst({
        where: {
          companyId: u.companyId,
          status: { in: ["QUEUED", "PROCESSING"] },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    let backup: {
      id: string;
      completedAt: string;
      integrityVerified: boolean;
    } | null = null;
    try {
      const data = JSON.parse(
        await readFile(
          path.join(
            process.env.BACKUP_DIR ?? path.resolve("backups"),
            "status.json",
          ),
          "utf8",
        ),
      );
      if (
        /^\d{8}T\d{6}Z$/.test(data.id) &&
        Number.isFinite(Date.parse(data.completedAt))
      )
        backup = {
          id: data.id,
          completedAt: new Date(data.completedAt).toISOString(),
          integrityVerified: data.integrityVerified === true,
        };
    } catch {}
    let failedAt: string | null = null;
    try {
      const failure = JSON.parse(
        await readFile(
          path.join(
            process.env.BACKUP_DIR ?? path.resolve("backups"),
            "failure.json",
          ),
          "utf8",
        ),
      );
      if (
        Number.isFinite(Date.parse(failure.failedAt)) &&
        (!backup ||
          Date.parse(failure.failedAt) >= Date.parse(backup.completedAt))
      )
        failedAt = new Date(failure.failedAt).toISOString();
    } catch {}
    return Response.json(
      {
        checkedAt: new Date(),
        database: true,
        ocr: {
          lastSeen: heartbeat?.lastSeen ?? null,
          recent:
            !!heartbeat && Date.now() - heartbeat.lastSeen.getTime() < 300000,
        },
        backup: {
          latest: backup,
          failedAt,
          recent:
            !!backup &&
            Date.now() - Date.parse(backup.completedAt) < 36 * 3600000,
        },
        queue: Object.fromEntries(queue.map((g) => [g.status, g._count])),
        oldestQueuedAt: oldest?.createdAt ?? null,
        failed,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
