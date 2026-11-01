-- DropForeignKey
ALTER TABLE "DocumentLine" DROP CONSTRAINT "DocumentLine_jobId_fkey";

-- AlterTable
ALTER TABLE "DocumentLine" ADD COLUMN     "lotId" TEXT,
ALTER COLUMN "jobId" DROP NOT NULL,
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "net" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Cost" ADD COLUMN     "stockMovementId" TEXT;

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "documentId" TEXT,
    "invoiceDocumentId" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "family" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "received" DECIMAL(14,4) NOT NULL,
    "onHand" DECIMAL(14,4) NOT NULL,
    "totalValue" DECIMAL(14,2),
    "remainingValue" DECIMAL(14,2),
    "location" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "minimum" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "amount" DECIMAL(14,2),
    "jobId" TEXT,
    "sourceId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_code_key" ON "StockLot"("code");

-- CreateIndex
CREATE INDEX "StockLot_companyId_createdAt_idx" ON "StockLot"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "StockLot_documentId_idx" ON "StockLot"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_requestKey_key" ON "StockMovement"("requestKey");

-- CreateIndex
CREATE INDEX "StockMovement_lotId_createdAt_idx" ON "StockMovement"("lotId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_jobId_idx" ON "StockMovement"("companyId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_lotId_jobId_key" ON "StockReservation"("lotId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Cost_stockMovementId_key" ON "Cost"("stockMovementId");

-- AddForeignKey
ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_invoiceDocumentId_fkey" FOREIGN KEY ("invoiceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

