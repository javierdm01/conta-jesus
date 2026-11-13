import { currentUser } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { configuredScanners, probe } from "@/lib/escl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Escáneres configurados en SCANNERS, con su estado y capacidades reales (consultados por eSCL).
export async function GET() {
  try {
    await currentUser();
    return Response.json({ scanners: await Promise.all(configuredScanners().map(probe)) });
  } catch (e) {
    return apiError(e);
  }
}
