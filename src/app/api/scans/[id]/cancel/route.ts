import { currentUser, checkOrigin } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { cancelJob } from "@/lib/escl";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(req);
    const u = await currentUser();
    cancelJob((await params).id, u.id);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
