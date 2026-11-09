"use client";
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ResponsiveContainer, CartesianGrid, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { PeriodKey } from '@/lib/analytics';
import { cents, dec } from '@/lib/money';

type Data = {start:string;end:string;income:string;totalCost:string;result:string;laborRevenue:string;materialRevenue:string;unknownRevenue:string;laborCost:string;materialCost:string;otherCost:string;overhead:string;series:{date:string;income:string;costs:string}[];quarters:{quarter:number;outputTax:string;inputTax:string;balance:string;warnings:string[]}[]};
const euro = (v: string|number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v));
const date = (s:string) => s.split('-').reverse().join('/');
const options: {key:PeriodKey;label:string}[] = [{key:'week',label:'Semana'},{key:'month',label:'Mes'},{key:'year',label:'Año'},{key:'five',label:'5 años'}];
function Stat({label,value,note}:{label:string;value:string;note:string}) { return <div className="analytics-stat"><span>{label}</span><strong>{euro(value)}</strong><small>{note}</small></div>; }
export default function AnalyticsHome() {
  const [period,setPeriod] = useState<PeriodKey>('month');
  const {data,error,isLoading} = useSWR<Data>(`/api/analytics?period=${period}`,async url=>{const r=await fetch(url);const body=await r.json();if(!r.ok)throw Error(body.error);return body;},{keepPreviousData:false});
  return <section className="analytics">
    <div className="analytics-header"><div><h2>Análisis de tu negocio</h2><p>Facturación y costes registrados, sin IVA.</p></div><div className="analytics-periods" role="group" aria-label="Periodo de análisis">{options.map(o=><button key={o.key} type="button" aria-pressed={period===o.key} onClick={()=>setPeriod(o.key)}>{o.label}</button>)}</div></div>
    {isLoading && <p role="status">Calculando datos…</p>}{error && <p role="alert" className="error">{error.message}</p>}
    {data && <>
      <p className="analytics-range">Del {date(data.start)} al {date(data.end)} · {period==='week'?'últimos 7 días':period==='month'?'últimos 30 días':period==='year'?'últimos 12 meses':'últimos 5 años'}</p>
      <div className="analytics-stats"><Stat label="Facturado" value={data.income} note="Base de facturas de cliente"/><Stat label="Costes" value={data.totalCost} note="Material utilizado, horas y gastos"/><Stat label="Resultado orientativo" value={data.result} note="Facturado menos costes del periodo"/></div>
      <div className="analytics-grid">
        <article className="analytics-card analytics-chart"><h3>Evolución</h3><p>Facturación y costes por fecha de registro</p>{data.series.length ? <div className="analytics-plot"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.series.map(s=>({...s,income:Number(s.income),costs:Number(s.costs)}))} margin={{top:10,right:15,left:0,bottom:0}}><CartesianGrid stroke="#edf1ef" vertical={false}/><XAxis dataKey="date" tick={{fontSize:11}} minTickGap={24}/><YAxis width={62} tick={{fontSize:11}} tickFormatter={v=>`${v} €`}/><Tooltip formatter={v=>euro(Number(v))}/><Legend/><Line name="Facturado" dataKey="income" stroke="#0f766e" strokeWidth={2} dot={false}/><Line name="Costes" dataKey="costs" stroke="#d88736" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div> : <p className="analytics-empty">Todavía no hay movimientos en este periodo.</p>}</article>
        <article className="analytics-card"><h3>Mano de obra y materiales</h3><p>Ingresos identificados frente a costes registrados en el periodo.</p><div className="analytics-row"><span>Mano de obra <small>Líneas facturadas por hora</small></span><strong>{euro(data.laborRevenue)}</strong></div><div className="analytics-row"><span>Coste de horas registradas</span><strong>{euro(data.laborCost)}</strong></div><div className="analytics-row analytics-subtotal"><span>Beneficio parcial estimado de mano de obra</span><strong>{euro(cents(dec(data.laborRevenue).minus(data.laborCost)))}</strong></div><div className="analytics-row"><span>Material <small>Líneas vinculadas a almacén</small></span><strong>{euro(data.materialRevenue)}</strong></div><div className="analytics-row"><span>Coste de material usado</span><strong>{euro(data.materialCost)}</strong></div><div className="analytics-row analytics-subtotal"><span>Beneficio parcial estimado de material</span><strong>{euro(cents(dec(data.materialRevenue).minus(data.materialCost)))}</strong></div><div className="analytics-row"><span>Facturación sin clasificar</span><strong>{euro(data.unknownRevenue)}</strong></div><p className="analytics-note">Las facturas sin líneas o con conceptos sin identificar quedan sin clasificar. Los costes y ventas pueden corresponder a trabajos de fechas distintas, por lo que estas cifras no son un beneficio definitivo por categoría.</p></article>
        <article className="analytics-card analytics-quarter"><div className="analytics-card-head"><div><h3>IVA por trimestre</h3><p>Año {data.end.slice(0,4)} · estimación con datos registrados</p></div><Link href="/trimestres">Ver detalle →</Link></div><div className="analytics-quarters">{data.quarters.map(q=><div key={q.quarter}><strong>{q.quarter}.º trimestre</strong><span>{Number(q.balance)>=0?'A ingresar estimado':'Saldo negativo estimado'}</span><b>{euro(Math.abs(Number(q.balance)))}</b><small>Repercutido {euro(q.outputTax)} · soportado {euro(q.inputTax)}</small></div>)}</div><p className="analytics-note">Repercutido menos soportado registrado; no aplica automáticamente compensaciones anteriores ni comprueba la deducibilidad. Revisa el cierre con tu asesoría.</p></article>
      </div>
    </>}
  </section>;
}
