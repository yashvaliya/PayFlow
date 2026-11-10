export type Role = 'ADMIN' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  unitAmountMinor: number;
  currency: string;
  stock: number;
  imageUrl?: string;
}

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitAmountMinor: number;
  totalAmountMinor: number;
  product?: Product;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  totalAmountMinor: number;
  currency: string;
  status: string;
  createdAt: string;
  items?: OrderItem[];
}

export interface Refund {
  id: string;
  paymentId: string;
  providerRefundId?: string;
  amountMinor: number;
  currency: string;
  reason?: string;
  status: string;
  createdAt: string;
}

export interface PaymentStateTransition {
  id: string;
  fromStatus: PaymentStatus;
  toStatus: PaymentStatus;
  reason?: string;
  triggeredBy: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  entryType: 'DEBIT' | 'CREDIT';
  amountMinor: number;
  currency: string;
  account: {
    code: string;
    name: string;
    type: string;
  };
}

export interface LedgerJournal {
  id: string;
  journalNumber: string;
  referenceType: string;
  referenceId: string;
  description: string;
  postedAt: string;
  entries: LedgerEntry[];
}

export interface Payment {
  id: string;
  orderId: string;
  idempotencyKey: string;
  provider: string;
  providerOrderId?: string;
  providerCaptureId?: string;
  amountMinor: number;
  refundedAmountMinor: number;
  currency: string;
  status: PaymentStatus;
  providerStatus?: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
  order?: Order;
  refunds?: Refund[];
  stateTransitions?: PaymentStateTransition[];
  ledgerJournals?: LedgerJournal[];
}

export interface DashboardSummary {
  totalVolumeMinor: number;
  netVolumeMinor: number;
  successfulCount: number;
  pendingCount: number;
  failedCount: number;
  totalRefundsCount: number;
  totalRefundedVolumeMinor: number;
  merchantPayableBalanceMinor: number;
  currency: string;
}

export interface DashboardAnalytics {
  volumeOverTime: Array<{ date: string; volumeMinor: number; count: number }>;
  statusDistribution: Array<{ status: PaymentStatus; count: number; amountMinor: number }>;
  recentActivity: Array<Payment & { order: { orderNumber: string; customerEmail: string; customerName: string } }>;
}

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  balanceMinor: number;
  currency: string;
}

export interface WebhookEvent {
  id: string;
  eventId: string;
  eventType: string;
  resourceType?: string;
  summary?: string;
  payload: any;
  status: 'PENDING' | 'PROCESSED' | 'FAILED' | 'IGNORED';
  processingAttempts: number;
  lastError?: string;
  receivedAt: string;
  processedAt?: string;
}

export interface ReconciliationRun {
  id: string;
  runNumber: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalChecked: number;
  matchedCount: number;
  mismatchedCount: number;
  pendingReviewCount: number;
  startedAt: string;
  completedAt?: string;
  notes?: string;
  triggeredBy?: {
    name: string;
    email: string;
  };
  items?: Array<{
    id: string;
    paymentId?: string;
    providerOrderId?: string;
    providerCaptureId?: string;
    internalStatus?: PaymentStatus;
    providerStatus?: string;
    internalAmountMinor?: number;
    providerAmountMinor?: number;
    statusMatch: boolean;
    amountMatch: boolean;
    outcome: 'MATCHED' | 'INTERNAL_MISMATCH' | 'PROVIDER_MISMATCH' | 'PENDING_REVIEW';
    details?: any;
    payment?: {
      order?: {
        orderNumber: string;
      };
    };
  }>;
}
