import { WebhookStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { WebhookService } from '../services/webhookService.js';

export class WebhookWorker {
  private static isRunning = false;
  private static pollTimer: NodeJS.Timeout | null = null;
  private static isProcessing = false;
  public static readonly MAX_ATTEMPTS = 5;
  private static readonly LEASE_TIMEOUT_MS = 120_000; // 2 minutes

  /**
   * Starts the persistent background PostgreSQL-backed webhook worker.
   */
  public static start(pollIntervalMs = 2000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run recovery and queue polling — wrap callback in error handler
    this.pollTimer = setInterval(() => {
      this.processNextBatch().catch((err) => {
        console.error('Webhook worker polling tick failed:', err);
      });
    }, pollIntervalMs);

    // Initial immediate tick
    this.processNextBatch().catch((err) => {
      console.error('Initial webhook worker tick failed:', err);
    });

    console.log(`Persistent PostgreSQL webhook worker started (interval: ${pollIntervalMs}ms, max retries: ${this.MAX_ATTEMPTS})`);
  }

  /**
   * Stops the background poller cleanly on server shutdown.
   */
  public static stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    console.log('Persistent webhook worker stopped');
  }

  /**
   * Triggers immediate event processing on arrival of a new webhook.
   */
  public static trigger(): void {
    setImmediate(() => {
      this.processNextBatch().catch((err) => {
        console.error('Webhook worker immediate trigger error:', err);
      });
    });
  }

  /**
   * Claims and processes available webhook events atomically from PostgreSQL.
   */
  public static async processNextBatch(limit = 10): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;
    try {
      for (let i = 0; i < limit; i++) {
        const claimed = await this.claimNextEvent();
        if (!claimed) break;

        await this.executeClaimedEvent(claimed);
        processedCount++;
      }
    } catch (err) {
      console.error('Webhook worker batch processing error:', err);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Atomic PostgreSQL event claiming using FOR UPDATE SKIP LOCKED.
   * Uses a dedicated `claimedAt` lease timestamp (NOT receivedAt) for stale-processing detection.
   * Sets claimedAt atomically in the same UPDATE to prevent concurrent workers from
   * reclaiming an actively processed event.
   */
  public static async claimNextEvent(): Promise<{
    id: string;
    eventId: string;
    eventType: string;
    payload: any;
    processingAttempts: number;
  } | null> {
    const leaseTimeoutMs = this.LEASE_TIMEOUT_MS;

    const claimedRows = await prisma.$queryRaw<Array<{
      id: string;
      eventId: string;
      eventType: string;
      payload: any;
      processingAttempts: number;
    }>>`
      UPDATE webhook_events
      SET status = 'PROCESSING'::"WebhookStatus",
          "processingAttempts" = "processingAttempts" + 1,
          "claimedAt" = NOW()
      WHERE id = (
        SELECT id
        FROM webhook_events
        WHERE (status = 'PENDING'::"WebhookStatus" AND "processingAttempts" < ${this.MAX_ATTEMPTS})
           OR (status = 'PROCESSING'::"WebhookStatus"
               AND "claimedAt" IS NOT NULL
               AND "claimedAt" < NOW() - (${leaseTimeoutMs} || ' milliseconds')::INTERVAL
               AND "processingAttempts" < ${this.MAX_ATTEMPTS})
        ORDER BY "receivedAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "eventId", "eventType", payload, "processingAttempts"
    `;

    return claimedRows[0] || null;
  }

  /**
   * Executes business logic for a claimed event.
   * NEVER marks events PROCESSED if payment matching or financial validation fails.
   */
  public static async executeClaimedEvent(event: {
    id: string;
    eventId: string;
    eventType: string;
    payload: any;
    processingAttempts: number;
  }): Promise<void> {
    try {
      await WebhookService.dispatchVerifiedPayload(event.eventType, event.payload);

      // Successfully processed: mark PROCESSED and record timestamp
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
          lastError: null,
        },
      });
    } catch (err: any) {
      console.error(`Webhook processing failure for event ${event.eventId} (attempt ${event.processingAttempts}/${this.MAX_ATTEMPTS}):`, err.message);

      const isTerminal = event.processingAttempts >= this.MAX_ATTEMPTS;

      // Never mark PROCESSED! Bounded retries: if attempts exhausted, mark FAILED, else revert to PENDING for retry
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: isTerminal ? WebhookStatus.FAILED : WebhookStatus.PENDING,
          lastError: err.message || 'Unknown processing error',
        },
      });
    }
  }
}
