-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "countId" TEXT;

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "expected" DECIMAL(14,4) NOT NULL,
    "counted" DECIMAL(14,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_requestKey_key" ON "StockCount"("requestKey");

-- CreateIndex
CREATE INDEX "StockCount_lotId_createdAt_idx" ON "StockCount"("lotId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_countId_idx" ON "StockMovement"("countId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_kind_check";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_kind_check"
  CHECK ("kind" IN ('RECEIVE','USE','RETURN','SUPPLIER_RETURN','RESERVE','RELEASE','COUNT_IN','COUNT_OUT'));
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_quantity_check" CHECK ("expected" >= 0 AND "counted" >= 0);
