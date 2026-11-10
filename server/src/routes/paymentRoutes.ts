import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController.js';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { Role } from '../types/index.js';

export const paymentRouter = Router();

// Public config for frontend SDK
paymentRouter.get('/config', PaymentController.getConfig);

// Create order (supports guest or authenticated checkout, with Idempotency)
paymentRouter.post(
  '/orders',
  optionalAuthenticate,
  idempotency('CREATE_ORDER'),
  PaymentController.createOrder
);

// Capture payment (with Idempotency)
paymentRouter.post(
  '/:id/capture',
  optionalAuthenticate,
  idempotency('CAPTURE_PAYMENT'),
  PaymentController.capturePayment
);

// Refund payment (Strictly ADMIN only, with Idempotency)
paymentRouter.post(
  '/:id/refund',
  authenticate,
  requireRole([Role.ADMIN]),
  idempotency('REFUND_PAYMENT'),
  PaymentController.refundPayment
);

// Get single payment details (Authenticated or Viewer)
paymentRouter.get('/:id', optionalAuthenticate, PaymentController.getPayment);

// List payments (Filterable, Paginated)
paymentRouter.get('/', optionalAuthenticate, PaymentController.listPayments);
