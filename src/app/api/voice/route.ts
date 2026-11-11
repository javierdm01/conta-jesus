import { limit } from "@/lib/rate-limit";
import { currentUser, checkOrigin } from "@/lib/access";
import { interpret, transcribe } from "@/lib/voice";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
// Acepta audio (multipart) o {text}. Solo propone: la acción se ejecuta al confirmar, por /api/operations.
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const u = await currentUser();
    limit(`voice:${u.id}`, 30);
    let text = "";
    let history: { who: string; text: string }[] = [];
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const f = (await req.formData()).get("audio");
      if (!(f instanceof File) || f.size === 0 || f.size > 5_000_000) return Response.json({ error: "Audio no válido." }, { status: 400 });
      // Los nombres de tus clientes ayudan a Whisper a escribirlos bien.
      const names = await db.customer.findMany({ where: { companyId: u.companyId }, select: { name: true }, orderBy: { name: "asc" }, take: 60 });
      text = await transcribe(u, f, `Registra horas, añade material, enchufe, cable, magnetotérmico, diferencial, luminaria, presupuesto, factura, albarán. ${names.map((x) => x.name).join(", ")}`);
      // Modo conversación: solo transcribir; el cliente decide si es un sí/no o una orden nueva.
      if (new URL(req.url).searchParams.has("stt")) return Response.json({ transcript: text });
    } else {
      const b = await req.json();
      text = String(b.text ?? "").slice(0, 500);
      history = Array.isArray(b.history) ? b.history.slice(-6).map((h: { who?: unknown; text?: unknown }) => ({ who: String(h.who ?? ""), text: String(h.text ?? "").slice(0, 400) })) : [];
    }
    if (!text.trim()) return Response.json({ transcript: "", message: "No he oído nada. Inténtalo de nuevo." });
    return Response.json(await interpret(u, text, history));
  } catch (e) {
    return apiError(e);
  }
}
