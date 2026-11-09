import { currentUser, admin } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const u = await currentUser();
    admin(u);
    const where = { companyId: u.companyId };
    const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [all, thisMonth, byKind, rows, users] = await Promise.all([
      db.voiceLog.aggregate({ where: { ...where, kind: "OPENAI" }, _sum: { promptTokens: true, completionTokens: true, costUsd: true }, _count: true }),
      db.voiceLog.aggregate({ where: { ...where, kind: "OPENAI", createdAt: { gte: month } }, _sum: { promptTokens: true, completionTokens: true, costUsd: true }, _count: true }),
      db.voiceLog.groupBy({ by: ["kind"], where, _count: true }),
      db.voiceLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 150 }),
      db.user.findMany({ where: { companyId: u.companyId }, select: { id: true, name: true } }),
    ]);
    const names = new Map(users.map((x) => [x.id, x.name]));
    const sum = (a: typeof all) => ({ calls: a._count, promptTokens: a._sum.promptTokens ?? 0, completionTokens: a._sum.completionTokens ?? 0, costUsd: Number(a._sum.costUsd ?? 0) });
    return Response.json({
      total: sum(all),
      month: sum(thisMonth),
      byKind: Object.fromEntries(byKind.map((k) => [k.kind, k._count])),
      rows: rows.map((r) => ({ ...r, costUsd: Number(r.costUsd), user: names.get(r.userId) ?? "—" })),
    });
  } catch (e) {
    return apiError(e);
  }
}
