import { test } from "node:test";
import assert from "node:assert/strict";
import { appOrigins, isAppOrigin } from "../src/lib/app-origins";
const env = {
  BETTER_AUTH_URL: "http://192.168.1.153:3000",
  APP_TRUSTED_ORIGINS: "http://localhost:3000,http://192.168.1.153:3000",
};
test("sesión y mutaciones comparten orígenes explícitos de ordenador y móvil", () => {
  assert.deepEqual(appOrigins(env), [
    "http://192.168.1.153:3000",
    "http://localhost:3000",
  ]);
  assert.equal(isAppOrigin("http://localhost:3000", env), true);
  assert.equal(isAppOrigin("http://192.168.1.153:3000", env), true);
});
test("no admite otros equipos, puertos, subdominios engañosos ni origen ausente", () => {
  for (const origin of [
    null,
    "null",
    "http://otro.local:3000",
    "http://192.168.1.153:3001",
    "http://localhost:3000.evil.test",
    "https://192.168.1.153:3000",
  ])
    assert.equal(isAppOrigin(origin, env), false);
});
test("configuración rechaza comodines, credenciales y rutas", () => {
  for (const url of [
    "http://*.local:3000",
    "http://user:secret@localhost:3000",
    "http://localhost:3000/otra",
    "file:///data",
  ])
    assert.throws(() => appOrigins({ BETTER_AUTH_URL: url }));
  assert.deepEqual(appOrigins({}), ["http://localhost:3000"]);
});
