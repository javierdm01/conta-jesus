import { cents, dec, sum } from './money';
export type PeriodKey = 'week' | 'month' | 'year' | 'five';
export function analyticsRange(period: PeriodKey, today: string) {
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  if (period === 'week') start.setUTCDate(start.getUTCDate() - 6);
  else if (period === 'month') start.setUTCDate(start.getUTCDate() - 29);
  else if (period === 'year') start.setUTCFullYear(start.getUTCFullYear() - 1);
  else start.setUTCFullYear(start.getUTCFullYear() - 5);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}
// Los costes de almacén llevan hora real; ventas y partes guardan fechas a medianoche UTC.
export function madridMidnight(date: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(date));
  return new Date(date.getTime() - hour * 3600000);
}
type Sale = { date: Date; net: { toString(): string }; lines: { unit: string; lotId: string | null; net: { toString(): string } }[] };
type Cost = { date: Date; type: string; amount: { toString(): string } };
type Hours = { date: Date; hours: { toString(): string }; hourlyCost: { toString(): string } };
type Expense = { date: Date; amount: { toString(): string } };
export function summarizeAnalytics(sales: Sale[], costs: Cost[], hours: Hours[], expenses: Expense[], period: PeriodKey, range?: {gte:Date;lt:Date}) {
  let laborRevenue = dec(0), materialRevenue = dec(0), unknownRevenue = dec(0);
  const buckets = new Map<string, { income: ReturnType<typeof dec>; costs: ReturnType<typeof dec> }>();
  const bucket = (date: Date, local = false) => {
    const d = local ? date.toLocaleDateString('sv-SE', {timeZone:'Europe/Madrid'}) : date.toISOString();
    const key = period === 'five' ? d.slice(0, 4) : period === 'year' ? d.slice(0, 7) : d.slice(0, 10);
    const row = buckets.get(key) ?? { income: dec(0), costs: dec(0) }; buckets.set(key, row); return row;
  };
  for (const sale of sales) {
    bucket(sale.date).income = bucket(sale.date).income.plus(sale.net.toString());
    let classified = dec(0);
    for (const line of sale.lines) {
      const amount = dec(line.net.toString());
      if (line.lotId) { materialRevenue = materialRevenue.plus(amount); classified = classified.plus(amount); }
      else if (line.unit.toLowerCase() === 'h') { laborRevenue = laborRevenue.plus(amount); classified = classified.plus(amount); }
    }
    unknownRevenue = unknownRevenue.plus(dec(sale.net.toString()).minus(classified));
  }
  let materialCost = dec(0), otherCost = dec(0), laborCost = dec(0), overhead = dec(0);
  for (const cost of costs) {
    if (cost.type === 'Gastos generales asignados') continue;
    const amount = dec(cost.amount.toString());
    if (cost.type === 'Materiales') materialCost = materialCost.plus(amount); else otherCost = otherCost.plus(amount);
    bucket(cost.date, true).costs = bucket(cost.date, true).costs.plus(amount);
  }
  for (const h of hours) {
    const amount = dec(h.hours.toString()).mul(h.hourlyCost.toString()).toDecimalPlaces(2);
    laborCost = laborCost.plus(amount); bucket(h.date).costs = bucket(h.date).costs.plus(amount);
  }
  for (const expense of expenses) { const amount = dec(expense.amount.toString()); overhead = overhead.plus(amount); bucket(expense.date).costs = bucket(expense.date).costs.plus(amount); }
  const income = sum(sales.map(s => s.net.toString()));
  const totalCost = materialCost.plus(laborCost).plus(otherCost).plus(overhead);
  if (range) {
    const cursor = new Date(range.gte);
    if (period === 'five') cursor.setUTCMonth(0,1);
    else if (period === 'year') cursor.setUTCDate(1);
    while (cursor < range.lt) {
      bucket(cursor);
      if (period === 'five') cursor.setUTCFullYear(cursor.getUTCFullYear()+1);
      else if (period === 'year') cursor.setUTCMonth(cursor.getUTCMonth()+1);
      else cursor.setUTCDate(cursor.getUTCDate()+1);
    }
  }
  return { income: cents(income), materialRevenue: cents(materialRevenue), laborRevenue: cents(laborRevenue), unknownRevenue: cents(unknownRevenue), materialCost: cents(materialCost), laborCost: cents(laborCost), otherCost: cents(otherCost), overhead: cents(overhead), totalCost: cents(totalCost), result: cents(income.minus(totalCost)), series: [...buckets].sort(([a],[b])=>a.localeCompare(b)).map(([date, row])=>({ date, income: cents(row.income), costs: cents(row.costs) })) };
}
