import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/access";
import { documentDir, documentForUser } from "@/lib/document-access";
import { apiError } from "@/lib/api-error";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const u=await currentUser();const doc=await documentForUser(u,(await params).id);const bytes=await readFile(/* turbopackIgnore: true */ path.join(documentDir(),doc.filename));return new Response(bytes,{headers:{"Content-Type":doc.mime,"Content-Disposition":`attachment; filename="documento.${doc.filename.split(".").pop()}"`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}catch(e){return apiError(e)}}
