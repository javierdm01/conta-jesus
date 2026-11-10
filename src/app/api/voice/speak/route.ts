import { limit } from "@/lib/rate-limit";
import { currentUser, checkOrigin } from "@/lib/access";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
// Texto → voz natural con el servicio interno (Piper). Si no está, el cliente usa la voz del navegador.
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const u = await currentUser();
    limit(`tts:${u.id}`, 120);
    const url = process.env.TTS_URL;
    const body = await req.json();
    const text = String(body.text ?? "").slice(0, 600);
    const voice = /^[a-z0-9-]{1,20}$/.test(body.voice ?? "") ? body.voice : "davefx";
    const speed = Math.min(Math.max(Number(body.speed) || 1, 0.6), 1.6);
    if (!url || !text.trim()) return Response.json({ error: "Voz no disponible." }, { status: 503 });
    const r = await fetch(`${url}/speak`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice, speed }), signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r?.ok) return Response.json({ error: "Voz no disponible." }, { status: 503 });
    return new Response(await r.arrayBuffer(), { headers: { "Content-Type": "audio/wav" } });
  } catch (e) {
    return apiError(e);
  }
}
