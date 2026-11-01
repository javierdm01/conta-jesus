import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./access";
export function apiError(e:unknown){
  if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});
  if(e instanceof z.ZodError)return Response.json({error:e.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join(" · ")},{status:400});
  if(e instanceof Prisma.PrismaClientKnownRequestError){if(e.code==="P2002")return Response.json({error:"Este registro ya existe. Revisa el número o si la operación ya se guardó."},{status:409});if(e.code==="P2034")return Response.json({error:"Otro usuario ha actualizado este registro. Actualiza la pantalla y vuelve a intentarlo."},{status:409})}
  console.error(e);return Response.json({error:"No se pudo completar la operación. Revisa la conexión con el servidor."},{status:500});
}
