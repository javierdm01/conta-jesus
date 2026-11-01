import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "./db";
import { admin, AppError, type Actor } from "./access";
import * as v from "./validation";

type Tx = Prisma.TransactionClient;
const audit = (tx: Tx, u: Actor, action: string, id: string) =>
  tx.audit.create({
    data: { companyId: u.companyId, userId: u.id, action, entityId: id },
  });
const serial = <T>(f: (tx: Tx) => Promise<T>) =>
  db.$transaction(f, { isolationLevel: "Serializable" });
const password = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(128);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Escribe un correo válido."));

// Un usuario de otra empresa se trata como inexistente.
async function member(u: Actor, id: string) {
  const target = await db.user.findFirst({
    where: { id, companyId: u.companyId },
    include: { accounts: { where: { providerId: "credential" } } },
  });
  if (!target) throw new AppError("Usuario no disponible.", 404);
  return target;
}

export async function userOperation(u: Actor, action: string, input: unknown) {
  admin(u);
  if (action === "user-create") {
    const d = z
      .object({
        name: v.name,
        email,
        password,
        role: z.enum(["TECHNICIAN", "ADMIN"]),
        workerId: v.id.optional(),
        hourlyCost: v.price.optional(),
        specialty: v.text,
      })
      .parse(input);
    if (await db.user.findUnique({ where: { email: d.email } }))
      throw new AppError("Ya existe una cuenta con ese correo.", 409);
    const hashed = await hashPassword(d.password);
    try {
      return await serial(async (tx) => {
        const id = randomUUID();
        await tx.user.create({
          data: {
            id,
            email: d.email,
            name: d.name,
            emailVerified: true,
            role: d.role,
            companyId: u.companyId,
            accounts: {
              create: {
                id: randomUUID(),
                accountId: id,
                providerId: "credential",
                password: hashed,
              },
            },
          },
        });
        if (d.workerId) {
          // Vincular a un trabajador que ya existía en Configuración.
          const w = await tx.worker.findFirst({
            where: {
              id: d.workerId,
              companyId: u.companyId,
              active: true,
              userId: null,
            },
          });
          if (!w)
            throw new AppError("Ese trabajador ya tiene acceso o no existe.");
          await tx.worker.update({ where: { id: w.id }, data: { userId: id } });
        } else if (d.role === "TECHNICIAN") {
          if (d.hourlyCost === undefined)
            throw new AppError(
              "Indica el coste laboral por hora del técnico.",
            );
          await tx.worker.create({
            data: {
              companyId: u.companyId,
              userId: id,
              name: d.name,
              hourlyCost: d.hourlyCost,
              specialty: d.specialty,
            },
          });
        }
        await audit(
          tx,
          u,
          d.role === "ADMIN" ? "Crear responsable" : "Crear técnico con acceso",
          id,
        );
        return { id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new AppError("Ya existe una cuenta con ese correo.", 409);
      throw e;
    }
  }
  if (action === "user-password") {
    const d = z.object({ id: v.id, password }).parse(input);
    const target = await member(u, d.id);
    if (!target.accounts.length)
      throw new AppError("La cuenta no usa contraseña.");
    const hashed = await hashPassword(d.password);
    return serial(async (tx) => {
      await tx.account.update({
        where: { id: target.accounts[0].id },
        data: { password: hashed },
      });
      await tx.session.deleteMany({ where: { userId: target.id } });
      await audit(tx, u, "Cambiar contraseña de usuario", target.id);
      return { ok: true };
    });
  }
  if (action === "user-active") {
    const d = z.object({ id: v.id, active: z.boolean() }).parse(input);
    if (d.id === u.id)
      throw new AppError("No puedes desactivar tu propia cuenta.");
    const target = await member(u, d.id);
    return serial(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { active: d.active } });
      if (!d.active) await tx.session.deleteMany({ where: { userId: target.id } });
      await audit(
        tx,
        u,
        d.active ? "Reactivar usuario" : "Desactivar usuario",
        target.id,
      );
      return { ok: true };
    });
  }
  throw new AppError("Acción no válida.", 404);
}
