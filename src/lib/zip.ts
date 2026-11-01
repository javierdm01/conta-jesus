import { createReadStream } from "node:fs";
import { crc32 } from "node:zlib";

// ZIP sin compresión generado en streaming: los PDF e imágenes ya van comprimidos y
// así nunca se carga un trimestre completo en memoria. CRC y tamaños van en el descriptor.
export type ZipEntry =
  | { name: string; text: string }
  | { name: string; file: string };

const dosTime = (d: Date) =>
  ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) &
  0xffff;
const dosDate = (d: Date) =>
  (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) &
  0xffff;

export function safeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 90);
}

export function zipStream(entries: ZipEntry[]) {
  const now = new Date();
  const central: Buffer[] = [];
  let offset = 0;
  const used = new Set<string>();
  async function* generate() {
    for (const e of entries) {
      let name = e.name;
      for (let i = 2; used.has(name); i++)
        name = e.name.replace(/(\.[^.]*)?$/, `_${i}$1`);
      used.add(name);
      const nameBuf = Buffer.from(name, "utf8");
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x0808, 6); // descriptor de datos + nombre UTF-8
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(dosTime(now), 10);
      header.writeUInt16LE(dosDate(now), 12);
      header.writeUInt16LE(nameBuf.length, 26);
      const start = offset;
      yield Buffer.concat([header, nameBuf]);
      offset += 30 + nameBuf.length;
      let crc = 0,
        size = 0;
      const chunks: AsyncIterable<Buffer> =
        "text" in e
          ? (async function* () {
              yield Buffer.from(e.text, "utf8");
            })()
          : createReadStream(e.file);
      for await (const chunk of chunks) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        crc = crc32(b, crc);
        size += b.length;
        offset += b.length;
        yield b;
      }
      if (offset >= 0xffffffff)
        throw new Error("El paquete supera los 4 GB admitidos.");
      const desc = Buffer.alloc(16);
      desc.writeUInt32LE(0x08074b50, 0);
      desc.writeUInt32LE(crc >>> 0, 4);
      desc.writeUInt32LE(size, 8);
      desc.writeUInt32LE(size, 12);
      yield desc;
      offset += 16;
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0808, 8);
      c.writeUInt16LE(0, 10);
      c.writeUInt16LE(dosTime(now), 12);
      c.writeUInt16LE(dosDate(now), 14);
      c.writeUInt32LE(crc >>> 0, 16);
      c.writeUInt32LE(size, 20);
      c.writeUInt32LE(size, 24);
      c.writeUInt16LE(nameBuf.length, 28);
      c.writeUInt32LE(start, 42);
      central.push(Buffer.concat([c, nameBuf]));
    }
    const dir = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(central.length, 8);
    end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(offset, 16);
    yield dir;
    yield end;
  }
  const it = generate();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await it.return?.(undefined);
    },
  });
}
