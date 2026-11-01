import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { parseOcr } from "../src/lib/ocr";
import { ocrImage } from "./ocr-image";
const db = new PrismaClient();
let stopping = false,
  lastHeartbeat = 0;
async function heartbeat() {
  await db.systemHeartbeat.upsert({
    where: { service: "ocr" },
    create: { service: "ocr", lastSeen: new Date() },
    update: { lastSeen: new Date() },
  });
  lastHeartbeat = Date.now();
}
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const p = spawn(command, args, {
      windowsHide: true,
      shell: false,
      env: { ...process.env, OMP_THREAD_LIMIT: "1" },
    });
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("Tiempo de OCR agotado"));
    }, 180000);
    p.stdout.on("data", (b) => {
      if (out.length < 2_000_000) out += b;
    });
    p.stderr.on("data", (b) => {
      if (err.length < 4000) err += b;
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(out)
        : reject(new Error(`Error de OCR (${code}): ${err.slice(0, 500)}`));
    });
  });
}
async function processNext() {
  const token = randomUUID();
  const docs = await db.$queryRaw<
    {
      id: string;
      filename: string;
      mime: string;
      kind: string;
      attempts: number;
    }[]
  >`
    UPDATE "Document" SET status='PROCESSING', attempts=attempts+1, "lockToken"=${token}, "lockedUntil"=NOW()+INTERVAL '20 minutes'
    WHERE id=(SELECT id FROM "Document" WHERE (status='QUEUED' AND "availableAt"<=NOW()) OR (status='PROCESSING' AND "lockedUntil"<NOW()) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id,filename,mime,kind,attempts`;
  const doc = docs[0];
  if (!doc) return false;
  let temp: string | undefined;
  try {
    if (doc.attempts > 3)
      throw new Error(
        "Se agotaron los reintentos; revisa el archivo y vuelve a intentarlo.",
      );
    temp = await mkdtemp(path.join(tmpdir(), "instala-ocr-"));
    const input = path.join(
      path.resolve(process.env.DOCUMENT_DIR ?? "data/documents"),
      doc.filename,
    );
    let pages: string[];
    let text = "";
    const renew = async () => {
      const lease = await db.document.updateMany({
        where: { id: doc.id, status: "PROCESSING", lockToken: token },
        data: { lockedUntil: new Date(Date.now() + 20 * 60000) },
      });
      if (!lease.count)
        throw new Error("La tarea fue recuperada por otro proceso.");
      await heartbeat();
    };
    if (doc.mime === "application/pdf") {
      const info = await run(process.env.PDFINFO_PATH ?? "pdfinfo", [input]);
      const count = Number(info.match(/Pages:\s+(\d+)/)?.[1]);
      if (!count || count > 20)
        throw new Error(
          "Solo se admiten PDF de hasta 20 páginas para OCR. Divide el documento.",
        );
      pages = [];
      for (let page = 1; page <= count; page++) {
        let native = "";
        try {
          native = await run(process.env.PDFTOTEXT_PATH ?? "pdftotext", [
            "-f",
            String(page),
            "-l",
            String(page),
            "-layout",
            input,
            "-",
          ]);
        } catch {}
        if (native.trim().length >= 150 && !/[\uFFFD]/.test(native))
          text += `\n--- Página ${page} ---\n${native}`;
        else {
          const prefix = path.join(temp, `page-${page}`);
          await run(process.env.PDFTOPPM_PATH ?? "pdftoppm", [
            "-f",
            String(page),
            "-l",
            String(page),
            "-singlefile",
            "-r",
            "150",
            "-png",
            "-scale-to",
            "2500",
            input,
            prefix,
          ]);
          const img = path.join(temp, `clean-page-${page}.png`);
          await sharp(await readFile(`${prefix}.png`), {
            limitInputPixels: 40_000_000,
          })
            .rotate()
            .png()
            .toFile(img);
          const scanned = await ocrImage(img, doc.kind, run);
          text += `\n--- Página ${page} ---\n${scanned.trim() ? scanned : native}`;
        }
        await renew();
      }
    } else pages = [input];
    for (let n = 0; n < pages.length; n++) {
      await sharp(pages[n], { limitInputPixels: 40_000_000 }).metadata();
      text +=
        `\n--- Página ${n + 1} ---\n` +
        (await ocrImage(pages[n], doc.kind, run, temp));
      // Renovar el arrendamiento entre páginas. El token impide escribir si otro proceso recuperó la tarea.
      const lease = await db.document.updateMany({
        where: { id: doc.id, status: "PROCESSING", lockToken: token },
        data: { lockedUntil: new Date(Date.now() + 20 * 60000) },
      });
      if (!lease.count)
        throw new Error("La tarea fue recuperada por otro proceso.");
    }
    const document = await db.document.findUniqueOrThrow({
      where: { id: doc.id },
      select: { companyId: true },
    });
    const suppliers = await db.supplier.findMany({
      where: { companyId: document.companyId },
      select: { id: true, name: true, taxId: true },
    });
    const suggestion = parseOcr(text, suppliers, doc.kind);
    await db.document.updateMany({
      where: { id: doc.id, lockToken: token },
      data: {
        text: text.slice(0, 1_000_000),
        suggestion: JSON.parse(JSON.stringify(suggestion)),
        status: "REVIEW",
        lockedUntil: null,
        lockToken: null,
        error: null,
      },
    });
    console.log(`OCR listo: ${doc.id}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de OCR";
    await db.document.updateMany({
      where: { id: doc.id, lockToken: token },
      data: {
        status: doc.attempts >= 3 ? "FAILED" : "QUEUED",
        availableAt: new Date(Date.now() + doc.attempts * 30000),
        lockedUntil: null,
        lockToken: null,
        error: message.slice(0, 1000),
      },
    });
    console.error(`OCR ${doc.id}: ${message}`);
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
  }
  return true;
}
async function main() {
  console.log("Procesador OCR local iniciado");
  while (!stopping) {
    try {
      if (Date.now() - lastHeartbeat > 15000) await heartbeat();
      if (!(await processNext())) await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error("Cola OCR no disponible", e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
