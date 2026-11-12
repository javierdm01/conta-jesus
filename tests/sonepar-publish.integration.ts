// Usa la DB únicamente para leer unidades; todos los archivos se crean en un directorio temporal.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), "sonepar-publish-test-"));
  try {
    const privateDir = "data/automation/sonepar";
    const state = JSON.parse(await readFile(path.join(privateDir, "estado.json"), "utf8"));
    await writeFile(path.join(directory, "estado.json"), JSON.stringify({ ...state, imported: false }));
    const source = JSON.parse(await readFile(path.join(privateDir, "portal/prueba-resultado.json"), "utf8"));
    const sample = source.map((row: Record<string, unknown>) => ({ ...row,
      cantidadPrecioMostrado: row.cantidadPrecioMostrado === null ? null : Number(row.cantidadPrecioMostrado),
      ...(row.supplierRef === "92813" ? { unidad: "metros" } : {}),
    }));
    const input = path.join(directory, "sample.json");
    await writeFile(input, JSON.stringify(sample));
    const run = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/sonepar-portal-publish.ts", input], {
      env: { ...process.env, SONEPAR_EXCHANGE_DIR: directory }, encoding: "utf8",
    });
    const first = run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const output = path.join(directory, "precios_sonepar.json");
    const before = await readFile(output, "utf8");
    const rows = JSON.parse(before);
    assert.equal(rows.length, 1, "Debe omitir el envase, el artículo sin referencia y la unidad incompatible");
    assert.equal(rows[0].supplierRef, "102400");
    const second = run();
    assert.notEqual(second.status, 0, "No debe sobrescribir una importación pendiente");
    assert.equal(await readFile(output, "utf8"), before);
    console.log("OK: publicación numérica, filtrado de envase/unidad y protección contra sobrescritura; sin escribir en DB");
  } finally { await rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
