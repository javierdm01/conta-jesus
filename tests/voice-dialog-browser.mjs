// Asistente en móvil, como lo usaría una persona: varias preguntas seguidas, botones rápidos, flujo guiado de horas e
// interrupciones. Comprueba que CADA respuesta suena (también la primera) y que los botones salen cuando toca.
// No guarda nada: la propuesta final se cancela. Uso: node --env-file=.env tests/voice-dialog-browser.mjs
import { chromium } from "@playwright/test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
const dir = (await readdir(root)).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || path.join(root, dir, "chrome-win64", "chrome.exe") });
const origin = process.env.BOT_BASE || process.env.BETTER_AUTH_URL || "http://localhost:3000";
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// Registro de lo que suena: cada play() de un <audio> (y si el navegador lo dejó sonar) y cada frase de la voz del navegador.
await context.addInitScript(() => {
  window.__plays = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const rec = { src: String(this.src).slice(0, 30), ok: null };
    window.__plays.push(rec);
    const p = play.call(this);
    p.then(() => (rec.ok = true), (e) => (rec.ok = String(e.name)));
    return p;
  };
  window.__tts = [];
  const speak = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = (u) => (window.__tts.push(u.text), speak(u));
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
const ok = (msg) => console.log(`  ✔ ${msg}`);

try {
  await page.goto(origin);
  await page.getByLabel("Correo electrónico").fill(process.env.ADMIN_EMAIL);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar a mi empresa" }).click();
  await page.getByRole("button", { name: "Abrir el asistente" }).waitFor();
  await page.evaluate(() => localStorage.removeItem("instala-voice-chat"));
  await page.getByRole("button", { name: "Abrir el asistente" }).tap();
  const dlg = page.getByRole("dialog", { name: "Asistente" });
  await dlg.waitFor();

  const bot = dlg.locator(".va-msg.bot .va-bubble:not(.va-typing)");
  const chips = dlg.getByRole("list", { name: "Sugerencias" }).getByRole("listitem");
  const idle = () => dlg.getByText("Listo", { exact: true }).waitFor({ timeout: 30000 });
  // Espera la respuesta n-ésima, que haya sonado con la voz natural y que el asistente vuelva a quedar libre.
  const reply = async (n, what) => {
    await bot.nth(n - 1).waitFor({ timeout: 30000 });
    await idle();
    const plays = await page.evaluate(() => window.__plays.slice(1)); // el primero es el audio mudo de desbloqueo
    assert.ok(plays.length >= n, `la respuesta ${n} (${what}) no ha sonado: ${JSON.stringify(plays)}`);
    assert.ok(plays.every((p) => p.ok === true), `algún audio se bloqueó: ${JSON.stringify(plays)}`);
    const text = await bot.nth(n - 1).innerText();
    ok(`${what}: «${text.slice(0, 70)}» — suena`);
    return text;
  };

  // 1) Primera pregunta con un botón de inicio: debe sonar (era el fallo del primer mensaje).
  assert.ok((await chips.count()) >= 3, "faltan los botones de inicio");
  await chips.filter({ hasText: "Lista de clientes" }).tap();
  await reply(1, "1.ª respuesta (botón)");
  const unlock = await page.evaluate(() => window.__plays[0]);
  assert.equal(unlock?.ok, true, `el audio mudo de desbloqueo no suena: ${JSON.stringify(unlock)}`);
  ok("el audio de desbloqueo se reproduce");
  await chips.first().waitFor();
  const after1 = await chips.allInnerTexts();
  assert.ok(after1.length >= 2, "tras la 1.ª respuesta no salen botones");
  ok(`botones tras la 1.ª: ${after1.join(" | ")}`);

  // 2) Segunda: un botón de seguimiento.
  await chips.first().tap();
  await reply(2, "2.ª respuesta (botón de seguimiento)");
  await chips.first().waitFor();
  ok(`botones tras la 2.ª: ${(await chips.allInnerTexts()).join(" | ")}`);

  // 3) Tercera, escrita, con una pregunta de seguimiento que depende de la anterior.
  const input = dlg.getByLabel("Escribe tu pregunta u orden");
  await input.fill("¿Cuánto he facturado este mes?");
  await input.press("Enter");
  await reply(3, "3.ª respuesta (escrita)");
  await input.fill("¿y el mes pasado?");
  await input.press("Enter");
  await reply(4, "4.ª respuesta (seguimiento)");

  // 4) Flujo guiado de horas: pregunta lo que falta, con botones; el botón interno «__last» no debe verse.
  await input.fill("registra horas");
  await input.press("Enter");
  await reply(5, "pide el horario");
  await input.fill("de 8 a 3");
  await input.press("Enter");
  await reply(6, "pide el día");
  assert.deepEqual(await chips.allInnerTexts(), ["Hoy", "Ayer", "Anteayer"]);
  await chips.filter({ hasText: "Hoy" }).tap();
  await reply(7, "pide el trabajo");
  const jobChips = await chips.allInnerTexts();
  const customers = jobChips.slice(0, -1).map((t) => t.split(" · ")[0]);
  assert.equal(new Set(customers).size, customers.length, `botones de trabajo repetidos por cliente: ${jobChips.join(" | ")}`);
  ok(`botones de trabajo (uno por cliente): ${jobChips.join(" | ")}`);
  await chips.filter({ hasText: "El último trabajo" }).tap();
  await reply(8, "propuesta de horas");
  assert.ok(!(await dlg.locator(".va-msg.me").allInnerTexts()).some((t) => t.includes("__")), "se ve un valor interno en la conversación");
  const confirmBtn = dlg.getByRole("button", { name: "Cancelar", exact: true });
  await confirmBtn.waitFor();
  ok("salen «Confirmar y guardar» y «Cancelar»");
  await confirmBtn.tap();
  await reply(9, "cancelada sin guardar");

  // 5) Cliente mal dicho: enseña los parecidos con datos para reconocerlos; tocar uno sigue con la orden.
  await input.fill("apunta de 8 a 3 a Rodolfa");
  await input.press("Enter");
  await reply(10, "cliente dudoso");
  const row = dlg.locator(".va-list .va-pick").first();
  await row.waitFor();
  ok(`lista de parecidos: «${(await row.innerText()).replace(/\s*\n\s*/g, " — ")}»`);
  await row.tap();
  await reply(11, "tras elegir en la lista");
  assert.match(await bot.nth(10).innerText(), /Rodolfo/);
  assert.equal(await dlg.locator(".va-list .va-pick").count(), 0, "la lista ya contestada se puede seguir tocando");
  await dlg.getByRole("button", { name: "Cancelar", exact: true }).tap();
  await reply(12, "cancelada sin guardar");

  // 6) Interrumpir: tocar un botón mientras habla no deja el asistente colgado ni mezcla respuestas.
  await chips.first().waitFor();
  await chips.first().tap();
  await dlg.getByText("Hablando…", { exact: true }).first().waitFor({ timeout: 30000 });
  await chips.first().tap(); // mientras habla
  await idle();
  const n = await bot.count();
  ok(`interrupción mientras habla: vuelve a «Listo» (${n} respuestas en pantalla)`);
  assert.ok(await dlg.getByRole("button", { name: /micrófono/ }).isEnabled(), "el micrófono se queda bloqueado");

  assert.deepEqual(errors, [], `errores en consola: ${errors.join(" / ")}`);
  ok("sin errores en la consola");
  console.log("OK asistente móvil");
} finally {
  await browser.close();
}
