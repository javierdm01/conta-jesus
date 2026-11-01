import { currentUser } from "@/lib/access";
import { getState } from "@/lib/state";
import { apiError } from "@/lib/api-error";
export const dynamic="force-dynamic";
export async function GET(){try{return Response.json(await getState(await currentUser()),{headers:{"Cache-Control":"no-store"}})}catch(e){return apiError(e)}}
