import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
const db=new PrismaClient();
async function main(){
  const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.ADMIN_PASSWORD,name=process.env.ADMIN_NAME??"Responsable";
  if(!email||!password||password.length<12)throw new Error("Configura ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres) en el entorno.");
  const technician=process.argv.includes("--technician");
  if(await db.user.findUnique({where:{email}}))throw new Error("El usuario ya existe. No se ha cambiado su contraseña.");
  if(!technician&&await db.user.count({where:{role:"ADMIN"}}))throw new Error("Ya existe un responsable. El alta inicial está cerrada.");
  const hashed=await hashPassword(password);
  await db.$transaction(async tx=>{
    const company=(await tx.company.findFirst())??await tx.company.create({data:{name:process.env.COMPANY_NAME??"Mi empresa instaladora"}});
    if(technician&&!await tx.user.count({where:{role:"ADMIN"}}))throw new Error("Crea primero el responsable.");
    const id=randomUUID();await tx.user.create({data:{id,email,name,emailVerified:true,role:technician?"TECHNICIAN":"ADMIN",companyId:company.id,accounts:{create:{id:randomUUID(),accountId:id,providerId:"credential",password:hashed}}}});
    if(technician){const cost=process.env.WORKER_HOURLY_COST;if(!cost||!/^\d+(\.\d{1,4})?$/.test(cost))throw new Error("Configura WORKER_HOURLY_COST con el coste real por hora del técnico.");await tx.worker.create({data:{companyId:company.id,userId:id,name,hourlyCost:cost}})}
    await tx.audit.create({data:{companyId:company.id,userId:id,action:technician?"Alta de técnico":"Alta inicial de responsable",entityId:id}});
  });console.log(technician?"Técnico creado. Asígnale trabajos desde la aplicación.":"Responsable creado. Ya puedes iniciar sesión.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
