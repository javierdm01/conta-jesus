import { currentUser,admin } from "@/lib/access";
import {db} from "@/lib/db";
import {apiError} from "@/lib/api-error";
export async function GET(req:Request){try{const u=await currentUser();admin(u);const q=new URL(req.url).searchParams.get("q")?.trim().slice(0,100);if(!q||q.length<2)return Response.json([]);const rows=await db.document.findMany({where:{companyId:u.companyId,OR:[{text:{contains:q,mode:"insensitive"}},{lines:{some:{OR:[{reference:{contains:q,mode:"insensitive"}},{description:{contains:q,mode:"insensitive"}}]}}}]},select:{id:true,originalName:true,number:true,status:true},take:15,orderBy:{createdAt:"desc"}});return Response.json(rows,{headers:{"Cache-Control":"no-store"}})}catch(e){return apiError(e)}}
