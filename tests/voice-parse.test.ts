import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand, spokenRange } from "../src/lib/voice-parse";

test("horas habladas", () => {
  assert.deepEqual(spokenRange("de ocho y media a cinco y media"), { start: "08:30", end: "17:30" });
  assert.deepEqual(spokenRange("de 8:00 a 14:00"), { start: "08:00", end: "14:00" });
  assert.equal(spokenRange("hola"), null);
});
test("apunta horas al último trabajo de un cliente", () => {
  assert.deepEqual(parseCommand("Apunta de 8 y media a 5 y media de la tarde al cliente Juan, en el último trabajo de Juan"),
    { action: "hours", customer: "Juan", job: "last", start: "08:30", end: "17:30", date: undefined });
});
test("gasto y trabajo", () => {
  assert.deepEqual(parseCommand("apunta un gasto de gasolina de 40 euros ayer"), { action: "expense", category: "COMBUSTIBLE", amount: 40, date: "yesterday" });
  assert.deepEqual(parseCommand("crea un trabajo para Juan Pérez que se llame Reforma baño"), { action: "job", customer: "Juan Pérez", name: "Reforma baño" });
  assert.equal(parseCommand("qué tiempo hace"), null);
});
test("alta de cliente o proveedor", () => {
  assert.deepEqual(parseCommand("Quiero que me crees un cliente que se llame María Jesús."), { action: "contact", kind: "customer", name: "María Jesús" });
  assert.equal((parseCommand("Quiero que crees el cliente de Mary Carmen") as { name: string }).name, "Mary Carmen");
  assert.deepEqual(parseCommand("nuevo proveedor Sonepar"), { action: "contact", kind: "supplier", name: "Sonepar" });
});
test("material al último trabajo", () => {
  assert.deepEqual(parseCommand("Agrega un amortiguador al último trabajo de Mari Carmen."), { action: "material", item: "Amortiguador", quantity: 1, customer: "Mari Carmen", job: "last" });
  assert.deepEqual(parseCommand("añade dos magnetotérmicos de 16 al último trabajo"), { action: "material", item: "Magnetotérmicos de 16", quantity: 2, customer: undefined, job: "last" });
});
test("alta de contacto con «al», «como» y teléfono", () => {
  const c = (t: string) => parseCommand(t);
  assert.deepEqual(c("Créame al cliente Francisco"), { action: "contact", kind: "customer", name: "Francisco" });
  assert.deepEqual(c("añade a Francisco como cliente"), { action: "contact", kind: "customer", name: "Francisco" });
  assert.deepEqual(c("créame al proveedor Sonepar"), { action: "contact", kind: "supplier", name: "Sonepar" });
  assert.deepEqual(c("crea cliente Francisco con el teléfono 600 123 456"), { action: "contact", kind: "customer", name: "Francisco", phone: "600123456" });
  assert.equal((c("apunta de 8 y media a 5 y media al cliente Juan en el último trabajo") as { action: string }).action, "hours");
});
test("horas con cliente sin la palabra «cliente»", () => {
  assert.equal((parseCommand("apunta de 8 a 3 con Juan") as { customer?: string }).customer, "Juan");
  assert.equal((parseCommand("apunta de 8 y media a 5 y media con Mari Carmen en el último trabajo") as { customer?: string }).customer, "Mari Carmen");
  assert.equal((parseCommand("apunta de 8 a 3 en el último trabajo") as { customer?: string }).customer, undefined);
});
test("usa los clientes conocidos aunque no diga «cliente»", () => {
  const known = ["Federico", "Juan Pérez", "Mari Carmen"];
  assert.deepEqual(parseCommand("Añade la suspensión que hay para un trabajo del cliente Federico.", known), { action: "material", item: "Suspensión", quantity: 1, customer: "Federico", job: undefined });
  assert.deepEqual(parseCommand("pon tres enchufes en el trabajo de Federico", known), { action: "material", item: "Enchufes", quantity: 3, customer: "Federico", job: undefined });
  assert.deepEqual(parseCommand("apunta de 8 a 3 a Federico", known), { action: "hours", customer: "Federico", job: undefined, start: "08:00", end: "15:00", date: undefined });
  assert.deepEqual(parseCommand("apunta de 8 y media a 5 y media en el trabajo de Mari Carmen", known), { action: "hours", customer: "Mari Carmen", job: "last", start: "08:30", end: "17:30", date: undefined });
});
test("«usuario» se trata como cliente", () => {
  assert.deepEqual(parseCommand("Quiero que me crees el usuario de Maria Cristina."), { action: "contact", kind: "customer", name: "Maria Cristina" });
});
test("buscar un cliente existente", () => {
  assert.deepEqual(parseCommand("¿Me puedes buscar el cliente Francisco Javier?"), { action: "find", kind: "customer", name: "Francisco Javier" });
  assert.deepEqual(parseCommand("dime los datos del proveedor Sonepar"), { action: "find", kind: "supplier", name: "Sonepar" });
});
