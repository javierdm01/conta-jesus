import QRCode from "qrcode";

type Port = { open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; writable: WritableStream<Uint8Array> | null };
type SerialApi = { getPorts(): Promise<Port[]>; requestPort(): Promise<Port> };
export type LabelLot = { code: string; description: string; alias?: string; reference?: string; location?: string; unit?: string; onHand?: string | number };

const W = 384, H = 288; // 48 mm × 36 mm a 203 ppp (MTP-II / PT-210)
const BAUD = 9600;

// Impresión directa por Web Serial (Chrome/Edge, https o localhost). Se abre y se cierra en cada impresión para no dejar el puerto ocupado.
async function open(): Promise<Port> {
  const serial = (navigator as unknown as { serial?: SerialApi }).serial;
  if (!serial) throw new Error("Este navegador no permite imprimir por serie. Usa Chrome o Edge con https.");
  const try1 = async (p: Port) => { await p.open({ baudRate: BAUD }); return p; };
  for (const p of await serial.getPorts()) { try { return await try1(p); } catch {} }
  // Ningún puerto recordado abre (apagada, ocupada o puerto equivocado): se vuelve a pedir uno.
  try {
    return await try1(await serial.requestPort());
  } catch (e) {
    if ((e as Error).name === "NotFoundError") throw new Error("No has elegido ninguna impresora.");
    throw new Error(`No se puede abrir el puerto (${(e as Error).name}: ${(e as Error).message}). Cierra otras pestañas o programas que usen la impresora, incluida la de localhost.`);
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/.{0,2}$/, "…"); }
  return lines;
}

async function raster(lot: LabelLot) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  // QR mínimo: solo el código (versión 1, 21×21 módulos), corrección baja y módulos de 6 px exactos para que la térmica no los difumine.
  const qr = QRCode.create(lot.code, { errorCorrectionLevel: "L" }).modules, cell = 6, quiet = 3;
  ctx.fillStyle = "#000";
  for (let r = 0; r < qr.size; r++) for (let q = 0; q < qr.size; q++) if (qr.get(r, q)) ctx.fillRect(6 + (q + quiet) * cell, 8 + (r + quiet) * cell, cell, cell);
  ctx.fillStyle = "#000"; ctx.textBaseline = "top";
  const x = 176, width = W - x - 4;
  let y = 8;
  ctx.font = "bold 26px sans-serif";
  for (const l of wrap(ctx, lot.alias || lot.description, width, 4)) { ctx.fillText(l, x, y); y += 30; }
  ctx.font = "22px sans-serif";
  if (lot.reference) { ctx.fillText(`Ref. ${lot.reference}`.slice(0, 18), x, y); y += 26; }
  if (lot.location) { ctx.font = "bold 24px sans-serif"; ctx.fillText(lot.location.slice(0, 16), x, y); }
  ctx.font = "bold 30px monospace"; ctx.textAlign = "center";
  ctx.fillText(lot.code, W / 2, 176);
  ctx.font = "22px sans-serif";
  ctx.fillText(`Recibido: ${Number(lot.onHand ?? 0)} ${lot.unit ?? ""}`.trim(), W / 2, 216);
  const px = ctx.getImageData(0, 0, W, H).data, bytes = W / 8, out = new Uint8Array(bytes * H);
  for (let i = 0; i < W * H; i++) if (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11 < 160) out[(i / 8) | 0] |= 0x80 >> i % 8;
  // GS v 0 por bandas de 100 filas: las impresoras baratas se atragantan con imágenes altas.
  const parts: number[] = [0x1b, 0x40];
  const bands: Uint8Array[] = [];
  for (let r = 0; r < H; r += 100) {
    const rows = Math.min(100, H - r);
    bands.push(new Uint8Array([0x1d, 0x76, 0x30, 0, bytes & 255, bytes >> 8, rows & 255, rows >> 8]), out.subarray(r * bytes, (r + rows) * bytes));
  }
  return [new Uint8Array(parts), ...bands, new Uint8Array([0x1b, 0x64, 1])];
}

export async function printLabels(items: { lot: LabelLot; copies: number }[]) {
  const p = await open();
  const writer = p.writable!.getWriter();
  try {
    for (const { lot, copies } of items) {
      const chunks = await raster(lot);
      for (let n = 0; n < copies; n++)
        for (const chunk of chunks)
          for (let i = 0; i < chunk.length; i += 256) {
            await writer.write(chunk.subarray(i, i + 256));
            await new Promise((r) => setTimeout(r, 15)); // shortcut: sin control de flujo; subir el retardo si el Bluetooth pierde datos.
          }
    }
  } finally {
    writer.releaseLock();
    await p.close().catch(() => {});
  }
}
