import { currentUser, admin, AppError } from '@/lib/access';
import { apiError } from '@/lib/api-error';
import { db } from '@/lib/db';
import { analyticsRange, madridMidnight, summarizeAnalytics, type PeriodKey } from '@/lib/analytics';
import { quarterReport } from '@/lib/quarters';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const user = await currentUser(); admin(user);
    const p = new URL(req.url).searchParams.get('period') ?? 'month';
    if (!['week','month','year','five'].includes(p)) throw new AppError('Periodo no válido.');
    const period = p as PeriodKey;
    const today = new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Madrid'});
    const between = analyticsRange(period, today);
    const year = Number(today.slice(0,4));
    const [sales, costs, hours, expenses, ...quarters] = await Promise.all([
      db.sale.findMany({ where:{companyId:user.companyId,date:between}, select:{date:true,net:true,lines:{select:{lotId:true,unit:true,net:true}}} }),
      db.cost.findMany({where:{companyId:user.companyId,date:{gte:madridMidnight(between.gte),lt:madridMidnight(between.lt)},reversed:false},select:{date:true,type:true,amount:true}}),
      db.timeEntry.findMany({where:{companyId:user.companyId,date:between},select:{date:true,hours:true,hourlyCost:true}}),
      db.overhead.findMany({where:{companyId:user.companyId,date:between},select:{date:true,amount:true}}),
      ...([1,2,3,4] as const).map(quarter=>quarterReport(user.companyId,{year,quarter})),
    ]);
    return Response.json({ period, start:between.gte.toISOString().slice(0,10), end:today, ...summarizeAnalytics(sales,costs,hours,expenses,period,between), quarters:quarters.map(q=>({ quarter:q.period.quarter, outputTax:q.totals.outputTax, inputTax:q.totals.inputTax, balance:q.totals.vatBalance, warnings:q.warnings })) }, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
