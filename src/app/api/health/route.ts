import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
// Comprobación pública y mínima para Docker y el proxy: no revela datos ni versiones.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
