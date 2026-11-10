import { test } from "node:test";
import assert from "node:assert/strict";
import { limit } from "../src/lib/rate-limit";

test("limita por clave y se libera al pasar la ventana", () => {
  for (let i = 0; i < 3; i++) limit("a", 3, 1000, 0);
  assert.throws(() => limit("a", 3, 1000, 10), /Demasiadas/);
  limit("b", 3, 1000, 10);
  limit("a", 3, 1000, 2000);
});
