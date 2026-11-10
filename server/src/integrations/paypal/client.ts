import { env } from '../../config/env.js';
import { centsToDollars } from '../../utils/money.js';
import { AppError } from '../../utils/errors.js';

interface AccessTokenCache {
  token: string;
  expiresAt: number; // timestamp in ms
}

export interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalCaptureResponse {
  id: string; // PayPal Order ID
  status: string;
  purchase_units: Array<{
    payments?: {
      captures?: Array<{
        id: string; // PayPal Capture ID
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
        seller_protection?: any;
        final_capture?: boolean;
        create_time?: string;
        update_time?: string;
      }>;
    };
  }>;
  payer?: {
    name?: {
      given_name?: string;
      surname?: string;
    };
    email_address?: string;
    payer_id?: string;
  };
}

export interface PayPalRefundResponse {
  id: string; // PayPal Refund ID
  status: string;
  amount: {
    value: string;
    currency_code: string;
  };
  note_to_payer?: string;
  create_time?: string;
}

export class PayPalClient {
  private baseUrl: string;
  private tokenCache: AccessTokenCache | null = null;

  constructor() {
    this.baseUrl =
      env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
  }

  public isConfigured(): boolean {
    return Boolean(
      env.PAYPAL_CLIENT_ID &&
        env.PAYPAL_CLIENT_SECRET &&
        !env.PAYPAL_CLIENT_ID.includes('placeholder') &&
        !env.PAYPAL_CLIENT_SECRET.includes('placeholder') &&
        env.PAYPAL_CLIENT_ID.length > 5
    );
  }

  /**
   * Mock mode is strictly prohibited in production.
   * Allowed ONLY in development/test when explicitly enabled via PAYPAL_ALLOW_MOCK or test runner.
   */
  public isMockAllowed(): boolean {
    if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
      return false;
    }
    return Boolean(env.PAYPAL_ALLOW_MOCK || env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test');
  }

  private ensureConfiguredOrMock(operation: string): void {
    if (!this.isConfigured() && !this.isMockAllowed()) {
      throw new AppError(
        `PayPal credentials are not configured. Cannot execute ${operation} without valid API keys.`,
        503,
        'PAYPAL_NOT_CONFIGURED'
      );
    }
  }

  /**
   * Retrieves OAuth 2.0 Client Credentials Access Token with safe caching
   */
  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60000) {
      return this.tokenCache.token;
    }

    if (!this.isConfigured()) {
      if (!this.isMockAllowed()) {
        throw new AppError(
          'PayPal credentials are not configured and mock mode is disabled.',
          503,
          'PAYPAL_NOT_CONFIGURED'
        );
      }
      return 'mock_sandbox_access_token_' + Date.now();
    }

    const auth = Buffer.from(
      `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');

    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(
        `PayPal OAuth error (${res.status}): ${errText}`,
        502,
        'PAYPAL_OAUTH_FAILED'
      );
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000 - 300000, // refresh 5 mins before expiry
    };

    return this.tokenCache.token;
  }

  /**
   * Creates a PayPal checkout order
   */
  public async createOrder(params: {
    orderNumber: string;
    amountMinor: number;
    currency: string;
    description: string;
    returnUrl?: string;
    cancelUrl?: string;
    idempotencyKey?: string;
  }): Promise<PayPalOrderResponse> {
    this.ensureConfiguredOrMock('createOrder');

    const dollarValue = centsToDollars(params.amountMinor);

    if (!this.isConfigured()) {
      const mockId = `MOCK-ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      return {
        id: mockId,
        status: 'CREATED',
        links: [
          {
            href: `https://www.sandbox.paypal.com/checkoutnow?token=${mockId}`,
            rel: 'approve',
            method: 'GET',
          },
        ],
      };
    }

    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (params.idempotencyKey) {
      headers['PayPal-Request-Id'] = params.idempotencyKey;
    }

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.orderNumber,
          description: params.description,
          amount: {
            currency_code: params.currency,
            value: dollarValue,
            breakdown: {
              item_total: {
                currency_code: params.currency,
                value: dollarValue,
              },
            },
          },
        },
      ],
      application_context: {
        brand_name: 'PayFlow Platform',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: params.returnUrl || `${env.APP_BASE_URL}/checkout/success`,
        cancel_url: params.cancelUrl || `${env.APP_BASE_URL}/checkout/cancel`,
      },
    };

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new AppError(
        `PayPal create order failed (${res.status}): ${JSON.stringify(errBody)}`,
        502,
        'PAYPAL_CREATE_ORDER_FAILED',
        errBody
      );
    }

    return (await res.json()) as PayPalOrderResponse;
  }

  /**
   * Captures payment for an approved PayPal order
   */
  public async captureOrder(params: {
    providerOrderId: string;
    idempotencyKey?: string;
    expectedAmountMinor?: number;
    expectedCurrency?: string;
  }): Promise<PayPalCaptureResponse> {
    this.ensureConfiguredOrMock('captureOrder');

    if (!this.isConfigured() || params.providerOrderId.startsWith('MOCK-')) {
      if (!this.isMockAllowed()) {
        throw new AppError('Mock payments are not supported in production mode', 400, 'MOCK_NOT_ALLOWED');
      }
      const mockCaptureId = `MOCK-CAP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const amountValue = params.expectedAmountMinor !== undefined
        ? centsToDollars(params.expectedAmountMinor)
        : '99.00';
      const currencyValue = params.expectedCurrency || 'USD';

      return {
        id: params.providerOrderId,
        status: 'COMPLETED',
        purchase_units: [
          {
            payments: {
              captures: [
                {
                  id: mockCaptureId,
                  status: 'COMPLETED',
                  amount: {
                    currency_code: currencyValue,
                    value: amountValue,
                  },
                },
              ],
            },
          },
        ],
        payer: {
          name: {
            given_name: 'Sandbox',
            surname: 'Buyer',
          },
          email_address: 'sandbox-buyer@payflow.internal',
          payer_id: 'SANDBOX-PAYER-123',
        },
      };
    }

    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (params.idempotencyKey) {
      headers['PayPal-Request-Id'] = params.idempotencyKey;
    }

    const res = await fetch(
      `${this.baseUrl}/v2/checkout/orders/${params.providerOrderId}/capture`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      }
    );

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new AppError(
        `PayPal capture failed (${res.status}): ${JSON.stringify(body)}`,
        res.status === 422 ? 422 : 502,
        'PAYPAL_CAPTURE_FAILED',
        body
      );
    }

    return body as PayPalCaptureResponse;
  }

  /**
   * Refunds a captured payment (full or partial)
   */
  public async refundCapture(params: {
    providerCaptureId: string;
    amountMinor?: number;
    currency: string;
    reason?: string;
    idempotencyKey?: string;
  }): Promise<PayPalRefundResponse> {
    this.ensureConfiguredOrMock('refundCapture');

    if (!this.isConfigured() || params.providerCaptureId.startsWith('MOCK-')) {
      if (!this.isMockAllowed()) {
        throw new AppError('Mock refunds are not supported in production mode', 400, 'MOCK_NOT_ALLOWED');
      }
      const mockRefundId = `MOCK-REF-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      return {
        id: mockRefundId,
        status: 'COMPLETED',
        amount: {
          value: params.amountMinor ? centsToDollars(params.amountMinor) : '10.00',
          currency_code: params.currency,
        },
        note_to_payer: params.reason || 'Refund processed by PayFlow Merchant',
        create_time: new Date().toISOString(),
      };
    }

    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (params.idempotencyKey) {
      headers['PayPal-Request-Id'] = params.idempotencyKey;
    }

    const bodyPayload: any = {};
    if (params.amountMinor) {
      bodyPayload.amount = {
        value: centsToDollars(params.amountMinor),
        currency_code: params.currency,
      };
    }
    if (params.reason) {
      bodyPayload.note_to_payer = params.reason;
    }

    const res = await fetch(
      `${this.baseUrl}/v2/payments/captures/${params.providerCaptureId}/refund`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new AppError(
        `PayPal refund failed (${res.status}): ${JSON.stringify(data)}`,
        502,
        'PAYPAL_REFUND_FAILED',
        data
      );
    }

    return data as PayPalRefundResponse;
  }

  /**
   * Retrieves order details from PayPal for reconciliation
   */
  public async getOrderDetails(providerOrderId: string): Promise<any> {
    this.ensureConfiguredOrMock('getOrderDetails');

    if (!this.isConfigured() || providerOrderId.startsWith('MOCK-')) {
      if (!this.isMockAllowed()) {
        throw new AppError('Mock orders not allowed in production', 400, 'MOCK_NOT_ALLOWED');
      }
      return {
        id: providerOrderId,
        status: 'COMPLETED',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: '99.00',
            },
          },
        ],
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${providerOrderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new AppError(
        `Failed to retrieve PayPal order ${providerOrderId} (${res.status})`,
        502,
        'PAYPAL_ORDER_FETCH_FAILED'
      );
    }

    return await res.json();
  }

  /**
   * Retrieves capture details from PayPal for reconciliation
   */
  public async getCaptureDetails(providerCaptureId: string): Promise<any> {
    this.ensureConfiguredOrMock('getCaptureDetails');

    if (!this.isConfigured() || providerCaptureId.startsWith('MOCK-')) {
      if (!this.isMockAllowed()) {
        throw new AppError('Mock captures not allowed in production', 400, 'MOCK_NOT_ALLOWED');
      }
      return {
        id: providerCaptureId,
        status: 'COMPLETED',
        amount: {
          currency_code: 'USD',
          value: '99.00',
        },
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/v2/payments/captures/${providerCaptureId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      throw new AppError(
        `Failed to retrieve PayPal capture ${providerCaptureId} (${res.status})`,
        502,
        'PAYPAL_CAPTURE_FETCH_FAILED'
      );
    }

    return await res.json();
  }

  /**
   * Verifies incoming PayPal Webhook Signature against PayPal API
   * FAILS CLOSED if unconfigured or invalid.
   */
  public async verifyWebhookSignature(params: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
    webhookId: string;
    eventBody: any;
  }): Promise<boolean> {
    // If not configured, FAIL CLOSED in production or when mock is disabled
    if (!this.isConfigured()) {
      if (!this.isMockAllowed()) {
        console.warn('Webhook signature verification rejected: PayPal credentials not configured (Fail Closed)');
        return false;
      }
      // In test/mock mode, allow simulated verification unless explicitly marked invalid
      if (params.transmissionSig === 'INVALID_SIGNATURE' || params.authAlgo === 'INVALID') {
        console.warn('Webhook signature verification rejected: Invalid signature simulation');
        return false;
      }
      return Boolean(params.eventBody && params.eventBody.id);
    }

    // Must have all required signature headers
    if (
      !params.authAlgo ||
      !params.certUrl ||
      !params.transmissionId ||
      !params.transmissionSig ||
      !params.transmissionTime
    ) {
      console.warn('Webhook signature verification rejected: Missing required signature headers');
      return false;
    }

    try {
      const token = await this.getAccessToken();
      const verifyPayload = {
        auth_algo: params.authAlgo,
        cert_url: params.certUrl,
        transmission_id: params.transmissionId,
        transmission_sig: params.transmissionSig,
        transmission_time: params.transmissionTime,
        webhook_id: params.webhookId || env.PAYPAL_WEBHOOK_ID,
        webhook_event: params.eventBody,
      };

      const res = await fetch(
        `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(verifyPayload),
        }
      );

      if (!res.ok) {
        console.warn(`PayPal webhook signature verification request returned HTTP ${res.status}`);
        return false;
      }

      const data = (await res.json()) as { verification_status: string };
      return data.verification_status === 'SUCCESS';
    } catch (err) {
      console.error('PayPal webhook signature verification request error:', err);
      return false;
    }
  }
}

export const payPalClient = new PayPalClient();
