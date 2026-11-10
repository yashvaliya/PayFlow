-- AlterTable: Add claimedAt lease timestamp to webhook_events
ALTER TABLE "webhook_events" ADD COLUMN "claimedAt" TIMESTAMP(3);
