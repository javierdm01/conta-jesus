import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { configuredScanners, parseCapabilities, scan, scanSettingsXml, type Scanner } from "../src/lib/escl";

// Servidor eSCL SIMULADO, solo para pruebas: imita las respuestas de una impresora AirScan.
const caps = `<?xml version="1.0"?><scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
<pwg:MakeAndModel>Prueba MFP</pwg:MakeAndModel>
<scan:Platen><scan:PlatenInputCaps><scan:MaxWidth>2550</scan:MaxWidth><scan:MaxHeight>3508</scan:MaxHeight><scan:SettingProfiles><scan:SettingProfile>
<scan:ColorModes><scan:ColorMode>BlackAndWhite1</scan:ColorMode><scan:ColorMode>Grayscale8</scan:ColorMode><scan:ColorMode>RGB24</scan:ColorMode></scan:ColorModes>
<scan:DocumentFormats><pwg:DocumentFormat>application/pdf</pwg:DocumentFormat><pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat></scan:DocumentFormats>
<scan:SupportedResolutions><scan:DiscreteResolutions><scan:DiscreteResolution><scan:XResolution>200</scan:XResolution><scan:YResolution>200</scan:YResolution></scan:DiscreteResolution><scan:DiscreteResolution><scan:XResolution>300</scan:XResolution><scan:YResolution>300</scan:YResolution></scan:DiscreteResolution></scan:DiscreteResolutions></scan:SupportedResolutions>
</scan:SettingProfile></scan:SettingProfiles></scan:PlatenInputCaps></scan:Platen>
<scan:Adf><scan:AdfSimplexInputCaps><scan:MaxWidth>2550</scan:MaxWidth><scan:MaxHeight>4200</scan:MaxHeight><scan:SettingProfiles><scan:SettingProfile>
<scan:ColorModes><scan:ColorMode>Grayscale8</scan:ColorMode></scan:ColorModes>
<scan:DocumentFormats><pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat></scan:DocumentFormats>
<scan:SupportedResolutions><scan:DiscreteResolutions><scan:DiscreteResolution><scan:XResolution>200</scan:XResolution></scan:DiscreteResolution></scan:DiscreteResolutions></scan:SupportedResolutions>
</scan:SettingProfile></scan:SettingProfiles></scan:AdfSimplexInputCaps></scan:Adf></scan:ScannerCapabilities>`;

async function fakeScanner(o: { pages: number; state?: string; location?: string }) {
  const page = await sharp({ create: { width: 170, height: 234, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
  const log: string[] = [];
  let left = o.pages;
  const server: Server = createServer((req, res) => {
    log.push(`${req.method} ${req.url}`);
    if (req.url === "/eSCL/ScannerCapabilities") return res.end(caps);
    if (req.url === "/eSCL/ScannerStatus") return res.end(`<scan:ScannerStatus xmlns:scan="x" xmlns:pwg="y"><pwg:State>${o.state ?? "Idle"}</pwg:State></scan:ScannerStatus>`);
    if (req.url === "/eSCL/ScanJobs" && req.method === "POST") {
      res.writeHead(201, { Location: o.location ?? "/eSCL/ScanJobs/abc" });
      return res.end();
    }
    if (req.url === "/eSCL/ScanJobs/abc/NextDocument") {
      if (left-- > 0) return res.end(page);
      res.writeHead(404);
      return res.end();
    }
    if (req.url === "/eSCL/ScanJobs/abc" && req.method === "DELETE") return res.end();
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const scanner: Scanner = { id: "0", name: "Prueba", base: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/eSCL`) };
  return { scanner, log, close: () => new Promise((r) => server.close(r)) };
}
const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
const noop = () => {};

test("lee la lista SCANNERS y descarta direcciones no válidas", () => {
  const list = configuredScanners("Oficina=http://192.168.1.50, Almacén=http://10.0.0.7:8080/eSCL/; Malo=ftp://x; Clave=http://u:p@1.2.3.4");
  assert.deepEqual(list.map((s) => [s.id, s.name, s.base.href]), [["0", "Oficina", "http://192.168.1.50/eSCL"], ["1", "Almacén", "http://10.0.0.7:8080/eSCL"]]);
  assert.deepEqual(configuredScanners(""), []);
});

test("interpreta las capacidades sin depender del prefijo XML", () => {
  const c = parseCapabilities(caps);
  assert.equal(c.model, "Prueba MFP");
  assert.deepEqual(c.sources.map((s) => [s.id, s.colorModes, s.resolutions, s.maxHeight]), [["Platen", ["Grayscale8", "RGB24"], [200, 300], 3508], ["Feeder", ["Grayscale8"], [200], 4200]]);
  assert.equal(parseCapabilities(caps.replaceAll("scan:", "").replaceAll("pwg:", "")).sources.length, 2);
  assert.match(scanSettingsXml({ source: "Feeder", color: "Grayscale8", dpi: 200, width: 2480, height: 3508 }), /<pwg:InputSource>Feeder<\/pwg:InputSource>[\s\S]*<scan:XResolution>200</);
});

test("escanea varias páginas del alimentador y las une en un PDF", async () => {
  const f = await fakeScanner({ pages: 3 });
  try {
    const seen: number[] = [];
    const pdf = await scan(f.scanner, { source: "Feeder", color: "Grayscale8", dpi: 200 }, new AbortController().signal, (n) => seen.push(n));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.equal(pageCount(pdf), 3);
    assert.deepEqual(seen, [1, 2, 3]);
  } finally {
    await f.close();
  }
});

test("el cristal entrega una sola página", async () => {
  const f = await fakeScanner({ pages: 5 });
  try {
    assert.equal(pageCount(await scan(f.scanner, { source: "Platen", color: "RGB24", dpi: 300 }, new AbortController().signal, noop)), 1);
  } finally {
    await f.close();
  }
});

test("rechaza opciones no admitidas, escáner ocupado y redirecciones a otro equipo", async () => {
  const busy = await fakeScanner({ pages: 1, state: "Processing" });
  const evil = await fakeScanner({ pages: 1, location: "http://169.254.169.254/eSCL/ScanJobs/abc" });
  const sig = new AbortController().signal;
  try {
    await assert.rejects(scan(busy.scanner, { source: "Feeder", color: "RGB24", dpi: 200 }, sig, noop), /modo de color/);
    await assert.rejects(scan(busy.scanner, { source: "Platen", color: "RGB24", dpi: 600 }, sig, noop), /Resolución no admitida/);
    await assert.rejects(scan(busy.scanner, { source: "Platen", color: "RGB24", dpi: 300 }, sig, noop), /ocupado/);
    await assert.rejects(scan(evil.scanner, { source: "Platen", color: "RGB24", dpi: 300 }, sig, noop), /dirección no permitida/);
    assert.ok(!busy.log.some((l) => l.startsWith("POST")), "no crea trabajos si está ocupado");
  } finally {
    await busy.close();
    await evil.close();
  }
});

test("al cancelar libera el trabajo en la impresora", async () => {
  const f = await fakeScanner({ pages: 2 });
  const ctrl = new AbortController();
  try {
    await assert.rejects(scan(f.scanner, { source: "Feeder", color: "Grayscale8", dpi: 200 }, ctrl.signal, () => ctrl.abort()), /cancelado/);
    assert.ok(f.log.includes("DELETE /eSCL/ScanJobs/abc"));
  } finally {
    await f.close();
  }
});

test("lee las capacidades reales de una HP Officejet Pro 8600 (eSCL 0.98, colores en ColorProfiles)", async () => {
  const { readFile } = await import("node:fs/promises");
  const c = parseCapabilities(await readFile("tests/fixtures/escl-hp-0.98.xml", "utf8"));
  assert.equal(c.version, "1.0");
  assert.deepEqual(c.sources.map((s) => [s.id, s.colorModes, s.resolutions.includes(300)]), [["Platen", ["Grayscale8", "RGB24"], true], ["Feeder", ["Grayscale8", "RGB24"], true]]);
  assert.doesNotMatch(scanSettingsXml({ source: "Platen", color: "RGB24", dpi: 300, width: 2480, height: 3508, version: "1.0" }), /DocumentFormatExt/);
});

// Impresora HP SIMULADA con protocolo LEDM (eSCL anunciado pero los trabajos se hacen por /Scan/Jobs).
async function fakeHp(pages: number) {
  const page = await sharp({ create: { width: 170, height: 234, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
  const log: string[] = [];
  let ready = 0,
    sent = 0;
  const server: Server = createServer((req, res) => {
    log.push(`${req.method} ${req.url}`);
    const port = (server.address() as AddressInfo).port;
    if (req.url === "/eSCL/ScannerCapabilities") return res.end(caps);
    if (req.url === "/eSCL/ScannerStatus") return res.end("<pwg:State>Idle</pwg:State>");
    if (req.url === "/Scan/ScanCaps.xml") return res.end("<ScanCaps/>");
    if (req.url === "/Scan/Jobs" && req.method === "POST") {
      ready = 1;
      res.writeHead(201, { Location: `http://127.0.0.1:${port}/Jobs/JobList/1` });
      return res.end();
    }
    if (req.url === "/Jobs/JobList/1" && req.method === "GET") {
      if (sent >= pages) return res.end("<j:Job><j:JobState>Completed</j:JobState></j:Job>");
      return res.end(`<j:Job><j:JobState>Processing</j:JobState><ScanJob><PreScanPage><PageNumber>${ready}</PageNumber><PageState>ReadyToUpload</PageState><BinaryURL>/Scan/Jobs/1/Pages/${ready}</BinaryURL></PreScanPage></ScanJob></j:Job>`);
    }
    if (req.url?.startsWith("/Scan/Jobs/1/Pages/")) {
      sent++;
      ready++;
      return res.end(page);
    }
    if (req.url === "/Jobs/JobList/1" && req.method === "PUT") return res.end();
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const scanner: Scanner = { id: "0", name: "HP", base: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/eSCL`) };
  return { scanner, log, close: () => new Promise((r) => server.close(r)) };
}

test("en impresoras HP usa su protocolo LEDM: varias páginas del alimentador", async () => {
  const f = await fakeHp(2);
  try {
    const pdf = await scan(f.scanner, { source: "Feeder", color: "Grayscale8", dpi: 200 }, new AbortController().signal, noop);
    assert.equal(pageCount(pdf), 2);
    assert.ok(f.log.includes("POST /Scan/Jobs") && !f.log.some((l) => l.startsWith("POST /eSCL")));
  } finally {
    await f.close();
  }
});

test("LEDM: al cancelar marca el trabajo como cancelado en la impresora", async () => {
  const f = await fakeHp(3);
  const ctrl = new AbortController();
  try {
    await assert.rejects(scan(f.scanner, { source: "Feeder", color: "Grayscale8", dpi: 200 }, ctrl.signal, () => ctrl.abort()), /cancelado/);
    assert.ok(f.log.includes("PUT /Jobs/JobList/1"));
  } finally {
    await f.close();
  }
});
