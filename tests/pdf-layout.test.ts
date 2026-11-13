import test from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, pdfLayoutSchema, readLayout } from "../src/lib/pdf-layout";
import { renderDocumentPdf } from "../src/lib/pdf-document";

const data = {
  title: "FACTURA", number: "2026-001", date: new Date("2026-11-13"), due: null,
  company: { name: "Empresa", taxId: "B1" }, customer: { name: "Cliente" }, job: { number: "T-1", name: "Obra" },
  lines: [{ description: "Cable", unit: "m", quantity: "10", price: "1", discount: "0", net: "10" }],
  totals: [{ key: "total" as const, value: "12,10 €" }], notes: "Nota",
};

test("renders the default and a customised layout", async () => {
  const custom = defaultLayout();
  custom.blocks.push({ ...custom.blocks[0], id: "box-1", kind: "box", h: 50, fill: "#eeeeee" }, { ...custom.blocks[0], id: "text-1", kind: "text", text: "Hola" });
  custom.blocks.find((b) => b.id === "companyName")!.hidden = true;
  custom.blocks.find((b) => b.id === "table")!.cols = ["Concepto", "Cant.", "€", "%", "Importe"];
  custom.blocks.find((b) => b.id === "totals")!.hide = ["tax"];
  assert.equal(pdfLayoutSchema.safeParse({ blocks: [{ id: "t", kind: "totals", x: 0, y: 0, w: 20, hide: ["otro"] }] }).success, false);
  for (const layout of [null, custom]) assert.equal((await renderDocumentPdf(data, layout)).subarray(0, 4).toString(), "%PDF");
});

test("rejects invalid layouts and fills missing blocks", () => {
  assert.equal(pdfLayoutSchema.safeParse({ blocks: [{ id: "x", kind: "text", x: -5, y: 0, w: 20 }] }).success, false);
  assert.equal(pdfLayoutSchema.safeParse({ blocks: [{ id: "x", kind: "text", x: 0, y: 0, w: 20, color: "red" }] }).success, false);
  assert.equal(readLayout({ blocks: [] }).blocks.length, defaultLayout().blocks.filter((b) => !["text", "divider"].includes(b.kind)).length);
  assert.equal(readLayout("basura").blocks.length, defaultLayout().blocks.length);
  // Un texto borrado no vuelve; un campo borrado sí (solo se puede ocultar).
  const kept = readLayout({ blocks: defaultLayout().blocks.filter((b) => b.id !== "lbl-customer" && b.id !== "number") });
  assert.ok(!kept.blocks.some((b) => b.id === "lbl-customer") && kept.blocks.some((b) => b.id === "number"));
});
