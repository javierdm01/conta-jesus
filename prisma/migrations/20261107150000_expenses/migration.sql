ALTER TABLE "Overhead" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN "documentId" TEXT;
ALTER TABLE "Overhead" ADD CONSTRAINT "Overhead_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Overhead_companyId_date_idx" ON "Overhead"("companyId", "date");
