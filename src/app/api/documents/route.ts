import { randomUUID,createHash } from "node:crypto";
import { mkdir,writeFile,unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/lib/db";
import { currentUser,accessibleJob,AppError,checkOrigin } from "@/lib/access";
import { apiError } from "@/lib/api-error";
import { wakeOcr } from "@/lib/queue";
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
    const file=form.get("file"),kind=String(form.get("kind")),jobId=String(form.get("jobId")??""),saleId=String(form.get("saleId")??"");
    if(!(file instanceof File)||!file.size||file.size>20*1024*1024)throw new AppError("Selecciona un PDF o una imagen de hasta 20 MB.");
    if(!["PURCHASE","CREDIT","DELIVERY","SALE","PHOTO","EXPENSE","AUTO","ATTACHMENT"].includes(kind))throw new AppError("Tipo de documento no válido.");
    if(u.role!=="ADMIN"&&kind!=="DELIVERY"&&kind!=="PHOTO")throw new AppError("El técnico puede subir albaranes y fotografías.",403);
    if(jobId)await accessibleJob(u,jobId);else if(u.role!=="ADMIN")throw new AppError("Selecciona el trabajo.");
    if(kind==="ATTACHMENT"&&(!saleId||!(await db.sale.findFirst({where:{id:saleId,companyId:u.companyId},select:{id:true}}))))throw new AppError("Factura no encontrada.",404);
    let bytes=Buffer.from(await file.arrayBuffer());let mime:string,ext:string;
    if(bytes.subarray(0,5).toString()==="%PDF-"){mime="application/pdf";ext="pdf";if(kind==="PHOTO")throw new AppError("Selecciona una imagen para las fotografías.")}
    else{try{const info=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();if(!["jpeg","png","webp"].includes(info.format??""))throw Error();ext=info.format==="jpeg"?"jpg":info.format!;mime=`image/${info.format}`}catch{throw new AppError("Formato no admitido. Usa PDF, JPG, PNG o WebP.")}}
    // Fotos y justificantes se guardan reducidos (WebP, máx. 2000 px); los documentos para OCR solo se reducen si superan 3500 px.
    if(kind!=="ATTACHMENT"&&mime.startsWith("image/")){try{const small=kind==="PHOTO"||kind==="EXPENSE",info=await sharp(bytes).metadata();if(small||Math.max(info.width??0,info.height??0)>3500){const side=small?2000:3500,pipe=sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize({width:side,height:side,fit:"inside",withoutEnlargement:true}),out=await (small?pipe.webp({quality:80}):pipe.jpeg({quality:90})).toBuffer();if(!small||out.length<bytes.length){bytes=out;ext=small?"webp":"jpg";mime=small?"image/webp":"image/jpeg"}}}catch{}}
    const hash=createHash("sha256").update(bytes).digest("hex");if(await db.document.findUnique({where:{companyId_hash:{companyId:u.companyId,hash}}}))throw new AppError("Este archivo ya está registrado.",409);
    const filename=`${randomUUID()}.${ext}`,dir=path.resolve(/* turbopackIgnore: true */ process.env.DOCUMENT_DIR??"data/documents");await mkdir(dir,{recursive:true});saved=path.join(/* turbopackIgnore: true */ dir,filename);await writeFile(saved,bytes,{flag:"wx",mode:0o600});
    const result=await db.$transaction(async tx=>{const d=await tx.document.create({data:{companyId:u.companyId,uploaderId:u.id,jobId:jobId||null,kind,originalName:file.name.slice(0,200),filename,mime,hash,status:["PHOTO","EXPENSE","ATTACHMENT"].includes(kind)?"ARCHIVED":"QUEUED"}});if(kind==="ATTACHMENT")await tx.saleAttachment.create({data:{saleId,documentId:d.id}});await tx.audit.create({data:{companyId:u.companyId,userId:u.id,action:kind==="ATTACHMENT"?"Adjuntar archivo a factura":"Subir documento",entityId:d.id}});return {id:d.id}});saved=undefined;if(!["PHOTO","EXPENSE","ATTACHMENT"].includes(kind))wakeOcr();return Response.json(result,{status:201});
  }catch(e){if(saved)await unlink(saved).catch(()=>{});return apiError(e)}
}
