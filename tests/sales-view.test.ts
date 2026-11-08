import test from "node:test";
import assert from "node:assert/strict";
import { collections, monthlyNet, saleStatus, saleTotal, topN } from "../src/lib/sales-view";
import type { Sale } from "../src/lib/workspace-types";

const sale = (o: Partial<Sale>): Sale => ({ id: "x", jobId: "j", number: "F-1", description: "", date: "2026-03-10", net: "100", tax: "21", withholding: "0", collected: "0", ...o });

test("total y estado de cobro", () => {
  assert.equal(saleTotal(sale({ withholding: "15" })).toString(), "106");
  assert.equal(saleStatus(sale({ collected: "121" }), "2026-11-01"), "Cobrada");
  assert.equal(saleStatus(sale({ dueAt: "2026-10-01" }), "2026-11-01"), "Vencida");
  assert.equal(saleStatus(sale({ dueAt: "2026-12-01" }), "2026-11-01"), "Pendiente");
  assert.equal(saleStatus(sale({}), "2026-11-01"), "Pendiente");
});

test("facturación mensual y ranking", () => {
  const sales = [sale({ date: "2026-01-05", net: "50" }), sale({ date: "2026-01-20", net: "70" }), sale({ date: "2025-01-20", net: "9" })];
  assert.equal(monthlyNet(sales, 2026)[0], 120);
  assert.equal(monthlyNet(sales, 2026)[1], 0);
  const top = topN(["a", "b", "c", "a"], (x) => x, () => 1, 1);
  assert.deepEqual(top, [{ name: "a", total: 2 }, { name: "Resto", total: 2 }]);
});

test("reparto de cobros pendientes", () => {
  const r = collections(
    [sale({ dueAt: "2026-10-01" }), sale({ dueAt: "2026-11-10" }), sale({ dueAt: "2027-02-01" }), sale({ collected: "121" })],
    "2026-11-01",
  );
  assert.equal(r.pending.n, 3);
  assert.equal(r.overdue.n, 1);
  assert.equal(r.soon.n, 1);
  assert.equal(r.later.n, 1);
  assert.equal(Math.round(r.pending.amount), 363);
});
