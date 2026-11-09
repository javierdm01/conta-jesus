import { currentUser, admin, AppError } from '@/lib/access';
import { apiError } from '@/lib/api-error';
import { db } from '@/lib/db';
export async function GET(_req: Request, {params}:{params:Promise<{id:string}>}) {
 try {
  const user=await currentUser();admin(user);
  const sale=await db.sale.findFirst({where:{id:(await params).id,companyId:user.companyId},select:{id:true}});
  if(!sale) throw new AppError('Factura no encontrada.',404);
  const attachments=await db.saleAttachment.findMany({where:{saleId:sale.id},select:{createdAt:true,document:{select:{id:true,originalName:true,kind:true,number:true}}},orderBy:{createdAt:'desc'}});
  return Response.json(attachments,{headers:{'Cache-Control':'no-store'}});
 } catch(e){return apiError(e)}
}
