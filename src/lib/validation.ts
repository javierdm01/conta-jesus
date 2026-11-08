import { z } from "zod";
const numeric = (min: number, max: number, scale: number) =>
  z
    .union([z.string(), z.number()])
    .transform(String)
    .refine(
      (v) =>
        /^\d+(\.\d+)?$/.test(v) &&
        Number.isFinite(Number(v)) &&
        Number(v) >= min &&
        Number(v) <= max &&
        (v.split(".")[1]?.length ?? 0) <= scale,
      `Introduce un número entre ${min} y ${max} con hasta ${scale} decimales.`,
    );
export const money = numeric(0, 999999999, 2),
  stockBalance = numeric(0, 9999999999, 4),
  quantity = numeric(0.0001, 999999, 4),
  price = numeric(0, 999999999, 4),
  percent = numeric(0, 100, 4);
export const documentQuantity = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) =>
      /^-?\d+(\.\d{1,4})?$/.test(v) &&
      Number.isFinite(Number(v)) &&
      Math.abs(Number(v)) >= 0.0001 &&
      Math.abs(Number(v)) <= 999999,
    "Cantidad de documento no válida.",
  );
export const hours = numeric(0.01, 24, 2),
  plannedHours = numeric(0.01, 99999, 2),
  margin = percent.refine(
    (v) => Number(v) < 100,
    "El margen debe ser inferior al 100 %.",
  );
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Fecha no válida",
  );
export const name = z.string().trim().min(1).max(200),
  text = z.string().trim().max(2000).default("");
export const id = z.string().min(1).max(100),
  requestKey = z.string().uuid();
export const expenseCategories = ["AUTONOMO", "SEGURO", "VEHICULO", "COMBUSTIBLE", "DIETAS", "OTHER"] as const;
export const statuses = [
  "Pendiente de presupuesto",
  "Presupuestado",
  "Aprobado",
  "Programado",
  "En ejecución",
  "Pendiente de materiales",
  "Finalizado",
  "Facturado",
  "Cerrado",
] as const;
export const services = [
  "Instalaciones eléctricas",
  "Reformas eléctricas",
  "Climatización",
  "Aerotermia",
  "Reparaciones",
  "Mantenimiento preventivo",
  "Mantenimiento correctivo",
  "Otros",
] as const;
export const line = z.object({
  jobId: id,
  reference: text,
  description: name,
  unit: z.enum(["ud", "m", "rollo", "pack", "kg", "l", "h"]),
  quantity: documentQuantity,
  price,
  discount: percent,
  financial: z.boolean().default(false),
});
