import { currentUser } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { getJob } from "@/lib/escl";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await currentUser();
    const { state, pages, error } = getJob((await params).id, u.id);
    return Response.json({ state, pages, error });
  } catch (e) {
    return apiError(e);
  }
}
