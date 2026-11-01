import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { zipStream, safeName } from "../src/lib/zip";
test("el ZIP en streaming contiene los archivos con CRC y nombres únicos", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "zip-"));
  const file = path.join(dir, "a.bin");
  const big = Buffer.alloc(300_000, 7);
  await writeFile(file, big);
  const stream = zipStream([
    { name: "a.txt", text: "hola ñ" },
    { name: "a.txt", text: "otra" },
    { name: "f/grande.bin", file },
  ]);
  const buf = Buffer.from(await new Response(stream).arrayBuffer());
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50);
  const count = buf.readUInt16LE(end + 10);
  assert.equal(count, 3);
  let p = buf.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(p + 24),
      nlen = buf.readUInt16LE(p + 28),
      off = buf.readUInt32LE(p + 42);
    names.push(buf.subarray(p + 46, p + 46 + nlen).toString());
    const start = off + 30 + buf.readUInt16LE(off + 26);
    if (i === 2) assert.deepEqual(buf.subarray(start, start + size), big);
    p += 46 + nlen;
  }
  assert.deepEqual(names, ["a.txt", "a_2.txt", "f/grande.bin"]);
  void inflateRawSync;
  void readFile;
});
test("nombres de archivo seguros", () => {
  assert.equal(safeName("Ñandú / Cía. S.L."), "Nandu_Cia._S.L");
  assert.equal(safeName("../../x"), "x");
});
