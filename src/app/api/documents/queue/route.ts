import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import {apiError} from "@/lib/api-error";
export async function GET(){try{const u=await currentUser();const rows=await db.document.findMany({where:{companyId:u.companyId,...(u.role!=="ADMIN"?{uploaderId:u.id,job:{workerId:u.worker?.id??"none"}}:{})},select:{id:true,status:true,error:true},orderBy:{createdAt:"desc"},take:200});return Response.json(rows,{headers:{"Cache-Control":"no-store"}})}catch(e){return apiError(e)}}
