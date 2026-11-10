import { WebhookStatus, PaymentStatus, RefundStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { payPalClient } from '../integrations/paypal/client.js';
import { PaymentStateMachine } from './stateMachine.js';
import { LedgerService } from './ledgerService.js';
import { dollarsToCents } from '../utils/money.js';
import { WebhookWorker } from '../workers/webhookWorker.js';

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

    // 4. Trigger persistent PostgreSQL background worker immediately
    WebhookWorker.trigger();

    return {
      event: createdEvent,
      duplicate: false,
      status: WebhookStatus.PENDING,
    };
  }

  /**
   * Dispatches verified webhook payload to specific domain handlers.
   * Throws explicit errors when payment matching or financial validation fails,
   * guaranteeing the event is NEVER marked PROCESSED prematurely.
   */
  public static async dispatchVerifiedPayload(eventType: string, payload: any): Promise<void> {
    const resource = payload?.resource || {};

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
        // Unknown or unhandled event types are safely marked ignored by caller
        break;
      }
    }
  }

  private static async handlePaymentCaptureCompleted(resource: any) {
    const captureId = resource.id;
    if (!captureId) {
      throw new Error('Webhook payload missing resource.id for capture');
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { providerCaptureId: captureId },
          { providerOrderId: resource.supplementary_data?.related_ids?.order_id },
        ],
      },
    });

    if (!payment) {
      throw new Error(`Payment matching failed: No matching internal payment for capture ${captureId}`);
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      // Already completed and settled; idempotent success
      return;
    }

    // Validate amount and currency
    const webhookAmountMinor = dollarsToCents(resource.amount?.value || '0');
    const webhookCurrency = resource.amount?.currency_code || 'USD';

    if (webhookAmountMinor !== payment.amountMinor || webhookCurrency !== payment.currency) {
      // Preserve transaction details in REQUIRES_REVIEW and FAIL processing so it is not marked processed
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            providerCaptureId: captureId,
            providerStatus: resource.status,
            rawProviderData: resource,
            failureReason: `Webhook capture amount mismatch: expected ${payment.amountMinor} ${payment.currency}, received ${webhookAmountMinor} ${webhookCurrency}. Held for reconciliation review.`,
          },
        });
        if (payment.status !== PaymentStatus.REQUIRES_REVIEW) {
          await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.REQUIRES_REVIEW, {
            reason: `Webhook capture mismatch: expected ${payment.amountMinor} ${payment.currency}, received ${webhookAmountMinor} ${webhookCurrency}`,
            triggeredBy: 'WEBHOOK',
          });
        }
      });

      throw new Error(
        `Financial validation failed: Webhook capture mismatch for payment ${payment.id}: expected ${payment.amountMinor} ${payment.currency}, received ${webhookAmountMinor} ${webhookCurrency}`
      );
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

    if (!payment) {
      throw new Error(`Payment matching failed: No payment found for denied capture ${captureId}`);
    }

    if (payment.status !== PaymentStatus.COMPLETED && payment.status !== PaymentStatus.REFUNDED) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status === PaymentStatus.COMPLETED || current.status === PaymentStatus.FAILED) {
          return;
        }

        await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.FAILED, {
          reason: `PayPal Webhook reported capture denied (Capture ID: ${captureId})`,
          triggeredBy: 'WEBHOOK',
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            providerCaptureId: captureId,
            providerStatus: 'DENIED',
            failureReason: 'Payment capture denied by provider webhook',
            rawProviderData: resource,
          },
        });
      });
    }
  }

  private static async handlePaymentCaptureRefunded(resource: any) {
    const refundId = resource.id;
    if (!refundId) {
      throw new Error('Webhook refund payload missing resource.id');
    }

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

    if (!payment) {
      throw new Error(`Payment matching failed: No payment found for refund webhook ${refundId}`);
    }

    // Check if refund record already exists (prevent duplicate ledger entries)
    const existingRefund = payment.refunds.find((r) => r.providerRefundId === refundId);
    if (existingRefund && existingRefund.status === RefundStatus.COMPLETED) {
      return;
    }

    const refundAmountMinor = dollarsToCents(resource.amount?.value || '0');
    if (refundAmountMinor <= 0) {
      throw new Error(`Financial validation failed: Invalid refund amount in webhook: ${resource.amount?.value}`);
    }

    await prisma.$transaction(async (tx) => {
      // Re-verify existing refund within transaction
      const raceRefund = await tx.refund.findFirst({
        where: { providerRefundId: refundId },
      });
      if (raceRefund && raceRefund.status === RefundStatus.COMPLETED) return;

      const currentPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const available = currentPayment.amountMinor - currentPayment.refundedAmountMinor;
      if (refundAmountMinor > available) {
        throw new Error(
          `Financial validation failed: Webhook refund of ${refundAmountMinor} exceeds available balance ${available}`
        );
      }

      const isFullRefund = currentPayment.refundedAmountMinor + refundAmountMinor >= currentPayment.amountMinor;

      let refundRecord;
      if (raceRefund) {
        refundRecord = await tx.refund.update({
          where: { id: raceRefund.id },
          data: {
            status: RefundStatus.COMPLETED,
            rawProviderData: resource,
          },
        });
      } else {
        refundRecord = await tx.refund.create({
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
      }

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
        currency: resource.amount?.currency_code || payment.currency,
        providerRefundId: refundId,
        reason: 'Webhook confirmed refund',
      });
    });
  }

  public static async listEvents(params: { page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.webhookEvent.findMany({
        skip,
        take: limit,
        orderBy: { receivedAt: 'desc' },
      }),
      prisma.webhookEvent.count(),
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
