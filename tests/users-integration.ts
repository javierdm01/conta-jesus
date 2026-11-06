import assert from "node:assert/strict";
import { request } from "@playwright/test";
import { company, db, origin, suffix, cleanup } from "./docs-harness";

const op = (c: Awaited<ReturnType<typeof request.newContext>>, action: string, data: object) =>
  c.post(`/api/operations/${action}`, { data });
async function signIn(email: string, password: string) {
  const c = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  const r = await c.post("/api/auth/sign-in/email", { data: { email, password } });
  return { c, status: r.status() };
}

async function main() {
  const a = await company("U");
  const email = `tecnico-nuevo-${suffix}@prueba.invalid`, pass1 = "Clave-Inicial-123", pass2 = "Clave-Nueva-45678";

  const created = await op(a.admin, "user-create", { name: "Técnico Nuevo", email, password: pass1, role: "TECHNICIAN", hourlyCost: "25", specialty: "" });
  assert.equal(created.status(), 200, await created.text());
  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { worker: true } });
  assert.ok(user.worker, "se crea su ficha de trabajador");
  assert.equal((await op(a.admin, "user-create", { name: "Otro", email, password: pass1, role: "TECHNICIAN", hourlyCost: "25", specialty: "" })).status(), 409, "correo duplicado");
  assert.equal((await op(a.admin, "user-create", { name: "Sin coste", email: `x-${email}`, password: pass1, role: "TECHNICIAN", specialty: "" })).status(), 400, "un técnico necesita coste por hora");

  const first = await signIn(email, pass1);
  assert.equal(first.status, 200, "el técnico nuevo entra");
  assert.equal((await first.c.get("/api/state")).status(), 200);

  await op(first.c, "user-active", { id: user.id, active: false }).then((r) => assert.equal(r.status(), 403, "un técnico no gestiona usuarios"));
  const admin = await db.user.findFirstOrThrow({ where: { companyId: a.id, role: "ADMIN" } });
  assert.equal((await op(a.admin, "user-active", { id: admin.id, active: false })).status(), 400, "no puede desactivarse a sí mismo");

  assert.equal((await op(a.admin, "user-active", { id: user.id, active: false })).status(), 200);
  assert.ok([401, 403].includes((await first.c.get("/api/state")).status()), "sesión cerrada tras desactivar");
  assert.notEqual((await signIn(email, pass1)).status, 200, "cuenta desactivada no inicia sesión");

  assert.equal((await op(a.admin, "user-password", { id: user.id, password: pass2 })).status(), 200);
  assert.equal((await op(a.admin, "user-active", { id: user.id, active: true })).status(), 200);
  assert.equal((await signIn(email, pass2)).status, 200, "contraseña nueva");
  assert.notEqual((await signIn(email, pass1)).status, 200, "la anterior ya no sirve");
  console.log("OK usuarios: alta, duplicado, permisos, desactivar/reactivar y cambio de contraseña");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(cleanup);
