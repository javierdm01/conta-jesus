import test from "node:test";
import assert from "node:assert/strict";
import { buildAccounts, type AcctDoc } from "../src/lib/supplier-accounts";

const doc = (o: Partial<AcctDoc>): AcctDoc => ({ id: "x", kind: "PURCHASE", number: "F1", date: "2026-01-10", net: 100, tax: 21, lines: [], linked: [], pending: false, ...o });

test("las facturas suman, los abonos restan y todo sale por mes", () => {
  const a = buildAccounts(
    [
      doc({ id: "1", number: "F1", date: "2026-01-10", net: 1000, tax: 210 }),
      doc({ id: "2", number: "F2", date: "2026-02-05", net: 500, tax: 105 }),
      doc({ id: "3", kind: "CREDIT", number: "A1", date: "2026-02-20", net: 100, tax: 21, linked: ["F1"] }),
      doc({ id: "4", number: "F0", date: "2025-12-01", net: 9999, tax: 0 }), // otro año
    ],
    2026,
  );
  assert.equal(a.totals.invoicedNet, 1500);
  assert.equal(a.totals.creditNet, 100);
  assert.equal(a.totals.netPurchases, 1400);
  assert.equal(a.totals.netTax, 294);
  assert.equal(a.totals.netTotal, 1694);
  assert.equal(a.totals.creditPct, 6.67);
  assert.equal(a.totals.invoiceCount, 2);
  assert.equal(a.totals.biggest?.number, "F1");
  assert.equal(a.months[0].invoiced, 1000);
  assert.equal(a.months[1].net, 400);
  assert.deepEqual(a.credits[0].linked, ["F1"]);
});

test("albaranes pendientes (a día de hoy) y artículos con subida de precio", () => {
  const line = (price: number, qty = 10) => ({ reference: "R1", description: "Cable", unit: "m", quantity: qty, net: price * qty });
  const a = buildAccounts(
    [
      doc({ id: "1", date: "2026-01-10", lines: [line(1)] }),
      doc({ id: "2", number: "F2", date: "2026-06-10", lines: [line(1.5)] }),
      doc({ id: "3", kind: "DELIVERY", number: "AL1", date: "2025-11-01", net: null, pending: true }),
      doc({ id: "4", kind: "DELIVERY", number: "AL2", date: "2026-03-01", net: 80, pending: false }),
    ],
    2026,
  );
  assert.equal(a.pending.count, 1);
  assert.equal(a.pending.unvalued, 1);
  assert.equal(a.totals.deliveryCount, 1);
  assert.equal(a.articles[0].quantity, 20);
  assert.equal(a.articles[0].avgPrice, 1.25);
  assert.deepEqual(a.priceChanges[0], { reference: "R1", description: "Cable", from: 1, to: 1.5, pct: 50 });
});

test("sin año cuenta todos los años", () => {
  const a = buildAccounts([doc({ date: "2025-01-01" }), doc({ id: "2", date: "2026-01-01" })], null);
  assert.equal(a.totals.invoiceCount, 2);
});
