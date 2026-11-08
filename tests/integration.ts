import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,unlink,readdir} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {PrismaClient} from "@prisma/client";
import {hashPassword} from "better-auth/crypto";
import {request,chromium,type APIRequestContext} from "@playwright/test";

const db=new PrismaClient(),origin=process.env.BETTER_AUTH_URL??"http://localhost:3000",suffix=randomUUID().slice(0,8),password=randomUUID()+"-Prueba";
let companyId="";const files:string[]=[];
const contexts:APIRequestContext[]=[];
async function login(email:string){const c=await request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});contexts.push(c);const r=await c.post("/api/auth/sign-in/email",{data:{email,password}});assert.equal(r.status(),200,await r.text());return c}
async function post(c:APIRequestContext,action:string,data:object){const r=await c.post(`/api/operations/${action}`,{data:{...data,requestKey:randomUUID()}});assert.equal(r.status(),200,await r.text());return r.json()}
async function state(c:APIRequestContext){const r=await c.get("/api/state");assert.equal(r.status(),200);return r.json()}
async function image(label:string){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="950"><rect width="1800" height="950" fill="white"/><g font-family="Arial" font-size="40" fill="black"><text x="70" y="90">DOCUMENTO DE PRUEBA ${label}</text><text x="70" y="180">Proveedor PRUEBA B12345678</text><text x="70" y="270">Factura N: F-001</text><text x="70" y="360">Fecha: 18/10/2026</text><text x="70" y="450">Equipo climatizacion 1 ud 730,00 0 % 730,00</text><text x="70" y="540">Base imponible: 730,00</text><text x="70" y="630">Total IVA: 153,30</text></g></svg>`;return sharp(Buffer.from(svg)).png().toBuffer()}
async function upload(c:APIRequestContext,jobId:string,kind:string,label:string){const buffer=await image(label);const r=await c.post("/api/documents",{multipart:{kind,jobId,file:{name:`PRUEBA-${label}.png`,mimeType:"image/png",buffer}}});assert.equal(r.status(),201,await r.text());const {id}=await r.json();const doc=await db.document.findUniqueOrThrow({where:{id}});files.push(doc.filename);return {id,buffer}}
function pdfFixture(){
  const content="BT /F1 22 Tf 50 740 Td (DOCUMENTO DE PRUEBA PDF) Tj 0 -45 Td (Factura No PDF-001) Tj 0 -45 Td (Base imponible: 50,00) Tj 0 -45 Td (Total IVA: 10,50) Tj ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out="%PDF-1.4\n";const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`});const xref=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(out);
}
async function waitOcr(id:string){for(let i=0;i<80;i++){const doc=await db.document.findUniqueOrThrow({where:{id}});if(doc.status==="FAILED")throw Error(doc.error??"OCR fallido");if(doc.status==="REVIEW"){assert.match(doc.text,/PRUEBA/i);return doc}await new Promise(r=>setTimeout(r,750))}throw Error("OCR no completado. Inicia npm run worker.")}
async function main(){
  const anonymous=await request.newContext({baseURL:origin});contexts.push(anonymous);assert.equal((await anonymous.get("/api/state")).status(),401);
  const company=await db.company.create({data:{name:`EMPRESA DE PRUEBA ${suffix}`}});companyId=company.id;
  const hash=await hashPassword(password);
  async function user(role:string){const id=randomUUID(),email=`${role.toLowerCase()}-${suffix}@prueba.invalid`;await db.user.create({data:{id,name:`${role} PRUEBA`,email,emailVerified:true,companyId,role,accounts:{create:{id:randomUUID(),accountId:id,providerId:"credential",password:hash}}}});return {id,email}}
  const owner=await user("ADMIN"),tech=await user("TECHNICIAN"),a=await login(owner.email),t=await login(tech.email);
  const worker=await db.worker.create({data:{companyId,name:"Técnico PRUEBA",hourlyCost:30,userId:tech.id}});
  const customer=await post(a,"customer",{name:"Cliente PRUEBA",address:"Dirección de prueba"}),supplier=await post(a,"supplier",{name:"Proveedor PRUEBA",taxId:"B12345678"});
  const job=await post(a,"job",{name:"PRUEBA · Instalación de climatización",customerId:customer.id,service:"Climatización",workerId:worker.id,address:"Dirección de prueba",plannedAt:"2026-10-18"});
  const hidden=await post(a,"job",{name:"PRUEBA · Trabajo sin asignar",customerId:customer.id,service:"Otros"});
  await post(a,"jobUpdate",{id:job.id,name:job.name,customerId:customer.id,service:"Climatización",workerId:worker.id,address:"Dirección de prueba",plannedAt:"2026-10-18"});
  console.log("OK acceso, clientes, proveedores, trabajos y edición por HTTP");
  const delivery=await upload(a,job.id,"DELIVERY","ALBARAN");await waitOcr(delivery.id);
  assert.equal((await state(a)).jobs.find((j:{id:string})=>j.id===job.id).metrics.direct,"0.00");
  const oneLine={jobId:job.id,reference:"",description:"Material provisional PRUEBA",unit:"ud",quantity:"1",price:"1000",discount:"0"};
  await post(a,"review",{documentId:delivery.id,supplierId:supplier.id,number:`ALB-${suffix}`,date:"2026-10-18",net:"1000",tax:"210",reviewed:true,lines:[oneLine]});
  assert.equal((await state(a)).jobs.find((j:{id:string})=>j.id===job.id).metrics.direct,"1000.00");
  const duplicate=await a.post("/api/documents",{multipart:{kind:"DELIVERY",jobId:job.id,file:{name:"duplicado.png",mimeType:"image/png",buffer:delivery.buffer}}});assert.equal(duplicate.status(),409);
  const invoice=await upload(a,job.id,"PURCHASE","FACTURA");await waitOcr(invoice.id);
  const review={documentId:invoice.id,supplierId:supplier.id,number:`FAC-${suffix}`,date:"2026-10-18",net:"915",tax:"192.15",reviewed:true,supersedesId:delivery.id,lines:[{description:"Equipo PRUEBA",price:"730"},{description:"Tubería PRUEBA",price:"85"},{description:"Canaleta PRUEBA",price:"45"},{description:"Cable PRUEBA",price:"30"},{description:"Consumibles PRUEBA",price:"25"}].map(x=>({...oneLine,...x}))};
  const noReview=await a.post("/api/operations/review",{data:{...review,reviewed:false}});assert.equal(noReview.status(),400);
  const mismatch=await a.post("/api/operations/review",{data:{...review,net:"999"}});assert.equal(mismatch.status(),400);
  await post(a,"review",review);assert.equal((await state(a)).jobs.find((j:{id:string})=>j.id===job.id).metrics.direct,"915.00");
  const twice=await a.post("/api/operations/review",{data:review});assert.equal(twice.status(),409);
  console.log("OK OCR real, revisión obligatoria, sumas, archivo duplicado y sustitución sin doble coste");
  await post(t,"hours",{jobId:job.id,workerId:worker.id,date:"2026-10-18",startTime:"08:00",endTime:"16:00",activity:"Instalación",billable:true});
  await post(a,"workerUpdate",{id:worker.id,name:"Técnico PRUEBA",hourlyCost:"40",specialty:"Climatización"});
  await post(a,"cost",{jobId:job.id,type:"Desplazamiento",description:"Viaje PRUEBA",amount:"45"});
  const q=await post(a,"quote",{jobId:job.id,name:"Presupuesto PRUEBA",materials:"915",hours:"8",hourlyCost:"30",travel:"45",subcontract:"0",other:"0",overhead:"0",margin:"35"});assert.equal(q.net,"1846.15");await post(a,"approveQuote",{quoteId:q.id});
  const sale=await post(a,"sale",{jobId:job.id,number:`VENTA-${suffix}`,description:"Instalación PRUEBA",date:"2026-10-18",net:"1850",tax:"388.50",withholding:"0",collected:"0"});
  let result=await state(a);let metrics=result.jobs.find((j:{id:string})=>j.id===job.id).metrics;
  assert.equal(metrics.net,"1850.00");assert.equal(metrics.direct,"1200.00");assert.equal(metrics.gross,"650.00");assert.equal(metrics.margin,"35.1");assert.equal(metrics.collected,"0.00");assert.equal(metrics.pending,"2238.50");
  await post(a,"payment",{saleId:sale.id,collected:"2238.50"});metrics=(await state(a)).jobs.find((j:{id:string})=>j.id===job.id).metrics;assert.equal(metrics.gross,"650.00");assert.equal(metrics.pending,"0.00");assert.equal(metrics.collected,"2238.50");
  const denied=await t.post("/api/operations/sale",{data:{}});assert.equal(denied.status(),403);
  const otherJob=await t.post("/api/operations/hours",{data:{jobId:hidden.id,workerId:worker.id,date:"2026-10-18",startTime:"09:00",endTime:"10:00",activity:"Instalación",billable:true,requestKey:randomUUID()}});assert.equal(otherJob.status(),404);
  const technician=await state(t);assert.equal(technician.jobs.length,1);assert.equal(technician.jobs[0].metrics,undefined);assert.equal(technician.jobs[0].hours[0].hourlyCost,undefined);assert.equal(technician.workers[0].hourlyCost,undefined);assert.equal(technician.sales.length,0);
  const badOrigin=await a.post("/api/operations/company",{headers:{Origin:"https://origen-no-permitido.invalid"},data:{name:"Ataque"}});assert.equal(badOrigin.status(),403);
  const unsafe=await a.post("/api/documents",{multipart:{kind:"PURCHASE",file:{name:"factura.jpg",mimeType:"image/jpeg",buffer:Buffer.from("<html><script>alert(1)</script></html>")}}});assert.equal(unsafe.status(),400);
  console.log("OK horas, presupuesto, facturación, cobros y beneficio esperado de 650 €; roles y origen protegidos");
  if(process.env.TEST_PDF==="1"){
    const uploaded=await a.post("/api/documents",{multipart:{kind:"SALE",jobId:hidden.id,file:{name:"PRUEBA-PDF.pdf",mimeType:"application/pdf",buffer:pdfFixture()}}});assert.equal(uploaded.status(),201,await uploaded.text());const {id}=await uploaded.json();const doc=await db.document.findUniqueOrThrow({where:{id}});files.push(doc.filename);await waitOcr(id);await post(a,"sale",{jobId:hidden.id,number:`PDF-${suffix}`,description:"Factura PDF PRUEBA",date:"2026-10-18",net:"50",tax:"10.50",withholding:"0",collected:"0",documentId:id});assert.equal((await db.document.findUniqueOrThrow({where:{id}})).status,"CONFIRMED");console.log("OK PDF real: Poppler, Tesseract, revisión y vinculación a factura de cliente");
  }
  if(process.env.SKIP_BROWSER!=="1"){
    const root=path.join(process.env.LOCALAPPDATA??"", "ms-playwright");let executablePath=process.env.PLAYWRIGHT_BROWSER_PATH;
    if(!executablePath){try{const dirs=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d));if(dirs.length)executablePath=path.join(root,dirs.sort().at(-1)!,"chrome-win64","chrome.exe")}catch{}}
    const browser=await chromium.launch({headless:true,executablePath});
    try{const context=await browser.newContext({storageState:await a.storageState(),viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto(origin);await page.getByRole("heading",{name:"Todo bajo control."}).waitFor();await page.getByText("650,00",{exact:false}).first().waitFor();await mkdir("data/screenshots",{recursive:true});await page.screenshot({path:"data/screenshots/inicio-prueba-desktop.png",fullPage:true});await page.goto(`${origin}/trabajos/${job.id}`);await page.getByRole("heading",{name:job.name,exact:true}).waitFor();await page.getByRole("button",{name:"Registrar horas",exact:true}).first().click();await page.getByRole("dialog").waitFor();assert.equal(await page.getByLabel("Horas realizadas").count(),1);await page.getByRole("button",{name:"Cancelar",exact:true}).click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:"data/screenshots/trabajo-prueba-movil.png",fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.getByRole("button",{name:"Añadir",exact:true}).last().click();await page.getByRole("dialog").waitFor();assert.equal(await page.getByRole("button",{name:"Fotografiar factura de compra",exact:true}).count(),1);await page.getByRole("button",{name:"Cerrar",exact:true}).click();await page.goto(`${origin}/beneficios`);await page.getByRole("heading",{name:"Beneficios",exact:true}).waitFor();await page.screenshot({path:"data/screenshots/beneficios-prueba-movil.png",fullPage:true});assert.deepEqual(errors,[]);console.log("OK navegador escritorio/móvil, expediente, formularios, botón Añadir y gráficos sin errores JS")}finally{await browser.close()}
  }
}
async function cleanup(){
  for(const c of contexts)await c.dispose();
  if(companyId){await db.$transaction(async tx=>{await tx.documentLine.deleteMany({where:{document:{companyId}}});await tx.cost.deleteMany({where:{companyId}});await tx.timeEntry.deleteMany({where:{companyId}});await tx.sale.deleteMany({where:{companyId}});await tx.quote.deleteMany({where:{companyId}});await tx.document.updateMany({where:{companyId},data:{supersedesId:null}});await tx.document.deleteMany({where:{companyId}});await tx.job.deleteMany({where:{companyId}});await tx.worker.deleteMany({where:{companyId}});await tx.user.deleteMany({where:{companyId}});await tx.customer.deleteMany({where:{companyId}});await tx.supplier.deleteMany({where:{companyId}});await tx.audit.deleteMany({where:{companyId}});await tx.company.delete({where:{id:companyId}})})}
  for(const filename of files)await unlink(path.join(path.resolve(process.env.DOCUMENT_DIR??"data/documents"),filename)).catch(()=>{});
  await db.$disconnect();console.log("Datos de prueba retirados de la base.");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(cleanup);
