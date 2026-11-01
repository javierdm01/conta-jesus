// Solo lectura: sesión por LAN/localhost y protección de origen, sin modificar datos.
import { chromium } from "@playwright/test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
const directories = (await readdir(root))
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort();
const executablePath =
  process.env.PLAYWRIGHT_BROWSER_PATH ||
  path.join(root, directories.at(-1), "chrome-win64", "chrome.exe");
const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const origin of [
    ...new Set([process.env.BETTER_AUTH_URL, "http://localhost:3000"]),
  ]) {
    assert.ok(
      origin && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD,
      "Falta configuración de prueba.",
    );
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin);
      await page.getByLabel("Correo electrónico").fill(process.env.ADMIN_EMAIL);
      await page
        .getByLabel("Contraseña", { exact: true })
        .fill(process.env.ADMIN_PASSWORD);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/auth/sign-in/email") &&
          r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Entrar a mi empresa" }).click();
      assert.equal((await response).status(), 200, "Inicio de sesión");
      await page.getByRole("heading", { name: "Todo bajo control." }).waitFor();
      await page.reload();
      await page.getByRole("heading", { name: "Todo bajo control." }).waitFor();
      const statuses = await page.evaluate(async () => ({
        state: (await fetch("/api/state")).status,
        origin: (
          await fetch("/api/operations/__origin_probe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
      }));
      assert.deepEqual(statuses, { state: 200, origin: 404 });
      // Acción inexistente: permite comprobar el filtro sin guardar ningún cambio.
      const rejected = await context.request.post(
        `${origin}/api/operations/__origin_probe`,
        { headers: { Origin: "http://untrusted.invalid" }, data: {} },
      );
      assert.equal(rejected.status(), 403);
      const rejectedLogin = await context.request.post(
        `${origin}/api/auth/sign-in/email`,
        { headers: { Origin: "http://untrusted.invalid" }, data: {} },
      );
      assert.equal(rejectedLogin.status(), 403);
      const cookies = await context.cookies();
      assert.ok(
        cookies.some(
          (c) =>
            c.name.includes("session_token") &&
            c.httpOnly &&
            c.sameSite === "Lax",
        ),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.deepEqual(errors, []);
      console.log(
        `OK ${origin}: login 200, recarga autenticada, API 200, origen permitido, origen ajeno 403, cookies HttpOnly/Lax y vista móvil.`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
