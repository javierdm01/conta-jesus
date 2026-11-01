import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { currentUser,accessibleJob,AppError } from "@/lib/access";
import { apiError } from "@/lib/api-error";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const u=await currentUser();const doc=await db.document.findFirst({where:{id:(await params).id,companyId:u.companyId}});if(!doc)throw new AppError("Documento no encontrado.",404);if(u.role!=="ADMIN"){if(doc.uploaderId!==u.id||!doc.jobId)throw new AppError("Acceso no permitido.",403);await accessibleJob(u,doc.jobId)}const bytes=await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ path.resolve(/* turbopackIgnore: true */ process.env.DOCUMENT_DIR??"data/documents"),doc.filename));return new Response(bytes,{headers:{"Content-Type":doc.mime,"Content-Disposition":`attachment; filename="documento.${doc.filename.split(".").pop()}"`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}catch(e){return apiError(e)}}
