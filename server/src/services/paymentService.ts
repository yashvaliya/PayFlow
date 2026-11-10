import { Prisma, PaymentStatus, OrderStatus, RefundStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { payPalClient } from '../integrations/paypal/client.js';
import { PaymentStateMachine } from './stateMachine.js';
import { LedgerService } from './ledgerService.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { dollarsToCents } from '../utils/money.js';

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
   * Verifies provider order ID, capture ID, actual status, and exact amount/currency match.
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
    let captureResult;
    try {
      captureResult = await payPalClient.captureOrder({
        providerOrderId: payment.providerOrderId,
        idempotencyKey: params.idempotencyKey,
        expectedAmountMinor: payment.amountMinor,
        expectedCurrency: payment.currency,
      });
    } catch (captureErr: any) {
      // If order was already captured on PayPal (e.g. concurrent duplicate request or network retry),
      // fetch authoritative order details and verify rather than blindly failing
      if (captureErr.statusCode === 422 || captureErr.message?.includes('ORDER_ALREADY_CAPTURED')) {
        const orderDetails = await payPalClient.getOrderDetails(payment.providerOrderId).catch(() => null);
        if (orderDetails && (orderDetails.status === 'COMPLETED' || orderDetails.status === 'APPROVED')) {
          const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
          if (fresh && fresh.status === PaymentStatus.COMPLETED) {
            return this.getPaymentById(payment.id);
          }
        }
      }
      throw captureErr;
    }

    // 1. Verify Provider Order ID matches
    if (captureResult.id && captureResult.id !== payment.providerOrderId) {
      throw new BadRequestError(
        `PayPal Order ID mismatch: expected "${payment.providerOrderId}", received "${captureResult.id}"`
      );
    }

    // 2. Extract and verify capture item and ID
    const captureItem = captureResult.purchase_units?.[0]?.payments?.captures?.[0];
    const providerCaptureId = captureItem?.id;
    const providerStatus = captureItem?.status || captureResult.status;

    if (!providerCaptureId) {
      throw new BadRequestError('PayPal capture response is missing an authoritative capture ID');
    }

    // 3. Verify capture status confirmed
    if (providerStatus !== 'COMPLETED') {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            providerStatus,
            failureReason: `Capture status not completed by provider: ${providerStatus}`,
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

    // 4. Validate captured amount and currency against authoritative payment
    if (!captureItem.amount || !captureItem.amount.value || !captureItem.amount.currency_code) {
      throw new BadRequestError('PayPal capture response is missing amount or currency information');
    }

    const capturedAmountMinor = dollarsToCents(captureItem.amount.value);
    const capturedCurrency = captureItem.amount.currency_code;

    if (capturedAmountMinor !== payment.amountMinor || capturedCurrency !== payment.currency) {
      // Financial Integrity Rule: Never mark a provider-confirmed capture as FAILED.
      // Funds were captured by PayPal, so place in REQUIRES_REVIEW and preserve transaction details for reconciliation.
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            providerCaptureId,
            providerStatus,
            rawProviderData: captureResult as any,
            failureReason: `Capture amount or currency mismatch: expected ${payment.amountMinor} ${payment.currency}, received ${capturedAmountMinor} ${capturedCurrency}. Held for reconciliation review.`,
          },
        });
        await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.REQUIRES_REVIEW, {
          reason: `Capture mismatch: expected ${payment.amountMinor} ${payment.currency}, received ${capturedAmountMinor} ${capturedCurrency}`,
          triggeredBy: 'SYSTEM_VALIDATION',
          metadata: { providerCaptureId, providerStatus, capturedAmountMinor, capturedCurrency },
        });
      });

      throw new BadRequestError(
        `Capture amount or currency mismatch: expected ${payment.amountMinor} ${payment.currency}, received ${capturedAmountMinor} ${capturedCurrency}. Payment preserved under REQUIRES_REVIEW for reconciliation.`
      );
    }

    // 5. Atomically complete payment, post double-entry ledger journals, and update order
    await prisma.$transaction(async (tx) => {
      // Re-verify current status inside transaction to guard against concurrent duplicate capture
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      if (current.status === PaymentStatus.COMPLETED) {
        return; // Already settled concurrently, avoid duplicate ledger posting
      }

      // Advance state machine
      await PaymentStateMachine.transition(tx, payment.id, PaymentStatus.COMPLETED, {
        reason: `Payment captured successfully via PayPal (Capture ID: ${providerCaptureId})`,
        triggeredBy: params.triggeredBy || 'PAYPAL_API',
        metadata: { providerCaptureId, providerStatus, capturedAmountMinor, capturedCurrency },
      });

      // Update payment details
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerCaptureId,
          providerStatus,
          rawProviderData: captureResult as any,
          completedAt: new Date(),
        },
      });

      // Post Double-Entry Ledger Journal (PAYPAL_CLEARING Dr, MERCHANT_PAYABLE Cr)
      await LedgerService.recordCaptureJournal(tx, {
        paymentId: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        providerCaptureId,
      });

      // Update parent order to COMPLETED
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.COMPLETED },
      });
    });

    return this.getPaymentById(payment.id);
  }

  /**
   * 3. Process Full or Partial Refund
   * Enforces durable refund reservations before calling PayPal, verifies actual PayPal
   * refund response, prevents excess refunds across concurrent requests, and posts ledger entries only after confirmed refund.
   */
  public static async refundPayment(params: {
    paymentId: string;
    amountMinor?: number;
    reason?: string;
    idempotencyKey?: string;
    triggeredBy?: string;
  }) {
    const refundIdempotency =
      params.idempotencyKey || `IDEM-REF-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // 1. Atomically validate balance and DURABLY RESERVE the refund before invoking PayPal
    const reservation = await prisma.$transaction(async (tx) => {
      const [lockedPayment] = await tx.$queryRaw<Array<{
        id: string;
        orderId: string;
        amountMinor: number;
        refundedAmountMinor: number;
        currency: string;
        status: PaymentStatus;
        providerCaptureId: string | null;
      }>>`
        SELECT id, "orderId", "amountMinor", "refundedAmountMinor", currency, status, "providerCaptureId"
        FROM payments
        WHERE id = ${params.paymentId}
        FOR UPDATE
      `;

      if (!lockedPayment) {
        throw new NotFoundError(`Payment "${params.paymentId}" not found`);
      }

      if (
        lockedPayment.status !== PaymentStatus.COMPLETED &&
        lockedPayment.status !== PaymentStatus.PARTIALLY_REFUNDED &&
        lockedPayment.status !== PaymentStatus.REFUND_PENDING
      ) {
        throw new BadRequestError(
          `Only COMPLETED or PARTIALLY_REFUNDED payments can be refunded. Current status: "${lockedPayment.status}"`
        );
      }

      if (!lockedPayment.providerCaptureId) {
        throw new BadRequestError('Payment is missing PayPal Capture ID needed for refund');
      }

      // Check if refund with this idempotency key already exists
      const existingRefund = await tx.refund.findFirst({
        where: {
          paymentId: lockedPayment.id,
          idempotencyKey: refundIdempotency,
        },
      });

      if (existingRefund) {
        if (existingRefund.status === RefundStatus.COMPLETED) {
          return { type: 'REPLAY_COMPLETED' as const, lockedPayment, refund: existingRefund };
        }
        if (existingRefund.status === RefundStatus.PENDING) {
          return { type: 'REPLAY_PENDING' as const, lockedPayment, refund: existingRefund };
        }
      }

      // Calculate total reserved (PENDING) and already refunded (COMPLETED)
      const activeRefunds = await tx.refund.findMany({
        where: {
          paymentId: lockedPayment.id,
          status: { in: [RefundStatus.COMPLETED, RefundStatus.PENDING] },
        },
      });

      const totalCommittedOrReserved = activeRefunds.reduce((sum, r) => sum + r.amountMinor, 0);
      const availableRefundable = lockedPayment.amountMinor - totalCommittedOrReserved;

      if (availableRefundable <= 0) {
        throw new BadRequestError('This transaction is already fully refunded or has pending refund reservations');
      }

      const requestedRefund = params.amountMinor ?? availableRefundable;

      if (requestedRefund <= 0 || !Number.isInteger(requestedRefund)) {
        throw new BadRequestError(`Invalid refund amount minor units: ${requestedRefund}`);
      }

      if (requestedRefund > availableRefundable) {
        throw new BadRequestError(
          `Requested refund amount (${requestedRefund}) exceeds remaining unreserved refundable balance (${availableRefundable})`
        );
      }

      // DURABLE RESERVATION: Create refund record with PENDING status inside the transaction
      // This guarantees that any concurrent request will see this reservation and be prevented from over-refunding!
      const reservedRefund = await tx.refund.create({
        data: {
          paymentId: lockedPayment.id,
          idempotencyKey: refundIdempotency,
          amountMinor: requestedRefund,
          currency: lockedPayment.currency,
          reason: params.reason || null,
          status: RefundStatus.PENDING,
        },
      });

      return {
        type: 'NEW_RESERVATION' as const,
        lockedPayment,
        reservedRefund,
        requestedRefund,
      };
    });

    if (reservation.type === 'REPLAY_COMPLETED') {
      return {
        refund: reservation.refund,
        payment: await this.getPaymentById(reservation.lockedPayment.id),
      };
    }

    if (reservation.type === 'REPLAY_PENDING') {
      return {
        refund: reservation.refund,
        payment: await this.getPaymentById(reservation.lockedPayment.id),
        message: 'A refund for this request is currently in pending reservation status',
      };
    }

    const { lockedPayment, reservedRefund, requestedRefund } = reservation;

    // 2. Call PayPal refund API with durable reservation established
    let refundRes;
    try {
      refundRes = await payPalClient.refundCapture({
        providerCaptureId: lockedPayment.providerCaptureId!,
        amountMinor: requestedRefund,
        currency: lockedPayment.currency,
        reason: params.reason,
        idempotencyKey: refundIdempotency,
      });
    } catch (paypalError: any) {
      // Ambiguous / Network error: Maintain reservation in PENDING so concurrent requests cannot over-refund!
      await prisma.refund.update({
        where: { id: reservedRefund.id },
        data: {
          rawProviderData: {
            ambiguousError: paypalError.message,
            errorCode: paypalError.errorCode || 'PROVIDER_TIMEOUT_OR_ERROR',
            timestamp: new Date().toISOString(),
          },
        },
      });

      throw paypalError;
    }

    // 3. Inspect and handle PayPal provider response
    if (!refundRes || !refundRes.id) {
      await prisma.refund.update({
        where: { id: reservedRefund.id },
        data: {
          status: RefundStatus.FAILED,
          rawProviderData: refundRes as any,
        },
      });
      throw new BadRequestError('PayPal did not return a valid refund reference ID');
    }

    // Provider explicitly refused / failed the refund: release reservation by marking FAILED
    if (refundRes.status === 'FAILED') {
      await prisma.refund.update({
        where: { id: reservedRefund.id },
        data: {
          status: RefundStatus.FAILED,
          rawProviderData: refundRes as any,
        },
      });
      throw new BadRequestError(`PayPal refund was not completed: provider returned status "FAILED"`);
    }

    // Provider returned PENDING: keep reservation active in PENDING status, awaiting webhook confirmation
    if (refundRes.status === 'PENDING') {
      await prisma.$transaction(async (tx) => {
        await tx.refund.update({
          where: { id: reservedRefund.id },
          data: {
            providerRefundId: refundRes.id,
            status: RefundStatus.PENDING,
            rawProviderData: refundRes as any,
          },
        });
        await PaymentStateMachine.transition(tx, lockedPayment.id, PaymentStatus.REFUND_PENDING, {
          reason: `Refund pending provider confirmation (Refund ID: ${refundRes.id})`,
          triggeredBy: params.triggeredBy || 'PAYPAL_API',
        });
      });

      return {
        refund: await prisma.refund.findUniqueOrThrow({ where: { id: reservedRefund.id } }),
        payment: await this.getPaymentById(lockedPayment.id),
      };
    }

    // Validate confirmed refund amount and currency
    const confirmedRefundMinor = dollarsToCents(refundRes.amount?.value || '0');
    const confirmedCurrency = refundRes.amount?.currency_code || lockedPayment.currency;

    if (confirmedRefundMinor !== requestedRefund || confirmedCurrency !== lockedPayment.currency) {
      await prisma.refund.update({
        where: { id: reservedRefund.id },
        data: {
          status: RefundStatus.PENDING,
          rawProviderData: {
            error: 'Refund amount or currency mismatch with provider confirmation',
            refundRes: refundRes as any,
          },
        },
      });
      throw new BadRequestError(
        `PayPal refund amount or currency mismatch: requested ${requestedRefund} ${lockedPayment.currency}, confirmed ${confirmedRefundMinor} ${confirmedCurrency}`
      );
    }

    // 4. Atomically confirm refund, increment payment refunded amount, and post ledger reversal
    const finalRefund = await prisma.$transaction(async (tx) => {
      // Re-query current payment status
      const currentPayment = await tx.payment.findUniqueOrThrow({
        where: { id: lockedPayment.id },
      });

      const newRefundedTotal = currentPayment.refundedAmountMinor + confirmedRefundMinor;
      const isFullRefund = newRefundedTotal >= currentPayment.amountMinor;
      const targetStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

      // Update refund record to COMPLETED
      const updatedRefund = await tx.refund.update({
        where: { id: reservedRefund.id },
        data: {
          providerRefundId: refundRes.id,
          amountMinor: confirmedRefundMinor,
          currency: confirmedCurrency,
          status: RefundStatus.COMPLETED,
          rawProviderData: refundRes as any,
        },
      });

      // Update payment refunded amount
      await tx.payment.update({
        where: { id: lockedPayment.id },
        data: {
          refundedAmountMinor: { increment: confirmedRefundMinor },
        },
      });

      // Advance state machine
      await PaymentStateMachine.transition(tx, lockedPayment.id, targetStatus, {
        reason: `Refund of ${confirmedRefundMinor} confirmed by PayPal (Refund ID: ${refundRes.id})`,
        triggeredBy: params.triggeredBy || 'SYSTEM',
        metadata: {
          refundId: updatedRefund.id,
          providerRefundId: refundRes.id,
          confirmedRefundMinor,
        },
      });

      // Post Ledger Reversal Journal ONLY after confirmed refund
      await LedgerService.recordRefundJournal(tx, {
        refundId: updatedRefund.id,
        amountMinor: confirmedRefundMinor,
        currency: confirmedCurrency,
        providerRefundId: refundRes.id,
        reason: params.reason,
      });

      // If fully refunded, mark Order as REFUNDED
      if (isFullRefund) {
        await tx.order.update({
          where: { id: lockedPayment.orderId },
          data: { status: OrderStatus.REFUNDED },
        });
      }

      return updatedRefund;
    });

    return {
      refund: finalRefund,
      payment: await this.getPaymentById(lockedPayment.id),
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
