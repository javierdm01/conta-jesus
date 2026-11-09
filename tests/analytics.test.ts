import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsRange, madridMidnight, summarizeAnalytics } from '../src/lib/analytics';
test('rangos incluyen el día actual y no dependen del huso de la máquina',()=>{
 const week=analyticsRange('week','2026-01-02');assert.equal(week.gte.toISOString(),'2025-12-27T00:00:00.000Z');assert.equal(week.lt.toISOString(),'2026-01-03T00:00:00.000Z');
 const month=analyticsRange('month','2026-11-08');assert.equal(month.gte.toISOString(),'2026-10-10T00:00:00.000Z');
});
test('los costes con hora real usan medianoche de Madrid también al cambiar la hora',()=>{
 assert.equal(madridMidnight(new Date('2026-07-01T00:00:00Z')).toISOString(),'2026-06-30T22:00:00.000Z');
 assert.equal(madridMidnight(new Date('2026-12-01T00:00:00Z')).toISOString(),'2026-11-30T23:00:00.000Z');
 const date=new Date('2026-11-05T23:30:00Z');const a=summarizeAnalytics([],[{date,type:'Materiales',amount:'5'}],[],[],'week');assert.equal(a.series[0].date,'2026-11-06');
});
test('analítica separa únicamente líneas identificables y no duplica gastos asignados',()=>{
 const d=new Date('2026-11-05T00:00:00Z');
 const a=summarizeAnalytics([{date:d,net:'200',lines:[{lotId:'l',unit:'ud',net:'80'},{lotId:null,unit:'h',net:'50'},{lotId:null,unit:'ud',net:'70'}]}],[{date:d,type:'Materiales',amount:'40'},{date:d,type:'Gastos generales asignados',amount:'25'},{date:d,type:'Otros',amount:'5'}],[{date:d,hours:'2',hourlyCost:'20'}],[{date:d,amount:'25'}],'week',analyticsRange('week','2026-11-08'));
 assert.equal(a.income,'200.00');assert.equal(a.materialRevenue,'80.00');assert.equal(a.laborRevenue,'50.00');assert.equal(a.unknownRevenue,'70.00');assert.equal(a.totalCost,'110.00');assert.equal(a.result,'90.00');assert.equal(a.series.length,7);
});
test('facturas sin desglose permanecen sin clasificar y las devoluciones reducen el coste',()=>{
 const d=new Date('2026-02-01T00:00:00Z');const a=summarizeAnalytics([{date:d,net:'100',lines:[]}],[{date:d,type:'Materiales',amount:'-10'}],[],[],'month');assert.equal(a.unknownRevenue,'100.00');assert.equal(a.materialCost,'-10.00');assert.equal(a.result,'110.00');
});
