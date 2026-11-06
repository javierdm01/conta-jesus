ALTER TABLE "StockLot" ADD COLUMN "alias" TEXT NOT NULL DEFAULT '';
CREATE TABLE "SaleLine" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "lotId" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(14,4) NOT NULL,
  "price" DECIMAL(14,4) NOT NULL,
  "net" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");
CREATE INDEX "SaleLine_lotId_idx" ON "SaleLine"("lotId");
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
