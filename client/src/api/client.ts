import {
  User,
  Product,
  Payment,
  DashboardSummary,
  DashboardAnalytics,
  LedgerAccount,
  LedgerJournal,
  WebhookEvent,
  ReconciliationRun,
} from '../types';

class ApiClient {
  private baseUrl = '/api';

  private getToken(): string | null {
    return localStorage.getItem('payflow_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    // Handle CSV or text responses
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/csv')) {
      return (await response.text()) as unknown as T;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || 'API request failed');
    }

    return data;
  }

  // Auth
  async login(payload: { email: string; password: string }) {
    const res = await this.request<{ success: boolean; data: { user: User; token: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    if (res.data?.token) {
      localStorage.setItem('payflow_token', res.data.token);
    }
    return res.data;
  }

  async register(payload: { email: string; password: string; name: string }) {
    const res = await this.request<{ success: boolean; data: { user: User; token: string } }>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    if (res.data?.token) {
      localStorage.setItem('payflow_token', res.data.token);
    }
    return res.data;
  }

  async logout() {
    localStorage.removeItem('payflow_token');
    return this.request('/auth/logout', { method: 'POST' });
  }

  async getCurrentUser() {
    return this.request<{ success: boolean; data: { user: User } }>('/auth/me');
  }

  // Products
  async getProducts() {
    return this.request<{ success: boolean; data: { products: Product[] } }>('/products');
  }

  // Payments
  async getPaymentConfig() {
    return this.request<{
      success: boolean;
      data: { clientId: string; mode: string; currency: string };
    }>('/payments/config');
  }

  async createPaymentOrder(
    payload: {
      items: Array<{ productId: string; quantity: number }>;
      customerEmail: string;
      customerName: string;
    },
    idempotencyKey?: string
  ) {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return this.request<{
      success: boolean;
      data: {
        orderId: string;
        orderNumber: string;
        paymentId: string;
        providerOrderId: string;
        totalAmountMinor: number;
        currency: string;
        approvalUrl?: string;
        status: string;
      };
    }>('/payments/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  async capturePayment(paymentId: string, idempotencyKey?: string) {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return this.request<{ success: boolean; message: string; data: { payment: Payment } }>(
      `/payments/${paymentId}/capture`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      }
    );
  }

  async refundPayment(
    paymentId: string,
    payload: { amountMinor?: number; reason?: string },
    idempotencyKey?: string
  ) {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return this.request<{
      success: boolean;
      message: string;
      data: { refund: any; payment: Payment };
    }>(`/payments/${paymentId}/refund`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  async getPayment(paymentId: string) {
    return this.request<{ success: boolean; data: { payment: Payment } }>(
      `/payments/${paymentId}`
    );
  }

  async listPayments(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  } = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);

    return this.request<{
      success: boolean;
      data: { payments: Payment[] };
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/payments?${query.toString()}`);
  }

  // Dashboard
  async getDashboardSummary() {
    return this.request<{ success: boolean; data: DashboardSummary }>('/dashboard/summary');
  }

  async getDashboardAnalytics() {
    return this.request<{ success: boolean; data: DashboardAnalytics }>('/dashboard/analytics');
  }

  // Ledger
  async getLedgerAccounts() {
    return this.request<{ success: boolean; data: { accounts: LedgerAccount[] } }>(
      '/ledger/accounts'
    );
  }

  async getLedgerJournals(page: number = 1, limit: number = 20) {
    return this.request<{
      success: boolean;
      data: { journals: LedgerJournal[] };
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/ledger?page=${page}&limit=${limit}`);
  }

  async verifyLedgerInvariants() {
    return this.request<{
      success: boolean;
      data: {
        balanced: boolean;
        totalJournals: number;
        totalDebitsMinor: number;
        totalCreditsMinor: number;
        imbalances: any[];
      };
    }>('/ledger/verify-invariants');
  }

  // Webhooks
  async listWebhookEvents(page: number = 1, limit: number = 20) {
    return this.request<{
      success: boolean;
      data: { events: WebhookEvent[] };
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/webhooks/events?page=${page}&limit=${limit}`);
  }

  // Reconciliation
  async listReconciliationRuns(page: number = 1, limit: number = 20) {
    return this.request<{
      success: boolean;
      data: { runs: ReconciliationRun[] };
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/reconciliation?page=${page}&limit=${limit}`);
  }

  async getReconciliationRun(id: string) {
    return this.request<{ success: boolean; data: { run: ReconciliationRun } }>(
      `/reconciliation/${id}`
    );
  }

  async triggerReconciliationRun(notes?: string) {
    return this.request<{
      success: boolean;
      message: string;
      data: { run: ReconciliationRun };
    }>('/reconciliation/run', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  async downloadReconciliationReport(id: string): Promise<string> {
    return this.request<string>(`/reconciliation/${id}/report`);
  }
}

export const api = new ApiClient();
