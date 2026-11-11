import { currentUser, admin, accessibleJob } from "@/lib/access";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { dec, cents, sum } from "@/lib/money";

// Material gastado en el trabajo y todavía sin facturar, con precio de venta sugerido (coste + margen de la empresa).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    admin(u);
    const { id } = await params;
    await accessibleJob(u, id);
    const company = await db.company.findUniqueOrThrow({ where: { id: u.companyId }, select: { defaultMargin: true } });
    const markup = dec(1).plus(dec(company.defaultMargin.toString()).div(100));
    const [moves, billed] = await Promise.all([
      db.stockMovement.findMany({
        where: { companyId: u.companyId, jobId: id, kind: { in: ["USE", "RETURN"] } },
        include: { lot: { select: { id: true, alias: true, description: true, unit: true, reference: true } } },
      }),
      db.saleLine.findMany({ where: { sale: { jobId: id, companyId: u.companyId }, lotId: { not: null } } }),
    ]);
    const byLot = new Map<string, { lot: (typeof moves)[number]["lot"]; qty: ReturnType<typeof dec>; cost: ReturnType<typeof dec> }>();
    for (const m of moves) {
      const sign = m.kind === "RETURN" ? -1 : 1;
      const cur = byLot.get(m.lotId) ?? { lot: m.lot, qty: dec(0), cost: dec(0) };
      cur.qty = cur.qty.plus(dec(m.quantity.toString()).mul(sign));
      cur.cost = cur.cost.plus(dec(m.amount?.toString() ?? 0).mul(sign));
      byLot.set(m.lotId, cur);
    }
    const items = [...byLot.entries()].flatMap(([lotId, x]) => {
      const done = sum(billed.filter((b) => b.lotId === lotId).map((b) => b.quantity.toString()));
      const pending = x.qty.minus(done);
      if (pending.lte(0)) return [];
      // Precio unitario sugerido: coste medio de lo gastado + margen de la empresa.
      const price = x.qty.gt(0) && x.cost.gt(0) ? cents(x.cost.div(x.qty).mul(markup)) : "0.00";
      return [{
        lotId,
        description: x.lot.alias || x.lot.description,
        reference: x.lot.reference,
        unit: x.lot.unit,
        quantity: pending.toString(),
        price,
      }];
    });
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
