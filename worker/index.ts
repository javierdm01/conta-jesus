import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { parseOcr } from "../src/lib/ocr";
import { ocrImage } from "./ocr-image";
import { scanPage } from "./scan-page";
import { keepFailed, pruneFailed } from "./failed-store";
import { wordsFromPdfBbox, wordsFromTsv, type Word } from "../src/lib/ocr-words";
import { buildEvidence, type PageWords } from "../src/lib/ocr-evidence";
const db = new PrismaClient();
let stopping = false,
  lastHeartbeat = 0,
  lastPrune = 0;
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
  const scansWritten: string[] = [];
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
    let text = "";
    const warnings: string[] = [];
    const docDir = path.resolve(process.env.DOCUMENT_DIR ?? "data/documents");
    const scansDir = path.join(docDir, "scans");
    await mkdir(scansDir, { recursive: true });
    const pageData: PageWords[] = [];
    const pageRows: {
      documentId: string;
      page: number;
      scanFilename: string;
      width: number;
      height: number;
      words: Prisma.InputJsonValue;
      scanQuality: string;
    }[] = [];
    const renew = async () => {
      const lease = await db.document.updateMany({
        where: { id: doc.id, status: "PROCESSING", lockToken: token },
        data: { lockedUntil: new Date(Date.now() + 20 * 60000) },
      });
      if (!lease.count)
        throw new Error("La tarea fue recuperada por otro proceso.");
      await heartbeat();
    };
    // Imagen «tipo escáner» de una página. El OCR solo la usa si se detectó el papel (quality "ok");
    // si no, lee la página original (la escaneada solo se muestra): en pruebas empeoraba una fecha.
    const scan = async (n: number, source: string) => {
      const file = path.join(scansDir, `${doc.id}-p${n}.jpg`);
      try {
        const r = await scanPage(source, file, run);
        scansWritten.push(file);
        return { file, ...r };
      } catch (e) {
        warnings.push(
          `Página ${n}: no se pudo preparar la imagen escaneada (${(e as Error).message.slice(0, 120)}).`,
        );
        return null;
      }
    };
    type Scanned = NonNullable<Awaited<ReturnType<typeof scan>>>;
    const tesseractWords = async (s: Scanned) =>
      wordsFromTsv(
        await run(process.env.TESSERACT_PATH ?? "tesseract", [
          s.file, "stdout", "-l", "spa+eng", "--psm", "3", "tsv",
        ]),
        s.width,
        s.height,
      );
    const record = (n: number, s: Scanned, words: Word[]) => {
      pageData.push({ page: n, words });
      pageRows.push({
        documentId: doc.id,
        page: n,
        scanFilename: `scans/${doc.id}-p${n}.jpg`,
        width: s.width,
        height: s.height,
        words: words as unknown as Prisma.InputJsonValue,
        scanQuality: s.quality,
      });
      if (s.quality === "fallback" && doc.mime !== "application/pdf")
        warnings.push(`Página ${n}: no se detectó el contorno del papel; se muestra sin recortar.`);
    };
    if (doc.mime === "application/pdf") {
      const info = await run(process.env.PDFINFO_PATH ?? "pdfinfo", [input]);
      const count = Number(info.match(/Pages:\s+(\d+)/)?.[1]);
      if (!count || count > 20)
        throw new Error(
          "Solo se admiten PDF de hasta 20 páginas para OCR. Divide el documento.",
        );
      for (let page = 1; page <= count; page++) {
        let native = "";
        try {
          native = await run(process.env.PDFTOTEXT_PATH ?? "pdftotext", [
            "-f", String(page), "-l", String(page), "-layout", input, "-",
          ]);
        } catch {}
        const prefix = path.join(temp, `page-${page}`);
        await run(process.env.PDFTOPPM_PATH ?? "pdftoppm", [
          "-f", String(page), "-l", String(page), "-singlefile",
          "-r", "150", "-png", "-scale-to", "2500", input, prefix,
        ]);
        const img = path.join(temp, `clean-page-${page}.png`);
        await sharp(await readFile(`${prefix}.png`), {
          limitInputPixels: 40_000_000,
        })
          .rotate()
          .png()
          .toFile(img);
        const s = await scan(page, img);
        if (native.trim().length >= 150 && !/[�]/.test(native)) {
          text += `
--- Página ${page} ---
${native}`;
          if (s) {
            let bbox = "";
            try {
              bbox = await run(process.env.PDFTOTEXT_PATH ?? "pdftotext", [
                "-bbox-layout", "-f", String(page), "-l", String(page), input, "-",
              ]);
            } catch {}
            const words = wordsFromPdfBbox(bbox);
            record(page, s, words.length ? words : await tesseractWords(s));
          }
        } else {
          const scanned = await ocrImage(s?.quality === "ok" ? s.file : img, doc.kind, run, temp);
          text += `
--- Página ${page} ---
${scanned.trim() ? scanned : native}`;
          if (s) record(page, s, await tesseractWords(s));
        }
        await renew();
      }
    } else {
      const img = path.join(temp, "page-1.png");
      await sharp(input, { limitInputPixels: 40_000_000 }).rotate().png().toFile(img);
      const s = await scan(1, img);
      text +=
        `
--- Página 1 ---
` +
        (await ocrImage(s?.quality === "ok" ? s.file : img, doc.kind, run, temp));
      if (s) record(1, s, await tesseractWords(s));
      // Renovar el arrendamiento; el token impide escribir si otro proceso recuperó la tarea.
      await renew();
    }
    const document = await db.document.findUniqueOrThrow({
      where: { id: doc.id },
      select: { companyId: true },
    });
    const suppliers = await db.supplier.findMany({
      where: { companyId: document.companyId },
      select: { id: true, name: true, taxId: true },
    });
    const parsed = parseOcr(text, suppliers, doc.kind);
    let evidence;
    try {
      evidence = buildEvidence(parsed, pageData);
    } catch (e) {
      warnings.push("No se pudieron localizar los datos sobre la imagen.");
      console.error(`Evidencia ${doc.id}:`, e);
    }
    const suggestion = {
      ...parsed,
      warnings: [...parsed.warnings, ...warnings],
      ...(evidence ? { evidence } : {}),
    };
    const saved = await db.$transaction(async (tx) => {
      const r = await tx.document.updateMany({
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
      if (r.count) {
        await tx.documentPage.deleteMany({ where: { documentId: doc.id } });
        if (pageRows.length) await tx.documentPage.createMany({ data: pageRows });
      }
      return r.count;
    });
    // Documento eliminado o tarea recuperada mientras se leía: no dejar imágenes huérfanas.
    if (!saved) for (const f of scansWritten) await rm(f, { force: true });
    console.log(`OCR listo: ${doc.id}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de OCR";
    if (doc.attempts >= 3)
      await keepFailed(path.resolve(process.env.DOCUMENT_DIR ?? "data/documents"), doc, message).catch(() => {});
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
      if (Date.now() - lastPrune > 3600000) {
        lastPrune = Date.now();
        await pruneFailed(path.resolve(process.env.DOCUMENT_DIR ?? "data/documents"));
      }
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
