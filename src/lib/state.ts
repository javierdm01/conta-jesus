import { db } from "./db";
import { type Actor } from "./access";
import { cents, dec, profitability, sum } from "./money";
const stockSelect = {
  select: {
    id: true,
    code: true,
    description: true,
    reference: true,
    unit: true,
    received: true,
    invoiceDocumentId: true,
  },
} as const;
export async function getState(u: Actor) {
  const companyId = u.companyId,
    isAdmin = u.role === "ADMIN";
  if (!isAdmin) {
    const [company, jobs, documents] = await Promise.all([
      db.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true },
      }),
      db.job.findMany({
        where: { companyId, workerId: u.worker?.id ?? "none" },
        select: {
          id: true,
          name: true,
          number: true,
          address: true,
          service: true,
          status: true,
          plannedAt: true,
          customer: { select: { name: true, phone: true } },
          worker: { select: { name: true } },
          hours: {
            where: { workerId: u.worker?.id ?? "none" },
            select: {
              id: true,
              hours: true,
              date: true,
              activity: true,
              notes: true,
              billable: true,
            },
          },
        },
        orderBy: { openedAt: "desc" },
      }),
      db.document.findMany({
        where: {
          companyId,
          uploaderId: u.id,
          job: { workerId: u.worker?.id ?? "none" },
        },
        select: {
          id: true,
          originalName: true,
          status: true,
          kind: true,
          createdAt: true,
          error: true,
          jobId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);
    return {
      user: { id: u.id, name: u.name, role: u.role, workerId: u.worker?.id },
      company,
      jobs: jobs.map((j) => ({ ...j, costs: [], quotes: [], sales: [] })),
      documents,
      customers: [],
      suppliers: [],
      workers: u.worker ? [{ id: u.worker.id, name: u.worker.name }] : [],
      sales: [],
      overheads: [],
      audits: [],
    };
  }
  const [
    company,
    jobs,
    documents,
    customers,
    suppliers,
    workers,
    overheads,
    audits,
    users,
  ] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    db.job.findMany({
      where: { companyId },
      include: {
        customer: true,
        worker: true,
        costs: { where: { reversed: false } },
        hours: { include: { worker: { select: { id: true, name: true } } } },
        sales: { include: { lines: true } },
        quotes: { orderBy: { createdAt: "desc" } },
        stockMovements: {
          where: { kind: "USE", amount: null },
          select: { quantity: true, returns: { select: { quantity: true } } },
        },
      },
      orderBy: { openedAt: "desc" },
    }),
    db.document.findMany({
      where: { companyId },
      omit: { text: true, suggestion: true },
      include: {
        supplier: { select: { id: true, name: true } },
        replacedBy: { select: { id: true } },
        stockLots: stockSelect,
        valuedLots: {
          distinct: ["documentId"],
          select: { document: { select: { id: true, number: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.customer.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    db.worker.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    db.overhead.findMany({ where: { companyId }, orderBy: { date: "desc" } }),
    db.audit.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.user.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        worker: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const result = jobs.map((j) => {
    const hours = sum(j.hours.map((h) => h.hours.toString())),
      labor = sum(
        j.hours.map((h) =>
          dec(h.hours.toString())
            .mul(h.hourlyCost.toString())
            .toDecimalPlaces(2),
        ),
      ),
      direct = sum(
        j.costs
          .filter((c) => c.type !== "Gastos generales asignados")
          .map((c) => c.amount.toString()),
      ).plus(labor),
      overhead = sum(
        j.costs
          .filter((c) => c.type === "Gastos generales asignados")
          .map((c) => c.amount.toString()),
      ),
      net = sum(j.sales.map((s) => s.net.toString()));
    const { stockMovements, ...job } = j;
    return {
      ...job,
      pendingStockCosts: stockMovements.filter((m) =>
        dec(m.quantity.toString()).gt(
          sum(m.returns.map((r) => r.quantity.toString())),
        ),
      ).length,
      metrics: {
        ...profitability(net, direct, overhead, hours),
        hours: hours.toFixed(2),
        labor: cents(labor),
        collected: cents(sum(j.sales.map((s) => s.collected.toString()))),
        pending: cents(
          sum(
            j.sales.map((s) =>
              dec(s.net.toString())
                .plus(s.tax.toString())
                .minus(s.withholding.toString())
                .minus(s.collected.toString()),
            ),
          ),
        ),
      },
    };
  });
  return {
    user: { id: u.id, name: u.name, role: u.role },
    company,
    jobs: result,
    documents,
    customers,
    suppliers,
    workers,
    sales: jobs.flatMap((j) => j.sales.map((s) => ({ ...s, jobName: j.name }))),
    overheads,
    audits,
    users: users.map(({ worker, ...x }) => ({ ...x, workerId: worker?.id })),
  };
}
