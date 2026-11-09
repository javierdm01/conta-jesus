CREATE TABLE "VoiceLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceLog_companyId_createdAt_idx" ON "VoiceLog"("companyId", "createdAt");
