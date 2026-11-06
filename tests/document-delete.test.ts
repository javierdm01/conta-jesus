import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteBlocker, type DeleteFacts } from "../src/lib/document-delete";

const base: DeleteFacts = {
  status: "REVIEW", kind: "PURCHASE", confirmedAt: null, lockedUntil: null,
  lines: 0, costs: 0, stockLots: 0, valuedLots: 0, replacedBy: false,
};
const now = new Date("2026-11-01T10:00:00Z");

test("sin confirmar y sin dependencias se puede eliminar", () => {
  for (const status of ["REVIEW", "FAILED", "QUEUED"])
    assert.equal(deleteBlocker({ ...base, status }, now), null);
  assert.equal(deleteBlocker({ ...base, kind: "PHOTO", status: "ARCHIVED" }, now), null);
});

test("confirmado se rechaza", () => {
  assert.match(deleteBlocker({ ...base, status: "CONFIRMED" }, now)!, /confirmado/);
  assert.match(deleteBlocker({ ...base, confirmedAt: now }, now)!, /confirmado/);
});

test("las dependencias se nombran", () => {
  assert.match(deleteBlocker({ ...base, lines: 2 }, now)!, /línea/);
  assert.match(deleteBlocker({ ...base, costs: 1 }, now)!, /coste/);
  assert.match(deleteBlocker({ ...base, stockLots: 1 }, now)!, /lote/);
  assert.match(deleteBlocker({ ...base, valuedLots: 1 }, now)!, /lote/);
  assert.match(deleteBlocker({ ...base, replacedBy: true }, now)!, /sustituye/);
});

test("PROCESSING solo se rechaza con arrendamiento vigente", () => {
  const future = new Date(now.getTime() + 60000), past = new Date(now.getTime() - 60000);
  assert.match(deleteBlocker({ ...base, status: "PROCESSING", lockedUntil: future }, now)!, /leyendo/);
  assert.equal(deleteBlocker({ ...base, status: "PROCESSING", lockedUntil: past }, now), null);
});
