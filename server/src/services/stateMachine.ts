import { PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { BadRequestError } from '../utils/errors.js';

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.CREATED]: [
    PaymentStatus.PENDING_APPROVAL,
    PaymentStatus.CANCELLED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.PENDING_APPROVAL]: [
    PaymentStatus.APPROVED,
    PaymentStatus.COMPLETED, // Direct capture can jump from pending approval
    PaymentStatus.CANCELLED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.APPROVED]: [
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.COMPLETED]: [
    PaymentStatus.REFUND_PENDING,
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.REFUND_PENDING]: [
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
    PaymentStatus.COMPLETED, // Reverted if refund fails
  ],
  [PaymentStatus.PARTIALLY_REFUNDED]: [
    PaymentStatus.REFUND_PENDING,
    PaymentStatus.PARTIALLY_REFUNDED, // Subsequent partial refund
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.FAILED]: [],
};

export class PaymentStateMachine {
  /**
   * Asserts whether a transition from `from` to `to` is legally permissible.
   */
  public static isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    if (from === to) return true; // Idempotent no-op
    const allowed = ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Safely transitions payment state within an active Prisma transaction or client.
   * Creates an auditable entry in `payment_state_transitions`.
   */
  public static async transition(
    tx: Prisma.TransactionClient,
    paymentId: string,
    toStatus: PaymentStatus,
    options: {
      reason?: string;
      triggeredBy?: string;
      metadata?: any;
    } = {}
  ) {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new BadRequestError(`Payment with ID "${paymentId}" not found`);
    }

    if (payment.status === toStatus) {
      // Idempotent re-entry
      return payment;
    }

    if (!this.isValidTransition(payment.status, toStatus)) {
      throw new BadRequestError(
        `Invalid payment state transition from ${payment.status} to ${toStatus}`
      );
    }

    // Never overwrite COMPLETED or REFUNDED with an older event like PENDING or CREATED
    if (
      (payment.status === PaymentStatus.COMPLETED ||
        payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
        payment.status === PaymentStatus.REFUNDED) &&
      (toStatus === PaymentStatus.CREATED ||
        toStatus === PaymentStatus.PENDING_APPROVAL ||
        toStatus === PaymentStatus.APPROVED)
    ) {
      console.warn(
        `Ignored out-of-order state transition for ${paymentId}: currently ${payment.status}, attempted ${toStatus}`
      );
      return payment;
    }

    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: toStatus,
        completedAt:
          toStatus === PaymentStatus.COMPLETED && !payment.completedAt
            ? new Date()
            : payment.completedAt,
      },
    });

    await tx.paymentStateTransition.create({
      data: {
        paymentId,
        fromStatus: payment.status,
        toStatus,
        reason: options.reason || `Transitioned to ${toStatus}`,
        triggeredBy: options.triggeredBy || 'SYSTEM',
        metadata: options.metadata || Prisma.JsonNull,
      },
    });

    return updatedPayment;
  }
}
