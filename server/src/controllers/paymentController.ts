import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/paymentService.js';
import {
  createOrderSchema,
  refundPaymentSchema,
  listPaymentsSchema,
} from '../validators/index.js';
import { env } from '../config/env.js';

export class PaymentController {
  /**
   * Returns public PayPal client configuration so frontend SDK can mount
   */
  public static async getConfig(_req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        clientId: env.PAYPAL_CLIENT_ID || 'sandbox_test_client_id',
        mode: env.PAYPAL_MODE,
        currency: 'USD',
      },
    });
  }

  /**
   * POST /api/payments/orders
   * Server calculates authoritative price and initiates PayPal order
   */
  public static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createOrderSchema.parse(req.body);
      const idempotencyKey = req.header('Idempotency-Key');

      const result = await PaymentService.createPaymentOrder({
        items: parsed.items,
        customerEmail: parsed.customerEmail,
        customerName: parsed.customerName,
        idempotencyKey,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/:id/capture
   * Executes authoritative capture against PayPal and triggers double-entry ledger settlement
   */
  public static async capturePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const paymentId = req.params.id;
      const idempotencyKey = req.header('Idempotency-Key');
      const triggeredBy = req.user ? `USER:${req.user.email}` : 'CHECKOUT_FLOW';

      const payment = await PaymentService.capturePayment({
        paymentId,
        idempotencyKey,
        triggeredBy,
      });

      res.json({
        success: true,
        message: 'Payment captured and settled successfully',
        data: { payment },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/:id/refund
   * Issues full or partial refund and posts double-entry reversal
   */
  public static async refundPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const paymentId = req.params.id;
      const parsed = refundPaymentSchema.parse(req.body);
      const idempotencyKey = req.header('Idempotency-Key');
      const triggeredBy = req.user ? `USER:${req.user.email}` : 'ADMIN_API';

      const result = await PaymentService.refundPayment({
        paymentId,
        amountMinor: parsed.amountMinor,
        reason: parsed.reason,
        idempotencyKey,
        triggeredBy,
      });

      res.json({
        success: true,
        message: 'Refund executed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/:id
   */
  public static async getPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const paymentId = req.params.id;
      const payment = await PaymentService.getPaymentById(paymentId);

      res.json({
        success: true,
        data: { payment },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments
   */
  public static async listPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listPaymentsSchema.parse(req.query);
      const result = await PaymentService.listPayments(query);

      res.json({
        success: true,
        data: {
          payments: result.payments,
        },
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
