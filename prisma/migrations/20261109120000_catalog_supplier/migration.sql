ALTER TABLE "CatalogItem" ADD COLUMN "supplier" TEXT NOT NULL DEFAULT '', ADD COLUMN "supplierRef" TEXT NOT NULL DEFAULT '';
CREATE INDEX "CatalogItem_companyId_supplier_supplierRef_idx" ON "CatalogItem"("companyId", "supplier", "supplierRef");
