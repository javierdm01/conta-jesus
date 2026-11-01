import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
import { isAppOrigin } from "./app-origins";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError("Inicia sesión para continuar.", 401);
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { worker: true },
  });
  if (!user?.companyId)
    throw new AppError("Usuario sin empresa asignada.", 403);
  if (!user.active)
    throw new AppError("Esta cuenta está desactivada. Consulta con el responsable.", 403);
  return { ...user, companyId: user.companyId };
}
export type Actor = Awaited<ReturnType<typeof currentUser>>;
export function admin(user: Actor) {
  if (user.role !== "ADMIN")
    throw new AppError("Solo el responsable puede realizar esta acción.", 403);
}
export async function accessibleJob(user: Actor, id: string) {
  const job = await db.job.findFirst({
    where: {
      id,
      companyId: user.companyId,
      ...(user.role !== "ADMIN" ? { workerId: user.worker?.id ?? "none" } : {}),
    },
  });
  if (!job) throw new AppError("Trabajo no disponible.", 404);
  return job;
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!isAppOrigin(origin))
    throw new AppError("Origen de la petición no permitido.", 403);
}
