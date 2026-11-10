import { z } from 'zod';
import { PaymentStatus } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Invalid product ID format'),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
      })
    )
    .min(1, 'At least one item is required'),
  customerEmail: z.string().email('Valid customer email is required'),
  customerName: z.string().min(2, 'Customer name is required'),
});

export const capturePaymentSchema = z.object({
  // Can be empty body since paymentId is in URL
});

export const refundPaymentSchema = z.object({
  amountMinor: z.number().int().positive('Refund amount must be a positive integer minor unit').optional(),
  reason: z.string().max(255).optional(),
});

export const listPaymentsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.enum(['createdAt', 'amountMinor']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
