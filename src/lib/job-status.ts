import { dec } from './money';
type Amount = string | number | { toString(): string };
type Invoice = {net:Amount;tax:Amount;withholding:Amount;collected:Amount};
export function jobStatus(input: { status:string; finishedAt?:Date|string|null; hasActivity:boolean; sales:Invoice[] }) {
  const finished = !!input.finishedAt || ['Finalizado','Cerrado'].includes(input.status);
  if (input.sales.length) {
    const paid = input.sales.every((s) => {
      const due = dec(s.net.toString()).plus(s.tax.toString()).minus(s.withholding.toString());
      return due.gt(0) && dec(s.collected.toString()).gte(due);
    });
    return paid && finished ? 'Cobrado' : 'Facturado';
  }
  if (finished) return 'Finalizado';
  if (input.hasActivity || ['En proceso','En ejecución','Pendiente de materiales'].includes(input.status)) return 'En proceso';
  return 'Pendiente';
}
