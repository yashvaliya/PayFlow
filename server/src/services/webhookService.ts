import { WebhookStatus, PaymentStatus, RefundStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { payPalClient } from '../integrations/paypal/client.js';
import { PaymentStateMachine } from './stateMachine.js';
import { LedgerService } from './ledgerService.js';
import { dollarsToCents } from '../utils/money.js';

export class WebhookService {
  /**
   * Durable acceptance and deduplication of webhook event.
   * Fails closed if signature verification does not succeed.
   */
  public static async receiveAndQueueWebhook(params: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer | string;
    parsedBody: any;
  }) {
    const event = params.parsedBody;
    const eventId = event?.id;

    if (!eventId) {
      throw new Error('Received webhook payload without an event id');
    }

    // 1. Signature Verification - FAILS CLOSED
    const authAlgo = String(params.headers['paypal-auth-algo'] || '');
    const certUrl = String(params.headers['paypal-cert-url'] || '');
    const transmissionId = String(params.headers['paypal-transmission-id'] || '');
    const transmissionSig = String(params.headers['paypal-transmission-sig'] || '');
    const transmissionTime = String(params.headers['paypal-transmission-time'] || '');

    const isVerified = await payPalClient.verifyWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookId: '',
      eventBody: event,
    });

    if (!isVerified) {
      console.warn(`Webhook signature verification failed for event ${eventId}`);
      throw new Error('Webhook signature verification failed');
    }

    // 2. Durable deduplication: check if event is already persisted
    const existing = await prisma.webhookEvent.findUnique({
      where: { eventId },
    });

    if (existing) {
      return {
        event: existing,
        duplicate: true,
        status: existing.status,
      };
    }

    // 3. Persist event durably with PENDING status (with race-condition catch for concurrent delivery)
    let createdEvent;
    try {
      createdEvent = await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: event.event_type || 'UNKNOWN',
          resourceType: event.resource_type || null,
          summary: event.summary || null,
          payload: event,
          status: WebhookStatus.PENDING,
        },
      });
    } catch (createErr: any) {
      if (createErr.code === 'P2002') {
        const raceExisting = await prisma.webhookEvent.findUnique({
          where: { eventId },
        });
        return {
          event: raceExisting!,
          duplicate: true,
          status: raceExisting?.status || WebhookStatus.PENDING,
        };
      }
      throw createErr;
    }

    // 4. Trigger asynchronous background processing
    setImmediate(() => {
      this.processEventAsync(createdEvent.id).catch((err) => {
        console.error(`Background webhook processing error for ${eventId}:`, err);
      });
    });

    return {
      event: createdEvent,
      duplicate: false,
      status: WebhookStatus.PENDING,
    };
  }

  /**
   * Asynchronous event worker that settles payments and maintains ledger consistency.
   * Ensures idempotency: duplicate events will never create duplicate financial entries.
   */
  public static async processEventAsync(webhookRecordId: string) {
    const record = await prisma.webhookEvent.findUnique({
      where: { id: webhookRecordId },
    });

    if (!record || record.status === WebhookStatus.PROCESSED) {
      return;
    }

    try {
      await prisma.webhookEvent.update({
        where: { id: webhookRecordId },
        data: { processingAttempts: { increment: 1 } },
      });

      const payload = record.payload as any;
      const eventType = record.eventType;
      const resource = payload.resource || {};

      switch (eventType) {
        case 'PAYMENT.CAPTURE.COMPLETED': {
          await this.handlePaymentCaptureCompleted(resource);
          break;
        }

        case 'PAYMENT.CAPTURE.DENIED': {
          await this.handlePaymentCaptureDenied(resource);
          break;
        }

        case 'PAYMENT.CAPTURE.REFUNDED': {
          await this.handlePaymentCaptureRefunded(resource);
          break;
        }

        default: {
          await prisma.webhookEvent.update({
            where: { id: webhookRecordId },
            data: {
              status: WebhookStatus.IGNORED,
              processedAt: new Date(),
            },
          });
          return;
        }
      }

      await prisma.webhookEvent.update({
        where: { id: webhookRecordId },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
          lastError: null,
        },
      });
    } catch (err: any) {
      console.error(`Webhook processing failed for ${record.eventId}:`, err);
      await prisma.webhookEvent.update({
        where: { id: webhookRecordId },
        data: {
          status: WebhookStatus.FAILED,
          lastError: err.message,
        },
      });
    }
  }

  private static async handlePaymentCaptureCompleted(resource: any) {
    const captureId = resource.id;
    if (!captureId) return;

    let payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { providerCaptureId: captureId },
          { providerOrderId: resource.supplementary_data?.related_ids?.order_id },
        ],
      },
    });

    if (!payment) {
      console.warn(`Payment not found for capture webhook ${captureId}`);
      return;
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      // Already completed and settled; do not create duplicate ledger entries
      return;
    }

    // Validate amount and currency
    const webhookAmountMinor = dollarsToCents(resource.amount?.value || '0');
    const webhookCurrency = resource.amount?.currency_code || 'USD';

    if (webhookAmountMinor !== payment.amountMinor || webhookCurrency !== payment.currency) {
      console.error(
        `Webhook capture amount mismatch for payment ${payment.id}: expected ${payment.amountMinor} ${payment.currency}, got ${webhookAmountMinor} ${webhookCurrency}`
      );
      return;
    }

    // Atomically settle payment in transaction with lock verification
    await prisma.$transaction(async (tx) => {
      // Re-verify status within transaction to prevent race conditions
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status === PaymentStatus.COMPLETED) {
        return;
      }

      await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.COMPLETED, {
        reason: `Capture confirmed by PayPal Webhook (Capture ID: ${captureId})`,
        triggeredBy: 'WEBHOOK',
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerCaptureId: captureId,
          providerStatus: resource.status,
          completedAt: new Date(),
        },
      });

      // Post Double-Entry Journal (idempotently verified inside recordCaptureJournal)
      await LedgerService.recordCaptureJournal(tx, {
        paymentId: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        providerCaptureId: captureId,
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: 'COMPLETED' },
      });
    });
  }

  private static async handlePaymentCaptureDenied(resource: any) {
    const captureId = resource.id;
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { providerCaptureId: captureId },
          { providerOrderId: resource.supplementary_data?.related_ids?.order_id },
        ],
      },
    });

    if (payment && payment.status !== PaymentStatus.COMPLETED && payment.status !== PaymentStatus.REFUNDED) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status === PaymentStatus.COMPLETED || current.status === PaymentStatus.FAILED) {
          return;
        }

        await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.FAILED, {
          reason: `Capture denied by PayPal Webhook`,
          triggeredBy: 'WEBHOOK',
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            failureReason: `Capture denied by provider: ${resource.status_details?.reason || 'DENIED'}`,
          },
        });
      });
    }
  }

  private static async handlePaymentCaptureRefunded(resource: any) {
    const refundId = resource.id;
    if (!refundId) return;

    const captureId = resource.links?.find((l: any) => l.rel === 'up')?.href?.split('/').pop();

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { providerCaptureId: captureId },
          { refunds: { some: { providerRefundId: refundId } } },
        ],
      },
      include: { refunds: true },
    });

    if (!payment) return;

    // Check if refund record already exists (prevent duplicate ledger entries)
    const existingRefund = payment.refunds.find((r) => r.providerRefundId === refundId);
    if (existingRefund) {
      return;
    }

    const refundAmountMinor = dollarsToCents(resource.amount?.value || '0');
    if (refundAmountMinor <= 0) return;

    await prisma.$transaction(async (tx) => {
      // Re-verify existing refund within transaction
      const raceRefund = await tx.refund.findFirst({
        where: { providerRefundId: refundId },
      });
      if (raceRefund) return;

      const currentPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const available = currentPayment.amountMinor - currentPayment.refundedAmountMinor;
      if (refundAmountMinor > available) {
        console.error(`Webhook refund of ${refundAmountMinor} exceeds available ${available}`);
        return;
      }

      const isFullRefund = currentPayment.refundedAmountMinor + refundAmountMinor >= currentPayment.amountMinor;

      const refundRecord = await tx.refund.create({
        data: {
          paymentId: payment.id,
          idempotencyKey: `IDEM-WEBHOOK-REF-${refundId}`,
          providerRefundId: refundId,
          amountMinor: refundAmountMinor,
          currency: resource.amount?.currency_code || payment.currency,
          status: RefundStatus.COMPLETED,
          rawProviderData: resource,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmountMinor: { increment: refundAmountMinor },
        },
      });

      await PaymentStateMachine.transition(
        tx,
        payment.id,
        isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
        {
          reason: `Refund registered via Webhook: ${refundId}`,
          triggeredBy: 'WEBHOOK',
        }
      );

      // Post Ledger Reversal Journal
      await LedgerService.recordRefundJournal(tx, {
        refundId: refundRecord.id,
        amountMinor: refundAmountMinor,
        currency: payment.currency,
        providerRefundId: refundId,
      });

      if (isFullRefund) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: 'REFUNDED' },
        });
      }
    });
  }

  /**
   * Recovers any unhandled PENDING webhook events after application startup or crash.
   * Simple, reliable PostgreSQL-backed solution.
   */
  public static async recoverPendingEvents(): Promise<number> {
    const pendingEvents = await prisma.webhookEvent.findMany({
      where: {
        status: WebhookStatus.PENDING,
        processingAttempts: { lt: 5 },
      },
      take: 50,
      orderBy: { receivedAt: 'asc' },
    });

    if (pendingEvents.length > 0) {
      console.log(`Recovering ${pendingEvents.length} pending webhook events from PostgreSQL...`);
    }

    for (const evt of pendingEvents) {
      setImmediate(() => {
        this.processEventAsync(evt.id).catch((err) => {
          console.error(`Failed recovering webhook event ${evt.eventId}:`, err);
        });
      });
    }

    return pendingEvents.length;
  }

  /**
   * List webhook events with pagination
   */
  public static async listEvents(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const [total, events] = await Promise.all([
      prisma.webhookEvent.count(),
      prisma.webhookEvent.findMany({
        skip,
        take: limit,
        orderBy: { receivedAt: 'desc' },
      }),
    ]);

    return {
      events,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
