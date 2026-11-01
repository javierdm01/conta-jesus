import {currentUser,admin,AppError} from "@/lib/access";
import {db} from "@/lib/db";
import {apiError} from "@/lib/api-error";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const u=await currentUser();admin(u);const doc=await db.document.findFirst({where:{id:(await params).id,companyId:u.companyId},include:{supplier:true,replacedBy:{select:{id:true}}}});if(!doc)throw new AppError("Documento no disponible.",404);return Response.json(doc,{headers:{"Cache-Control":"no-store"}})}catch(e){return apiError(e)}}
