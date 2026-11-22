ALTER TABLE "Cost" ADD COLUMN "quantity" DECIMAL(14,4);
ALTER TABLE "Cost" ADD COLUMN "unit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Cost" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CatalogItem" ADD COLUMN "alias" TEXT NOT NULL DEFAULT '';

-- Las líneas que ya salían del almacén toman su cantidad, unidad y nota del movimiento.
UPDATE "Cost" c SET "quantity" = m."quantity", "unit" = l."unit", "notes" = m."notes"
FROM "StockMovement" m JOIN "StockLot" l ON l."id" = m."lotId"
WHERE c."stockMovementId" = m."id";
