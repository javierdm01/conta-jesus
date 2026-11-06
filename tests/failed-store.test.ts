import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile, utimes, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { keepFailed, pruneFailed } from "../worker/failed-store";

test("guarda el fallo y borra lo que lleva más de 5 días", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "failed-"));
  try {
    await writeFile(path.join(dir, "a.jpg"), "x");
    await keepFailed(dir, { id: "doc1", filename: "a.jpg" }, "boom");
    const failed = path.join(dir, "failed");
    assert.deepEqual((await readdir(failed)).sort(), ["doc1.jpg", "doc1.txt"]);

    assert.equal(await pruneFailed(dir), 0, "recién guardado no se borra");
    const old = new Date(Date.now() - 6 * 86400000);
    await utimes(path.join(failed, "doc1.jpg"), old, old);
    assert.equal(await pruneFailed(dir), 1, "solo el de hace 6 días");
    assert.deepEqual(await readdir(failed), ["doc1.txt"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
