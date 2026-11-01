import { randomUUID,createHash } from "node:crypto";
import { mkdir,writeFile,unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/lib/db";
import { currentUser,accessibleJob,AppError,checkOrigin } from "@/lib/access";
import { apiError } from "@/lib/api-error";
export const runtime="nodejs";
export async function POST(req:Request){
  let saved:string|undefined;
  try{
    checkOrigin(req);const u=await currentUser();
    if(Number(req.headers.get("content-length")??0)>21*1024*1024)throw new AppError("El archivo no puede superar 20 MB.",413);
    // El lector limita también peticiones sin Content-Length, antes de formData.
    const reader=req.body?.getReader();if(!reader)throw new AppError("Falta el documento.");const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>21*1024*1024){await reader.cancel();throw new AppError("El archivo no puede superar 20 MB.",413)}chunks.push(value)}
    const form=await new Request(req.url,{method:"POST",headers:{"content-type":req.headers.get("content-type")??""},body:Buffer.concat(chunks)}).formData();
    const file=form.get("file"),kind=String(form.get("kind")),jobId=String(form.get("jobId")??"");
    if(!(file instanceof File)||!file.size||file.size>20*1024*1024)throw new AppError("Selecciona un PDF o una imagen de hasta 20 MB.");
    if(!["PURCHASE","DELIVERY","SALE","PHOTO"].includes(kind))throw new AppError("Tipo de documento no válido.");
    if(u.role!=="ADMIN"&&kind!=="DELIVERY"&&kind!=="PHOTO")throw new AppError("El técnico puede subir albaranes y fotografías.",403);
    if(jobId)await accessibleJob(u,jobId);else if(u.role!=="ADMIN")throw new AppError("Selecciona el trabajo.");
    const bytes=Buffer.from(await file.arrayBuffer());let mime:string,ext:string;
    if(bytes.subarray(0,5).toString()==="%PDF-"){mime="application/pdf";ext="pdf";if(kind==="PHOTO")throw new AppError("Selecciona una imagen para las fotografías.")}
    else{try{const info=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();if(!["jpeg","png","webp"].includes(info.format??""))throw Error();ext=info.format==="jpeg"?"jpg":info.format!;mime=`image/${info.format}`}catch{throw new AppError("Formato no admitido. Usa PDF, JPG, PNG o WebP.")}}
    const hash=createHash("sha256").update(bytes).digest("hex");if(await db.document.findUnique({where:{companyId_hash:{companyId:u.companyId,hash}}}))throw new AppError("Este archivo ya está registrado.",409);
    const filename=`${randomUUID()}.${ext}`,dir=path.resolve(/* turbopackIgnore: true */ process.env.DOCUMENT_DIR??"data/documents");await mkdir(dir,{recursive:true});saved=path.join(/* turbopackIgnore: true */ dir,filename);await writeFile(saved,bytes,{flag:"wx",mode:0o600});
    const result=await db.$transaction(async tx=>{const d=await tx.document.create({data:{companyId:u.companyId,uploaderId:u.id,jobId:jobId||null,kind,originalName:file.name.slice(0,200),filename,mime,hash,status:kind==="PHOTO"?"ARCHIVED":"QUEUED"}});await tx.audit.create({data:{companyId:u.companyId,userId:u.id,action:"Subir documento",entityId:d.id}});return {id:d.id}});saved=undefined;return Response.json(result,{status:201});
  }catch(e){if(saved)await unlink(saved).catch(()=>{});return apiError(e)}
}
