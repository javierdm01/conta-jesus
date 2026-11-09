ALTER TABLE "Sale" ADD COLUMN "internalNotes" TEXT NOT NULL DEFAULT '';
CREATE TABLE "SaleAttachment" (
  "saleId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleAttachment_pkey" PRIMARY KEY ("saleId", "documentId"),
  CONSTRAINT "SaleAttachment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SaleAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SaleAttachment_documentId_idx" ON "SaleAttachment"("documentId");
