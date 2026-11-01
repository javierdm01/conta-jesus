import { currentUser,checkOrigin } from "@/lib/access";
import { operate } from "@/lib/operations";
import { apiError } from "@/lib/api-error";
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){try{checkOrigin(req);const u=await currentUser();const body=await req.text();if(body.length>300000)return Response.json({error:"Solicitud demasiado grande."},{status:413});return Response.json(await operate(u,(await params).action,JSON.parse(body)))}catch(e){return apiError(e)}}
