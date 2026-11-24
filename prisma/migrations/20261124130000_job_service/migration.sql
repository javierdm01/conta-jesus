CREATE TABLE "JobService" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "requestKey" TEXT NOT NULL,
    CONSTRAINT "JobService_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobService_requestKey_key" ON "JobService"("requestKey");
CREATE INDEX "JobService_jobId_idx" ON "JobService"("jobId");
ALTER TABLE "JobService" ADD CONSTRAINT "JobService_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD COLUMN "serviceId" TEXT;
