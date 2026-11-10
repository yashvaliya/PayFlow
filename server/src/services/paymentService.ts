import { Prisma, PaymentStatus, OrderStatus, RefundStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { payPalClient } from '../integrations/paypal/client.js';
import { PaymentStateMachine } from './stateMachine.js';
import { LedgerService } from './ledgerService.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export interface CreatePaymentOrderInput {
  items: Array<{ productId: string; quantity: number }>;
  customerEmail: string;
  customerName: string;
  idempotencyKey?: string;
}

export class PaymentService {
  /**
   * 1. Create Payment Order with Server-authoritative Pricing
   */
  public static async createPaymentOrder(input: CreatePaymentOrderInput) {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('At least one item must be provided in the order');
    }

    if (!input.customerEmail || !input.customerName) {
      throw new BadRequestError('Customer email and name are required');
    }

    // Authoritative product retrieval and price verification
    const productIds = input.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestError('One or more selected products are invalid or inactive');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalAmountMinor = 0;
    const orderItemsData: Array<{
      productId: string;
      quantity: number;
      unitAmountMinor: number;
      totalAmountMinor: number;
    }> = [];

    for (const item of input.items) {
      if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        throw new BadRequestError(`Invalid quantity: ${item.quantity}`);
      }
      const prod = productMap.get(item.productId)!;
      const lineTotal = prod.unitAmountMinor * item.quantity;
      totalAmountMinor += lineTotal;

      orderItemsData.push({
        productId: prod.id,
        quantity: item.quantity,
        unitAmountMinor: prod.unitAmountMinor,
        totalAmountMinor: lineTotal,
      });
    }

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const internalIdempotencyKey =
      input.idempotencyKey || `IDEM-ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Create Order and Payment inside database transaction
    const { order, payment } = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          totalAmountMinor,
          currency: 'USD',
          status: OrderStatus.PENDING,
          items: {
            create: orderItemsData,
          },
        },
      });

      const createdPayment = await tx.payment.create({
        data: {
          orderId: createdOrder.id,
          idempotencyKey: internalIdempotencyKey,
          amountMinor: totalAmountMinor,
          currency: 'USD',
          status: PaymentStatus.CREATED,
        },
      });

      await tx.paymentStateTransition.create({
        data: {
          paymentId: createdPayment.id,
          fromStatus: PaymentStatus.CREATED,
          toStatus: PaymentStatus.CREATED,
          reason: 'Initial payment record created with authoritative order totals',
          triggeredBy: 'SYSTEM',
        },
      });

      return { order: createdOrder, payment: createdPayment };
    });

    // Call PayPal Sandbox API to create order
    try {
      const paypalRes = await payPalClient.createOrder({
        orderNumber: order.orderNumber,
        amountMinor: totalAmountMinor,
        currency: 'USD',
        description: `Order ${order.orderNumber} for ${order.customerName}`,
        idempotencyKey: internalIdempotencyKey,
      });

      // Update payment with provider order ID and advance to PENDING_APPROVAL
      const updatedPayment = await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            providerOrderId: paypalRes.id,
            providerStatus: paypalRes.status,
            rawProviderData: paypalRes as any,
          },
        });

        return PaymentStateMachine.transition(
          tx,
          payment.id,
          PaymentStatus.PENDING_APPROVAL,
          {
            reason: `PayPal order generated: ${paypalRes.id}`,
            triggeredBy: 'PAYPAL_API',
          }
        );
      });

      const approvalLink = paypalRes.links?.find((l) => l.rel === 'approve')?.href;

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: payment.id,
        providerOrderId: paypalRes.id,
        totalAmountMinor,
        currency: 'USD',
        approvalUrl: approvalLink,
        status: updatedPayment.status,
      };
    } catch (err: any) {
      // Mark payment as FAILED if PayPal API call failed
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            failureReason: err.message,
          },
        });
        await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.FAILED, {
          reason: `PayPal order creation error: ${err.message}`,
        });
      });
      throw err;
    }
  }

  /**
   * 2. Capture and Settle Payment with Double-Entry Accounting
   */
  public static async capturePayment(params: {
    paymentId: string;
    idempotencyKey?: string;
    triggeredBy?: string;
  }) {
    const payment = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundError(`Payment "${params.paymentId}" not found`);
    }

    // Idempotent check: if already completed, return existing
    if (payment.status === PaymentStatus.COMPLETED) {
      return this.getPaymentById(payment.id);
    }

    if (
      payment.status !== PaymentStatus.PENDING_APPROVAL &&
      payment.status !== PaymentStatus.APPROVED &&
      payment.status !== PaymentStatus.CREATED
    ) {
      throw new BadRequestError(
        `Cannot capture payment in current status: "${payment.status}"`
      );
    }

    if (!payment.providerOrderId) {
      throw new BadRequestError('Payment does not have an associated PayPal Order ID');
    }

    // Call PayPal capture API
    const captureResult = await payPalClient.captureOrder({
      providerOrderId: payment.providerOrderId,
      idempotencyKey: params.idempotencyKey,
    });

    const captureItem =
      captureResult.purchase_units?.[0]?.payments?.captures?.[0];
    const providerCaptureId = captureItem?.id;
    const providerStatus = captureItem?.status || captureResult.status;

    if (providerStatus !== 'COMPLETED' && captureResult.status !== 'COMPLETED') {
      // Mark failed
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            providerStatus,
            failureReason: `Capture status not completed: ${providerStatus}`,
            rawProviderData: captureResult as any,
          },
        });
        await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.FAILED, {
          reason: `PayPal capture status: ${providerStatus}`,
          triggeredBy: params.triggeredBy || 'PAYPAL_API',
        });
      });

      throw new BadRequestError(`Payment capture was not completed by PayPal: ${providerStatus}`);
    }

    // Atomically complete payment, post double-entry ledger journals, and update order
    await prisma.$transaction(async (tx) => {
      // 1. Advance state machine
      await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.COMPLETED, {
        reason: `Payment captured successfully via PayPal (Capture ID: ${providerCaptureId})`,
        triggeredBy: params.triggeredBy || 'PAYPAL_API',
        metadata: { providerCaptureId, providerStatus },
      });

      // 2. Update payment details
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerCaptureId,
          providerStatus,
          rawProviderData: captureResult as any,
          completedAt: new Date(),
        },
      });

      // 3. Post Double-Entry Ledger Journal
      // Debit: PAYPAL_CLEARING, Credit: MERCHANT_PAYABLE
      await LedgerService.recordCaptureJournal(tx, {
        paymentId: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        providerCaptureId,
      });

      // 4. Update parent order to COMPLETED
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.COMPLETED },
      });
    });

    return this.getPaymentById(payment.id);
  }

  /**
   * 3. Process Full or Partial Refund
   */
  public static async refundPayment(params: {
    paymentId: string;
    amountMinor?: number;
    reason?: string;
    idempotencyKey?: string;
    triggeredBy?: string;
  }) {
    const payment = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      include: { refunds: true },
    });

    if (!payment) {
      throw new NotFoundError(`Payment "${params.paymentId}" not found`);
    }

    if (
      payment.status !== PaymentStatus.COMPLETED &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestError(
        `Only COMPLETED or PARTIALLY_REFUNDED payments can be refunded. Current status: "${payment.status}"`
      );
    }

    if (!payment.providerCaptureId) {
      throw new BadRequestError('Payment is missing PayPal Capture ID needed for refund');
    }

    const availableRefundable = payment.amountMinor - payment.refundedAmountMinor;
    if (availableRefundable <= 0) {
      throw new BadRequestError('This transaction is already fully refunded');
    }

    const requestedRefund = params.amountMinor ?? availableRefundable;

    if (requestedRefund <= 0 || !Number.isInteger(requestedRefund)) {
      throw new BadRequestError(`Invalid refund amount minor units: ${requestedRefund}`);
    }

    if (requestedRefund > availableRefundable) {
      throw new BadRequestError(
        `Requested refund amount (${requestedRefund}) exceeds remaining refundable balance (${availableRefundable})`
      );
    }

    const refundIdempotency =
      params.idempotencyKey || `IDEM-REF-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Call PayPal refund API
    const refundRes = await payPalClient.refundCapture({
      providerCaptureId: payment.providerCaptureId,
      amountMinor: requestedRefund,
      currency: payment.currency,
      reason: params.reason,
      idempotencyKey: refundIdempotency,
    });

    const isFullRefund = payment.refundedAmountMinor + requestedRefund >= payment.amountMinor;
    const targetStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

    // Atomically record refund, state transition, and ledger reversal journal
    const result = await prisma.$transaction(async (tx) => {
      // 1. Record refund in database
      const refundRecord = await tx.refund.create({
        data: {
          paymentId: payment.id,
          idempotencyKey: refundIdempotency,
          providerRefundId: refundRes.id,
          amountMinor: requestedRefund,
          currency: payment.currency,
          reason: params.reason,
          status: RefundStatus.COMPLETED,
          rawProviderData: refundRes as any,
        },
      });

      // 2. Update payment refunded amount
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmountMinor: { increment: requestedRefund },
        },
      });

      // 3. Advance state machine
      await PaymentStateMachine.transition(tx, payment.id, targetStatus, {
        reason: `Refund of ${requestedRefund} processed (PayPal Refund ID: ${refundRes.id})`,
        triggeredBy: params.triggeredBy || 'SYSTEM',
        metadata: {
          refundId: refundRecord.id,
          providerRefundId: refundRes.id,
          requestedRefund,
        },
      });

      // 4. Post Ledger Reversal Journal
      // Debit: MERCHANT_PAYABLE, Credit: PAYPAL_CLEARING
      await LedgerService.recordRefundJournal(tx, {
        refundId: refundRecord.id,
        amountMinor: requestedRefund,
        currency: payment.currency,
        providerRefundId: refundRes.id,
        reason: params.reason,
      });

      // 5. If fully refunded, mark Order as REFUNDED
      if (isFullRefund) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.REFUNDED },
        });
      }

      return refundRecord;
    });

    return {
      refund: result,
      payment: await this.getPaymentById(payment.id),
    };
  }

  /**
   * 4. Retrieve single payment with rich relational details
   */
  public static async getPaymentById(paymentId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
        refunds: {
          orderBy: { createdAt: 'desc' },
        },
        stateTransitions: {
          orderBy: { createdAt: 'desc' },
        },
        reconciliationItems: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!payment) {
      throw new NotFoundError(`Payment with ID "${paymentId}" not found`);
    }

    // Also fetch associated ledger journals
    const journals = await prisma.ledgerJournal.findMany({
      where: {
        OR: [
          { referenceType: 'PAYMENT_CAPTURE', referenceId: payment.id },
          {
            referenceType: 'PAYMENT_REFUND',
            referenceId: { in: payment.refunds.map((r) => r.id) },
          },
        ],
      },
      include: {
        entries: {
          include: { account: true },
        },
      },
      orderBy: { postedAt: 'desc' },
    });

    return {
      ...payment,
      ledgerJournals: journals,
    };
  }

  /**
   * 5. Paginated, filterable, and searchable list of payments
   */
  public static async listPayments(params: {
    page?: number;
    limit?: number;
    status?: PaymentStatus;
    search?: string;
    fromDate?: string;
    toDate?: string;
    sortBy?: 'createdAt' | 'amountMinor';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) {
        where.createdAt.gte = new Date(params.fromDate);
      }
      if (params.toDate) {
        where.createdAt.lte = new Date(params.toDate);
      }
    }

    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { providerOrderId: { contains: q, mode: 'insensitive' } },
        { providerCaptureId: { contains: q, mode: 'insensitive' } },
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { order: { customerEmail: { contains: q, mode: 'insensitive' } } },
        { order: { customerName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder || 'desc';

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          order: true,
          refunds: true,
        },
      }),
    ]);

    return {
      payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
