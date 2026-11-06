import { test } from "node:test";
import assert from "node:assert/strict";
import { uuid } from "../src/lib/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("con crypto.randomUUID disponible lo usa", () => {
  assert.match(uuid(), V4);
});

test("sin crypto.randomUUID (http://IP) genera un UUID v4 válido y distinto cada vez", () => {
  const real = globalThis.crypto;
  // Simula un contexto no seguro: getRandomValues existe, randomUUID no.
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) },
  });
  try {
    const ids = Array.from({ length: 2000 }, () => uuid());
    for (const id of ids) assert.match(id, V4);
    assert.equal(new Set(ids).size, ids.length, "sin repeticiones");
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: real });
  }
});
