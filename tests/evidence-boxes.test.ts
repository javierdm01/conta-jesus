import { test } from "node:test";
import assert from "node:assert/strict";
import { boxesFromEvidence, FIELD_LABEL } from "../src/lib/evidence-boxes";

test("ids estables, se omiten nulos y las etiquetas salen de FIELD_LABEL", () => {
  const ev = { page: 1, box: [0.1, 0.1, 0.2, 0.05] as [number, number, number, number], approx: false };
  const boxes = boxesFromEvidence({ number: ev, date: null, lines: [{ price: ev, quantity: null }] });
  assert.deepEqual(boxes.map((b) => b.id), ["number", "line-0-price"]);
  assert.equal(boxes[0].label, FIELD_LABEL.number);
});

test("sin evidencia → lista vacía", () => {
  assert.deepEqual(boxesFromEvidence(undefined), []);
});
