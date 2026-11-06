// Utilidades comunes de las pruebas de integración de documentos (empresa de prueba, usuarios, subida, limpieza).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { chromium, request, type APIRequestContext } from "@playwright/test";

// Chromium de Playwright (misma búsqueda que tests/integration.ts).
export async function launch() {
  const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  let executablePath = process.env.PLAYWRIGHT_BROWSER_PATH;
  if (!executablePath) {
    try {
      const dirs = (await readdir(root)).filter((d) => /^chromium-\d+$/.test(d));
      if (dirs.length) executablePath = path.join(root, dirs.sort().at(-1)!, "chrome-win64", "chrome.exe");
    } catch {}
  }
  return chromium.launch({ headless: true, executablePath });
}

export const db = new PrismaClient();
export const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
export const suffix = randomUUID().slice(0, 8);
const password = randomUUID() + "-Prueba";
const companies: string[] = [];
const contexts: APIRequestContext[] = [];
export const files: string[] = [];
export const docDir = () => path.resolve(process.env.DOCUMENT_DIR ?? "data/documents");

export async function login(email: string) {
  const c = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  contexts.push(c);
  const r = await c.post("/api/auth/sign-in/email", { data: { email, password } });
  assert.equal(r.status(), 200, await r.text());
  return c;
}
export async function company(label: string) {
  const co = await db.company.create({ data: { name: `EMPRESA DE PRUEBA ${label} ${suffix}` } });
  companies.push(co.id);
  const hash = await hashPassword(password);
  async function user(role: string) {
    const id = randomUUID(), email = `${role}-${label}-${suffix}@prueba.invalid`.toLowerCase();
    await db.user.create({ data: { id, name: `${role} PRUEBA`, email, emailVerified: true, companyId: co.id, role, accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: hash } } } });
    return { id, email };
  }
  const owner = await user("ADMIN"), tech = await user("TECHNICIAN");
  const worker = await db.worker.create({ data: { companyId: co.id, name: "Técnico PRUEBA", hourlyCost: 30, userId: tech.id } });
  const customer = await db.customer.create({ data: { companyId: co.id, name: "Cliente PRUEBA" } });
  const job = await db.job.create({ data: { companyId: co.id, name: "PRUEBA · trabajo", customerId: customer.id, service: "Otros", workerId: worker.id, number: `P-${label}-${suffix}` } });
  return { id: co.id, admin: await login(owner.email), technician: () => login(tech.email), techUserId: tech.id, jobId: job.id };
}
export async function image(label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="950"><rect width="1800" height="950" fill="white"/><g font-family="Arial" font-size="40" fill="black"><text x="70" y="90">DOCUMENTO DE PRUEBA ${label}</text><text x="70" y="270">Factura N: F-001</text><text x="70" y="360">Fecha: 18/10/2026</text><text x="70" y="540">Base imponible: 730,00</text><text x="70" y="630">Total IVA: 153,30</text></g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
export async function upload(c: APIRequestContext, jobId: string, kind: string, label: string) {
  const buffer = await image(label);
  const r = await c.post("/api/documents", { multipart: { kind, jobId, file: { name: `PRUEBA-${label}.png`, mimeType: "image/png", buffer } } });
  assert.equal(r.status(), 201, await r.text());
  const { id } = await r.json();
  files.push((await db.document.findUniqueOrThrow({ where: { id } })).filename);
  return { id, buffer };
}
export async function waitReview(id: string) {
  for (let i = 0; i < 120; i++) {
    const d = await db.document.findUniqueOrThrow({ where: { id } });
    if (d.status === "FAILED") throw Error(d.error ?? "OCR fallido");
    if (d.status === "REVIEW") return d;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw Error("OCR no completado. Inicia npm run worker.");
}
export async function cleanup() {
  for (const c of contexts) await c.dispose();
  for (const id of companies) {
    await db.$transaction(async (tx) => {
      await tx.document.updateMany({ where: { companyId: id }, data: { supersedesId: null } });
      await tx.document.deleteMany({ where: { companyId: id } });
      await tx.job.deleteMany({ where: { companyId: id } });
      await tx.worker.deleteMany({ where: { companyId: id } });
      await tx.user.deleteMany({ where: { companyId: id } });
      await tx.customer.deleteMany({ where: { companyId: id } });
      await tx.audit.deleteMany({ where: { companyId: id } });
      await tx.company.delete({ where: { id } });
    }).catch((e) => console.error("Limpieza incompleta", e));
  }
  for (const f of files) await unlink(path.join(docDir(), f)).catch(() => {});
  await db.$disconnect();
}
