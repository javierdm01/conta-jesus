import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { appOrigins } from "./app-origins";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: appOrigins(),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: { "/sign-in/email": { window: 60, max: 5 } },
  },
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
  databaseHooks: {
    session: {
      create: {
        // Una cuenta desactivada no puede abrir sesión nueva.
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { active: true },
          });
          if (user && !user.active) return false;
        },
      },
    },
  },
  plugins: [nextCookies()],
});
