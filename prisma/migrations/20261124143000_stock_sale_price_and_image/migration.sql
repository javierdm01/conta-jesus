-- Estos campos ya están presentes en el esquema de Prisma y son opcionales
-- o tienen un valor por defecto; no modifican los datos existentes.
ALTER TABLE "StockLot" ADD COLUMN "salePrice" DECIMAL(14,4),
                      ADD COLUMN "imageUrl" TEXT NOT NULL DEFAULT '';
