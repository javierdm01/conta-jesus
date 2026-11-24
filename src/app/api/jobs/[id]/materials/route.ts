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
    const [moves, billed, manual, services] = await Promise.all([
      db.stockMovement.findMany({
        where: { companyId: u.companyId, jobId: id, kind: { in: ["USE", "RETURN"] } },
        include: { lot: { select: { id: true, alias: true, description: true, unit: true, reference: true, salePrice: true } } },
      }),
      db.saleLine.findMany({ where: { sale: { jobId: id, companyId: u.companyId }, OR: [{ lotId: { not: null } }, { costId: { not: null } }, { serviceId: { not: null } }] } }),
      // Material apuntado a mano (sin almacén): se factura entero una sola vez.
      db.cost.findMany({ where: { companyId: u.companyId, jobId: id, type: "Materiales", reversed: false, stockMovementId: null } }),
      db.jobService.findMany({ where: { companyId: u.companyId, jobId: id }, orderBy: { date: "asc" } }),
    ]);
    const byLot = new Map<string, { lot: (typeof moves)[number]["lot"]; qty: ReturnType<typeof dec>; cost: ReturnType<typeof dec> }>();
    for (const m of moves) {
      const sign = m.kind === "RETURN" ? -1 : 1;
      const cur = byLot.get(m.lotId) ?? { lot: m.lot, qty: dec(0), cost: dec(0) };
      cur.qty = cur.qty.plus(dec(m.quantity.toString()).mul(sign));
      cur.cost = cur.cost.plus(dec(m.amount?.toString() ?? 0).mul(sign));
      byLot.set(m.lotId, cur);
    }
    type Item = { lotId?: string; costId?: string; serviceId?: string; description: string; reference: string; unit: string; quantity: string; price: string };
    const items: Item[] = [...byLot.entries()].flatMap(([lotId, x]): Item[] => {
      const done = sum(billed.filter((b) => b.lotId === lotId).map((b) => b.quantity.toString()));
      const pending = x.qty.minus(done);
      if (pending.lte(0)) return [];
      // Precio unitario sugerido: coste medio de lo gastado + margen de la empresa.
      const suggested = x.qty.gt(0) && x.cost.gt(0) ? x.cost.div(x.qty).mul(markup) : dec(0);
      // Si ya se facturó a otro precio, ese último precio manda (salvo que coste + margen sea mayor).
      const last = x.lot.salePrice ? dec(x.lot.salePrice.toString()) : dec(0);
      const price = cents(last.gt(suggested) ? last : suggested);
      return [{
        lotId,
        description: x.lot.alias || x.lot.description,
        reference: x.lot.reference,
        unit: x.lot.unit,
        quantity: pending.toString(),
        price,
      }];
    });
    const billedCosts = new Set(billed.map((b) => b.costId));
    for (const c of manual) {
      if (billedCosts.has(c.id)) continue;
      const qty = c.quantity && dec(c.quantity.toString()).gt(0) ? dec(c.quantity.toString()) : dec(1);
      items.push({
        costId: c.id,
        description: c.description,
        reference: "",
        unit: c.unit || "ud",
        quantity: qty.toString(),
        price: cents(dec(c.amount.toString()).div(qty)), // precio puesto a mano: se factura tal cual, sin margen
      });
    }
    // Servicios sin horas: una línea con su descripción e importe, una sola vez.
    const billedServices = new Set(billed.map((b) => b.serviceId));
    for (const s of services)
      if (!billedServices.has(s.id)) items.push({ serviceId: s.id, description: s.description, reference: "", unit: "ud", quantity: "1", price: s.amount.toString() });
    return Response.json({ items },{ headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
