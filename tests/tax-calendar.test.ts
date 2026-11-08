import test from "node:test";
import assert from "node:assert/strict";
import { nextBusinessDay, taxCalendar, upcoming } from "../src/lib/tax-calendar";

const find = (year: number, id: string) => taxCalendar(year).find((d) => d.id === id)!;
test("plazos trimestrales de IVA e IRPF", () => {
  assert.equal(find(2026, "303-2026-1").end, "2026-04-20");
  assert.equal(find(2026, "303-2026-2").end, "2026-07-20");
  assert.equal(find(2026, "303-2026-3").end, "2026-10-20");
  assert.equal(find(2026, "130-2025-4").end, "2026-01-30"); // 4T del año anterior
  assert.equal(find(2026, "303-2026-1").bankEnd, "2026-04-15");
});
test("si el plazo cae en fin de semana pasa al lunes", () => {
  // 30/01/2027 es sábado → lunes 1/02; 25/01/2026 es domingo → lunes 26/01.
  assert.equal(find(2027, "303-2026-4").end, "2027-02-01");
  assert.equal(find(2026, "303-2025-4").bankEnd, "2026-01-26");
  assert.equal(nextBusinessDay(new Date("2026-11-07")).toISOString().slice(0, 10), "2026-11-09");
});
test("cuota de autónomos mensual y modelo 347 en febrero", () => {
  assert.equal(taxCalendar(2026).filter((d) => d.model === "RETA").length, 12);
  assert.equal(find(2026, "reta-2026-2").end, "2026-02-28");
  assert.equal(find(2028, "347-2027").end, "2028-02-29");
});
test("próximos plazos desde una fecha", () => {
  const list = upcoming(new Date("2026-11-07"), 3);
  assert.ok(list.every((d) => d.daysLeft >= 0));
  assert.equal(list[0].model, "RETA");
  assert.ok(list.some((d) => d.id === "303-2026-4"));
});
