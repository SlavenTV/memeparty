ALTER TABLE "Template"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'upload',
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "reportCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Template_moderationStatus_active_idx" ON "Template"("moderationStatus", "active");
CREATE INDEX "Template_provider_active_idx" ON "Template"("provider", "active");

CREATE TABLE "TemplateReport" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "reporterKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "TemplateReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TemplateReport_templateId_reporterKey_key" ON "TemplateReport"("templateId", "reporterKey");
CREATE INDEX "TemplateReport_status_createdAt_idx" ON "TemplateReport"("status", "createdAt");
ALTER TABLE "TemplateReport" ADD CONSTRAINT "TemplateReport_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
