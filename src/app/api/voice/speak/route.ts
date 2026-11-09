import { currentUser, checkOrigin } from "@/lib/access";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
// Texto → voz natural con el servicio interno (Piper). Si no está, el cliente usa la voz del navegador.
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    await currentUser();
    const url = process.env.TTS_URL;
    const text = String((await req.json()).text ?? "").slice(0, 600);
    if (!url || !text.trim()) return Response.json({ error: "Voz no disponible." }, { status: 503 });
    const r = await fetch(`${url}/speak`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r?.ok) return Response.json({ error: "Voz no disponible." }, { status: 503 });
    return new Response(await r.arrayBuffer(), { headers: { "Content-Type": "audio/wav" } });
  } catch (e) {
    return apiError(e);
  }
}
