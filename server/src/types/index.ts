import { Role, PaymentStatus, OrderStatus, RefundStatus, EntryType, AccountType, ReconciliationOutcome } from '@prisma/client';

export {
  Role,
  PaymentStatus,
  OrderStatus,
  RefundStatus,
  EntryType,
  AccountType,
  ReconciliationOutcome,
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface CreateOrderRequest {
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  customerEmail: string;
  customerName: string;
}

export interface RefundRequest {
  amountMinor?: number; // Optional: if omitted, full remaining refundable amount
  reason?: string;
}
