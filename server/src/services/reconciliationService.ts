import { ReconciliationOutcome, ReconciliationRunStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { payPalClient } from '../integrations/paypal/client.js';
import { dollarsToCents, centsToDollars } from '../utils/money.js';
import { NotFoundError } from '../utils/errors.js';

export class ReconciliationService {
  /**
   * Executes a complete reconciliation run comparing internal payments against PayPal Sandbox ground truth
   */
  public static async runReconciliation(triggeredByUserId?: string, notes?: string) {
    const runNumber = `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const run = await prisma.reconciliationRun.create({
      data: {
        runNumber,
        status: ReconciliationRunStatus.RUNNING,
        triggeredByUserId,
        notes,
      },
    });

    // Fetch payments with a provider reference
    const payments = await prisma.payment.findMany({
      where: {
        providerOrderId: { not: null },
      },
      include: {
        order: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // reconcile recent active cohort
    });

    let matchedCount = 0;
    let mismatchedCount = 0;
    let pendingReviewCount = 0;

    for (const payment of payments) {
      let outcome: ReconciliationOutcome = ReconciliationOutcome.PENDING_REVIEW;
      let statusMatch = false;
      let amountMatch = false;
      let providerStatus: string | null = null;
      let providerAmountMinor: number | null = null;
      const details: any = {};

      try {
        if (payment.providerCaptureId) {
          // Verify against PayPal Capture API
          const captureData = await payPalClient.getCaptureDetails(payment.providerCaptureId);
          providerStatus = captureData.status;
          providerAmountMinor = captureData.amount?.value
            ? dollarsToCents(captureData.amount.value)
            : null;

          details.paypalCapture = captureData;

          // Status match logic
          if (
            (payment.status === PaymentStatus.COMPLETED && providerStatus === 'COMPLETED') ||
            (payment.status === PaymentStatus.REFUNDED && providerStatus === 'REFUNDED') ||
            (payment.status === PaymentStatus.PARTIALLY_REFUNDED && providerStatus === 'PARTIALLY_REFUNDED')
          ) {
            statusMatch = true;
          }

          // Amount match
          if (providerAmountMinor !== null && providerAmountMinor === payment.amountMinor) {
            amountMatch = true;
          }

          if (statusMatch && amountMatch) {
            outcome = ReconciliationOutcome.MATCHED;
            matchedCount++;
          } else if (!statusMatch && amountMatch) {
            outcome = ReconciliationOutcome.INTERNAL_MISMATCH;
            mismatchedCount++;
          } else {
            outcome = ReconciliationOutcome.PROVIDER_MISMATCH;
            mismatchedCount++;
          }
        } else if (payment.providerOrderId) {
          // Payment has order ID but no capture ID yet
          const orderData = await payPalClient.getOrderDetails(payment.providerOrderId);
          providerStatus = orderData.status;
          const val = orderData.purchase_units?.[0]?.amount?.value;
          providerAmountMinor = val ? dollarsToCents(val) : null;

          details.paypalOrder = orderData;

          if (payment.status === PaymentStatus.PENDING_APPROVAL && (providerStatus === 'CREATED' || providerStatus === 'SAVED')) {
            statusMatch = true;
            amountMatch = providerAmountMinor === payment.amountMinor;
            outcome = statusMatch && amountMatch ? ReconciliationOutcome.MATCHED : ReconciliationOutcome.INTERNAL_MISMATCH;
            if (outcome === ReconciliationOutcome.MATCHED) matchedCount++;
            else mismatchedCount++;
          } else if (providerStatus === 'APPROVED' && payment.status === PaymentStatus.PENDING_APPROVAL) {
            // Buyer approved in PayPal, awaiting capture in backend
            outcome = ReconciliationOutcome.PENDING_REVIEW;
            pendingReviewCount++;
          } else {
            outcome = ReconciliationOutcome.INTERNAL_MISMATCH;
            mismatchedCount++;
          }
        }
      } catch (err: any) {
        outcome = ReconciliationOutcome.PENDING_REVIEW;
        details.error = err.message;
        pendingReviewCount++;
      }

      await prisma.reconciliationItem.create({
        data: {
          runId: run.id,
          paymentId: payment.id,
          providerOrderId: payment.providerOrderId,
          providerCaptureId: payment.providerCaptureId,
          internalStatus: payment.status,
          providerStatus: providerStatus || 'UNKNOWN',
          internalAmountMinor: payment.amountMinor,
          providerAmountMinor,
          statusMatch,
          amountMatch,
          outcome,
          details,
        },
      });
    }

    const completedRun = await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: ReconciliationRunStatus.COMPLETED,
        totalChecked: payments.length,
        matchedCount,
        mismatchedCount,
        pendingReviewCount,
        completedAt: new Date(),
      },
      include: {
        items: {
          include: {
            payment: {
              include: { order: true },
            },
          },
        },
      },
    });

    return completedRun;
  }

  /**
   * Retrieves single reconciliation run by ID
   */
  public static async getRunById(runId: string) {
    const run = await prisma.reconciliationRun.findUnique({
      where: { id: runId },
      include: {
        triggeredBy: {
          select: { id: true, name: true, email: true },
        },
        items: {
          include: {
            payment: {
              include: { order: true },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundError(`Reconciliation run "${runId}" not found`);
    }

    return run;
  }

  /**
   * Lists reconciliation runs with pagination
   */
  public static async listRuns(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const [total, runs] = await Promise.all([
      prisma.reconciliationRun.count(),
      prisma.reconciliationRun.findMany({
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          triggeredBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return {
      runs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Generates CSV report string for a reconciliation run
   */
  public static async generateCsvReport(runId: string): Promise<string> {
    const run = await this.getRunById(runId);

    const headers = [
      'Item ID',
      'Payment ID',
      'Order Number',
      'PayPal Order ID',
      'PayPal Capture ID',
      'Internal Status',
      'Provider Status',
      'Status Match',
      'Internal Amount (USD)',
      'Provider Amount (USD)',
      'Amount Match',
      'Outcome',
      'Checked At',
    ];

    const rows = run.items.map((item) => [
      item.id,
      item.paymentId || 'N/A',
      item.payment?.order?.orderNumber || 'N/A',
      item.providerOrderId || 'N/A',
      item.providerCaptureId || 'N/A',
      item.internalStatus || 'N/A',
      item.providerStatus || 'N/A',
      item.statusMatch ? 'TRUE' : 'FALSE',
      item.internalAmountMinor !== null ? centsToDollars(item.internalAmountMinor) : 'N/A',
      item.providerAmountMinor !== null ? centsToDollars(item.providerAmountMinor) : 'N/A',
      item.amountMatch ? 'TRUE' : 'FALSE',
      item.outcome,
      item.createdAt.toISOString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}
