import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { AppError } from "./access";

// Escaneo por red con eSCL (AirScan) o, en impresoras HP, con su protocolo LEDM: el servidor habla HTTP con la impresora y devuelve un PDF.
// Solo se contacta con los escáneres de SCANNERS (lista cerrada en .env): nunca con una dirección que mande el navegador.

export type Scanner = { id: string; name: string; base: URL };
export type Source = "Platen" | "Feeder";
export type ColorMode = "RGB24" | "Grayscale8";
export type SourceCaps = { id: Source; colorModes: ColorMode[]; resolutions: number[]; maxWidth: number; maxHeight: number; formats: string[] };
export type Caps = { model: string; version: string; sources: SourceCaps[] };

export const MAX_PAGES = 20; // el OCR admite hasta 20 páginas por documento
export const MAX_BYTES = 19 * 1024 * 1024; // /api/documents admite 20 MB
const A4 = { w: 2480, h: 3508 }; // en 1/300 de pulgada, la unidad de eSCL

// SCANNERS="Oficina=http://192.168.1.50, Almacén=http://192.168.1.60:8080/eSCL"
export function configuredScanners(env = process.env.SCANNERS ?? ""): Scanner[] {
  return env
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap((entry, i) => {
      const at = entry.indexOf("=");
      const name = at > 0 ? entry.slice(0, at).trim() : `Escáner ${i + 1}`;
      try {
        const base = new URL(at > 0 ? entry.slice(at + 1).trim() : entry);
        if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) return [];
        if (base.pathname === "/" || !base.pathname) base.pathname = "/eSCL";
        base.pathname = base.pathname.replace(/\/+$/, "");
        base.search = base.hash = "";
        return [{ id: String(i), name: name.slice(0, 60), base }];
      } catch {
        return [];
      }
    });
}

// Los fabricantes usan prefijos de espacio de nombres distintos (scan:, pwg:, ninguno…): se ignoran.
const tags = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([^<]*)</(?:[\\w-]+:)?${tag}>`, "g"))].map((m) => m[1].trim());
const section = (xml: string, tag: string) => xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`))?.[1];

export function parseCapabilities(xml: string): Caps {
  const sources: SourceCaps[] = [];
  for (const [id, tag] of [["Platen", "Platen"], ["Feeder", "Adf"]] as const) {
    const s = section(xml, tag);
    if (!s) continue;
    sources.push({
      id,
      // Blanco y negro (1 bit) no existe en JPEG, que es el formato que pedimos: no se ofrece.
      // eSCL 2.x los declara en cada origen; eSCL 0.98-1.0 (HP antiguas) en un bloque ColorProfiles común.
      colorModes: [...new Set(own(s, ["ColorMode", "ColorReference"]) ?? own(xml, ["ColorMode", "ColorReference"]) ?? [])].filter((m): m is ColorMode => m === "RGB24" || m === "Grayscale8"),
      resolutions: [...new Set(tags(section(s, "DiscreteResolutions") ?? s, "XResolution").map(Number))].filter((n) => n > 0).sort((a, b) => a - b),
      maxWidth: Number(tags(s, "MaxWidth")[0]) || A4.w,
      maxHeight: Number(tags(s, "MaxHeight")[0]) || A4.h,
      formats: [...new Set(own(s, ["DocumentFormat", "DocumentFormatExt"]) ?? own(xml, ["DocumentFormat", "DocumentFormatExt"]) ?? [])],
    });
  }
  return { model: tags(xml, "MakeAndModel")[0] ?? "", version: tags(xml, "Version")[0] ?? "2.0", sources };
}

const own = (xml: string, names: string[]) => {
  const found = names.flatMap((n) => tags(xml, n));
  return found.length ? found : undefined;
};

export const parseStatus = (xml: string) => ({ state: tags(xml, "State")[0] ?? "", adf: tags(xml, "AdfState")[0] ?? "" });

// Se pide con la misma versión de eSCL que anuncia el escáner; DocumentFormatExt solo existe desde la 2.1.
export function scanSettingsXml(o: { source: Source; color: ColorMode; dpi: number; width: number; height: number; version?: string }) {
  const version = /^\d+(\.\d+)?$/.test(o.version ?? "") ? o.version! : "2.0";
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>${version}</pwg:Version>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
      <pwg:Width>${Math.round(o.width)}</pwg:Width>
      <pwg:Height>${Math.round(o.height)}</pwg:Height>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>${o.source}</pwg:InputSource>
  <pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
${Number(version) >= 2.1 ? "  <scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>\n" : ""}  <scan:ColorMode>${o.color}</scan:ColorMode>
  <scan:XResolution>${o.dpi}</scan:XResolution>
  <scan:YResolution>${o.dpi}</scan:YResolution>
</scan:ScanSettings>`;
}

// Petición al escáner. Las rutas se resuelven contra su URL configurada y nunca salen de ese origen.
type CallInit = { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal; timeout?: number };
// http nativo y no fetch: el servidor web de algunas HP (p. ej. Officejet Pro 8600) rechaza los POST/PUT de fetch (409/400)
// y sí acepta los de http con Content-Length y conexión nueva. No sigue redirecciones; limita el tamaño de la respuesta.
function rawRequest(url: URL, init: CallInit, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const body = init.body === undefined ? undefined : Buffer.from(init.body);
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      { method: init.method ?? "GET", agent: false, signal, headers: { ...init.headers, ...(body ? { "Content-Length": String(body.length) } : {}) } },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES + 1024 * 1024) req.destroy(new Error("Respuesta demasiado grande"));
          else chunks.push(c);
        });
        res.on("end", () => {
          const status = res.statusCode ?? 502;
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
          resolve(new Response([204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks)), { status: status < 200 ? 502 : status, headers }));
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function call(s: Scanner, path: string | URL, init: CallInit = {}) {
  const url = new URL(path, s.base.href + "/");
  if (url.origin !== s.base.origin) throw new AppError("El escáner respondió con una dirección no permitida.", 502);
  const signals = [AbortSignal.timeout(init.timeout ?? 8000), ...(init.signal ? [init.signal] : [])];
  try {
    return await rawRequest(url, init, AbortSignal.any(signals));
  } catch {
    if (init.signal?.aborted) throw new AppError("Escaneo cancelado.", 499);
    throw new AppError(`No se puede conectar con «${s.name}». Comprueba que la impresora está encendida y en la red.`, 502);
  }
}
const xmlOf = async (s: Scanner, path: string, signal?: AbortSignal) => {
  const r = await call(s, path, { signal });
  if (!r.ok) throw new AppError(`«${s.name}» no responde como escáner de red (eSCL, ${r.status}).`, 502);
  return r.text();
};

export async function probe(s: Scanner) {
  try {
    const [caps, status] = await Promise.all([xmlOf(s, "ScannerCapabilities").then(parseCapabilities), xmlOf(s, "ScannerStatus").then(parseStatus)]);
    return { id: s.id, name: s.name, online: true, model: caps.model, state: status.state, adf: status.adf, sources: caps.sources };
  } catch (e) {
    return { id: s.id, name: s.name, online: false, error: (e as Error).message, sources: [] as SourceCaps[] };
  }
}

// Une las páginas (JPEG o PNG) en un PDF; cada página mide lo mismo que el papel escaneado.
export async function imagesToPdf(pages: Buffer[], dpi: number): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false, info: { Title: "Documento escaneado" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
  for (const page of pages) {
    const meta = await sharp(page, { limitInputPixels: 80_000_000 }).metadata();
    if (!["jpeg", "png"].includes(meta.format ?? "") || !meta.width || !meta.height) throw new AppError("El escáner devolvió una página que no es una imagen válida.", 502);
    const w = (meta.width / dpi) * 72,
      h = (meta.height / dpi) * 72;
    doc.addPage({ size: [w, h], margin: 0 });
    doc.image(page, 0, 0, { width: w, height: h });
  }
  doc.end();
  return done;
}

export type ScanOptions = { source: Source; color: ColorMode; dpi: number };
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const abort = () => (clearTimeout(t), reject(new AppError("Escaneo cancelado.", 499)));
    const t = setTimeout(() => (signal.removeEventListener("abort", abort), resolve()), ms);
    signal.addEventListener("abort", abort, { once: true });
  });

// Escaneo completo: comprueba el estado, crea el trabajo en la impresora y recoge página a página.
export async function scan(s: Scanner, o: ScanOptions, signal: AbortSignal, onPage: (n: number) => void): Promise<Buffer> {
  const caps = parseCapabilities(await xmlOf(s, "ScannerCapabilities", signal));
  const src = caps.sources.find((x) => x.id === o.source);
  if (!src) throw new AppError(o.source === "Feeder" ? "Este escáner no tiene alimentador automático." : "Este escáner no tiene cristal.", 400);
  if (!src.colorModes.includes(o.color)) throw new AppError("El escáner no admite ese modo de color.", 400);
  if (src.resolutions.length && !src.resolutions.includes(o.dpi)) throw new AppError(`Resolución no admitida. Usa ${src.resolutions.join(", ")} ppp.`, 400);
  if (src.formats.length && !src.formats.some((f) => f === "image/jpeg")) throw new AppError("El escáner no entrega imágenes JPEG por eSCL.", 400);
  const status = parseStatus(await xmlOf(s, "ScannerStatus", signal));
  if (status.state && status.state !== "Idle") throw new AppError(`«${s.name}» está ocupado. Espera a que termine e inténtalo otra vez.`, 409);
  if (o.source === "Feeder" && status.adf === "ScannerAdfEmpty") throw new AppError("No hay papel en el alimentador. Coloca las hojas y vuelve a intentarlo.", 409);

  const pages: Buffer[] = [];
  let bytes = 0;
  const add = (page: Buffer) => {
    bytes += page.length;
    pages.push(page);
    onPage(pages.length);
    if (pages.length > MAX_PAGES) throw new AppError(`Máximo ${MAX_PAGES} páginas por documento. Escanea en varias tandas.`, 413);
    if (bytes > MAX_BYTES) throw new AppError("El escaneo supera 20 MB. Usa escala de grises o menos resolución.", 413);
  };
  const region = { width: Math.min(A4.w, src.maxWidth), height: Math.min(A4.h, src.maxHeight) };
  // Las HP con su protocolo propio (LEDM) a menudo anuncian eSCL pero rechazan los trabajos (409): se usa el suyo.
  const ledm = await call(s, "/Scan/ScanCaps.xml", { signal }).then((r) => (r.body?.cancel(), r.ok), () => false);
  await (ledm ? ledmPages : esclPages)(s, { ...o, ...region, version: caps.version }, signal, add);
  if (!pages.length) throw new AppError("El escáner no devolvió ninguna página. ¿Había papel?", 502);
  const pdf = await imagesToPdf(pages, o.dpi);
  if (pdf.length > MAX_BYTES) throw new AppError("El escaneo supera 20 MB. Usa escala de grises o menos resolución.", 413);
  return pdf;
}

type JobSettings = ScanOptions & { width: number; height: number; version: string };
type AddPage = (page: Buffer) => void;

// eSCL: se crea el trabajo y se pide NextDocument hasta que el escáner responde 404.
async function esclPages(s: Scanner, o: JobSettings, signal: AbortSignal, add: AddPage) {
  const created = await call(s, "ScanJobs", { method: "POST", headers: { "Content-Type": "text/xml" }, body: scanSettingsXml(o), signal, timeout: 30000 });
  if (created.status === 503 || created.status === 409) throw new AppError(`«${s.name}» está ocupado o rechazó el escaneo. Inténtalo en unos segundos.`, 409);
  const location = created.headers.get("location");
  if (created.status !== 201 || !location) throw new AppError(`«${s.name}» rechazó el escaneo (${created.status}).`, 502);
  const job = new URL(location, s.base);
  if (job.origin !== s.base.origin) throw new AppError("El escáner respondió con una dirección no permitida.", 502);
  let busyTries = 0;
  try {
    for (;;) {
      const r = await call(s, `${job.pathname.replace(/\/+$/, "")}/NextDocument`, { signal, timeout: 180000 });
      if (r.status === 404) break; // no quedan páginas
      if (r.status === 503 && busyTries++ < 60) {
        await r.body?.cancel();
        await sleep(1000, signal);
        continue;
      }
      if (!r.ok) {
        await r.body?.cancel();
        if (r.status === 409 || r.status === 410) throw new AppError("El escáner canceló el trabajo (¿atasco o tapa abierta?).", 502);
        throw new AppError(`Error del escáner al entregar la página (${r.status}).`, 502);
      }
      add(Buffer.from(await r.arrayBuffer()));
      if (o.source === "Platen") break; // el cristal entrega una sola página por trabajo
    }
  } catch (e) {
    // Libera la impresora si algo falla o el usuario cancela.
    await call(s, job.pathname, { method: "DELETE", timeout: 5000 }).catch(() => {});
    throw e;
  }
}

// Mismo formato que el controlador libre de HP (HPLIP); sin ToneMap algunas HP cancelan la página.
export function ledmJobXml(o: JobSettings) {
  const gray = o.color === "Grayscale8";
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanJob xmlns:scan="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:fw="http://www.hp.com/schemas/imaging/con/firewall/2011/01/05">
  <scan:XResolution>${o.dpi}</scan:XResolution>
  <scan:YResolution>${o.dpi}</scan:YResolution>
  <scan:XStart>0</scan:XStart>
  <scan:YStart>0</scan:YStart>
  <scan:Width>${Math.round(o.width)}</scan:Width>
  <scan:Height>${Math.round(o.height)}</scan:Height>
  <scan:Format>Jpeg</scan:Format>
  <scan:CompressionQFactor>25</scan:CompressionQFactor>
  <scan:ColorSpace>${gray ? "Gray" : "Color"}</scan:ColorSpace>
  <scan:BitDepth>8</scan:BitDepth>
  <scan:InputSource>${o.source === "Feeder" ? "Adf" : "Platen"}</scan:InputSource>
${gray ? "  <scan:GrayRendering>NTSC</scan:GrayRendering>\n" : ""}  <scan:ToneMap><scan:Gamma>1000</scan:Gamma><scan:Brightness>1000</scan:Brightness><scan:Contrast>1000</scan:Contrast><scan:Highlite>179</scan:Highlite><scan:Shadow>25</scan:Shadow></scan:ToneMap>
  <scan:ContentType>Document</scan:ContentType>
</scan:ScanJob>`;
}

// LEDM (HP): se crea el trabajo, se consulta su estado y se descarga cada página cuando está lista.
async function ledmPages(s: Scanner, o: JobSettings, signal: AbortSignal, add: AddPage) {
  const created = await call(s, "/Scan/Jobs", { method: "POST", headers: { "Content-Type": "text/xml" }, body: ledmJobXml(o), signal, timeout: 30000 });
  const location = created.headers.get("location");
  await created.body?.cancel();
  if (created.status === 503 || created.status === 409) throw new AppError(`«${s.name}» está ocupado. Inténtalo en unos segundos.`, 409);
  if (created.status !== 201 || !location) throw new AppError(`«${s.name}» rechazó el escaneo (${created.status}).`, 502);
  const job = new URL(location, s.base);
  if (job.origin !== s.base.origin) throw new AppError("El escáner respondió con una dirección no permitida.", 502);
  const seen = new Set<string>();
  try {
    for (;;) {
      const r = await call(s, job.pathname, { signal, timeout: 30000 });
      if (!r.ok) throw new AppError(`Error del escáner al consultar el trabajo (${r.status}).`, 502);
      const xml = await r.text();
      const state = tags(xml, "JobState")[0] ?? "";
      const pre = section(xml, "PreScanPage");
      const url = pre && tags(pre, "PageState")[0] === "ReadyToUpload" ? tags(pre, "BinaryURL")[0] : undefined;
      if (url && !seen.has(url)) {
        seen.add(url);
        const page = await call(s, url, { signal, timeout: 180000 });
        if (!page.ok) throw new AppError(`Error del escáner al entregar la página (${page.status}).`, 502);
        add(Buffer.from(await page.arrayBuffer()));
        if (o.source === "Platen") return;
        continue;
      }
      if (state === "Completed") return;
      if (state === "Canceled" || state === "Aborted") throw new AppError("El escáner canceló el trabajo (¿atasco o tapa abierta?).", 502);
      await sleep(500, signal);
    }
  } catch (e) {
    const body = `<?xml version="1.0" encoding="UTF-8"?><j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30"><j:JobUrl>${job.pathname}</j:JobUrl><j:JobState>Canceled</j:JobState></j:Job>`;
    await call(s, job.pathname, { method: "PUT", headers: { "Content-Type": "text/xml" }, body, timeout: 5000 }).catch(() => {});
    throw e;
  }
}

// Trabajos en memoria del proceso web: sin archivos temporales. Un escáner solo atiende un trabajo a la vez.
// shortcut: los trabajos viven en memoria de un único proceso web; con varias réplicas habría que guardarlos en Redis.
type Job = { id: string; userId: string; scannerId: string; state: "scanning" | "done" | "failed" | "cancelled"; pages: number; error?: string; pdf?: Buffer; ctrl: AbortController; at: number };
const jobs = new Map<string, Job>();
const TTL = 10 * 60 * 1000;
const sweep = () => {
  for (const [id, j] of jobs) if (j.state !== "scanning" && Date.now() - j.at > TTL) jobs.delete(id);
};

export function startScan(s: Scanner, o: ScanOptions, userId: string) {
  sweep();
  if ([...jobs.values()].some((j) => j.scannerId === s.id && j.state === "scanning")) throw new AppError(`«${s.name}» ya está escaneando. Espera a que termine.`, 409);
  const job: Job = { id: randomUUID(), userId, scannerId: s.id, state: "scanning", pages: 0, ctrl: new AbortController(), at: Date.now() };
  jobs.set(job.id, job);
  // Tope de 10 minutos por si la impresora deja el trabajo colgado.
  const signal = AbortSignal.any([job.ctrl.signal, AbortSignal.timeout(10 * 60 * 1000)]);
  scan(s, o, signal, (n) => (job.pages = n))
    .then((pdf) => Object.assign(job, { state: "done", pdf, at: Date.now() }))
    .catch((e: Error) => Object.assign(job, { state: job.ctrl.signal.aborted ? "cancelled" : "failed", error: e.message, at: Date.now() }));
  return job.id;
}

export function getJob(id: string, userId: string) {
  const j = jobs.get(id);
  if (!j || j.userId !== userId) throw new AppError("Escaneo no encontrado.", 404);
  return j;
}
// El PDF se entrega una sola vez y se borra de memoria.
export function takePdf(id: string, userId: string) {
  const j = getJob(id, userId);
  if (j.state !== "done" || !j.pdf) throw new AppError("El escaneo aún no está listo.", 409);
  jobs.delete(id);
  return j.pdf;
}
export function cancelJob(id: string, userId: string) {
  const j = getJob(id, userId);
  if (j.state === "scanning") j.ctrl.abort();
}
