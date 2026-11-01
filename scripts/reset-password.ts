import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
const db=new PrismaClient();
// Restablece la contraseña de una cuenta existente (la aplicación no tiene recuperación por correo).
async function main(){
  const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.NEW_PASSWORD;
  if(!email||!password||password.length<12)throw new Error("Configura ADMIN_EMAIL y NEW_PASSWORD (mínimo 12 caracteres) en el entorno.");
  const user=await db.user.findUnique({where:{email},include:{accounts:{where:{providerId:"credential"}}}});
  if(!user||!user.accounts.length)throw new Error("No existe una cuenta con ese correo.");
  const hashed=await hashPassword(password);
  await db.$transaction(async tx=>{
    await tx.account.update({where:{id:user.accounts[0].id},data:{password:hashed}});
    await tx.session.deleteMany({where:{userId:user.id}});
    if(user.companyId)await tx.audit.create({data:{companyId:user.companyId,userId:user.id,action:"Restablecimiento de contraseña desde el servidor",entityId:user.id}});
  });
  console.log("Contraseña cambiada y sesiones cerradas.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
