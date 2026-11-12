ALTER TABLE "CatalogItem" ADD COLUMN "supplierGrossPrice" DECIMAL(14,4),
ADD COLUMN "supplierPriceSource" TEXT NOT NULL DEFAULT '';
