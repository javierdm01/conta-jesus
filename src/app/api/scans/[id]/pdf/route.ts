import { currentUser } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { takePdf } from "@/lib/escl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Entrega el PDF escaneado una sola vez; después se borra de la memoria del servidor.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    const pdf = takePdf((await params).id, u.id);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
