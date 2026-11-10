import { currentUser, checkOrigin } from "@/lib/access";
import { operate } from "@/lib/operations";
import { recordVoice } from "@/lib/voice";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
// Solo las acciones que el asistente puede proponer; cada ejecución queda en el registro, a nombre de quien la confirmó.
const ALLOWED = new Set(["hours", "stock-move", "overhead", "job", "customer", "supplier", "status", "payment", "approveQuote"]);
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const u = await currentUser();
    const body = await req.json();
    const action = String(body.action ?? "");
    const summary = String(body.summary ?? "").slice(0, 300);
    if (!ALLOWED.has(action)) return Response.json({ error: "Acción no permitida por voz." }, { status: 400 });
    const t0 = Date.now();
    try {
      const result = await operate(u, action, body.payload);
      await recordVoice(u, { kind: "CONFIRM", transcript: String(body.text ?? ""), result: `${action}: ${summary}`, ms: Date.now() - t0 });
      return Response.json(result);
    } catch (e) {
      await recordVoice(u, { kind: "CONFIRM", transcript: String(body.text ?? ""), result: `${action}: ${summary}`, ms: Date.now() - t0, ok: false, error: (e as Error).message });
      throw e;
    }
  } catch (e) {
    return apiError(e);
  }
}
