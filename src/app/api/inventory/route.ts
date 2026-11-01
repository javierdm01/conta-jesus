import { currentUser } from "@/lib/access";
import { inventoryState } from "@/lib/inventory";
import { apiError } from "@/lib/api-error";
export const dynamic="force-dynamic";
export async function GET(){try{return Response.json(await inventoryState(await currentUser()),{headers:{"Cache-Control":"no-store"}})}catch(e){return apiError(e)}}
