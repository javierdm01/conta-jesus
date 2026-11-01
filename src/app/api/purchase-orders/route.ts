import { currentUser } from "@/lib/access";
import { purchaseOrderState } from "@/lib/purchase-orders";
import { apiError } from "@/lib/api-error";
export const dynamic = "force-dynamic";
export async function GET() { try { return Response.json(await purchaseOrderState(await currentUser()), { headers: { "Cache-Control": "no-store" } }); } catch (e) { return apiError(e); } }
