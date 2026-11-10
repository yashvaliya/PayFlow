-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REQUIRES_REVIEW';

-- AlterEnum
ALTER TYPE "WebhookStatus" ADD VALUE 'PROCESSING';

-- DropIndex
DROP INDEX IF EXISTS "ledger_journals_referenceType_referenceId_idx";

-- AlterTable
ALTER TABLE "idempotency_records" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "idempotency_records_userId_idx" ON "idempotency_records"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_journals_referenceType_referenceId_key" ON "ledger_journals"("referenceType", "referenceId");
