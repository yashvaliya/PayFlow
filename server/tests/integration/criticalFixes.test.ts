import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { payPalClient } from '../../src/integrations/paypal/client.js';
import { LedgerService } from '../../src/services/ledgerService.js';
import { PaymentStatus } from '@prisma/client';

describe('Critical Payment & Security Fixes', () => {
  let adminToken: string;
  let viewerToken: string;
  let testProductId: string;
  let testProductPriceMinor: number;

  beforeAll(async () => {
    await prisma.$connect();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@payflow.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;

    const viewerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'viewer@payflow.internal', password: 'ViewerPassword123!' });
    viewerToken = viewerRes.body.data.token;

    const prodRes = await request(app).get('/api/products');
    expect(prodRes.body.data.products.length).toBeGreaterThan(0);
    const prod = prodRes.body.data.products[0];
    testProductId = prod.id;
    testProductPriceMinor = prod.unitAmountMinor;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  // 1. Capture amount and currency mismatch
  describe('1. Capture Amount & Currency Mismatch Protection', () => {
    it('rejects capture and marks payment failed when captured amount differs from order', async () => {
      // Create pending order
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `mismatch-amt-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'mismatch-amt@example.com',
          customerName: 'Mismatch Amount',
        });
      expect(orderRes.status).toBe(201);
      const paymentId = orderRes.body.data.paymentId;

      // Spy on captureOrder to return an amount mismatch
      const originalCapture = payPalClient.captureOrder.bind(payPalClient);
      const captureSpy = vi.spyOn(payPalClient, 'captureOrder').mockImplementation(async (params) => {
        const res = await originalCapture(params);
        return {
          ...res,
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: 'MOCK-CAP-MISMATCH-1',
                    status: 'COMPLETED',
                    amount: {
                      currency_code: 'USD',
                      value: '500.00', // mismatched amount
                    },
                  },
                ],
              },
            },
          ],
        };
      });

      const captureRes = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `cap-mismatch-amt-${Date.now()}`)
        .send({});

      captureSpy.mockRestore();

      expect(captureRes.status).toBe(400);
      expect(captureRes.body.error.message).toMatch(/mismatch/i);

      // Verify payment in database is marked FAILED and has no ledger journals
      const paymentInDb = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(paymentInDb?.status).toBe(PaymentStatus.FAILED);
      expect(paymentInDb?.failureReason).toMatch(/mismatch/i);

      const journals = await prisma.ledgerJournal.findMany({
        where: { referenceId: paymentId },
      });
      expect(journals.length).toBe(0);
    });

    it('rejects capture and marks payment failed when captured currency differs from order', async () => {
      // Create pending order
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `mismatch-cur-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'mismatch-cur@example.com',
          customerName: 'Mismatch Currency',
        });
      expect(orderRes.status).toBe(201);
      const paymentId = orderRes.body.data.paymentId;

      const originalCapture = payPalClient.captureOrder.bind(payPalClient);
      const captureSpy = vi.spyOn(payPalClient, 'captureOrder').mockImplementation(async (params) => {
        const res = await originalCapture(params);
        return {
          ...res,
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: 'MOCK-CAP-MISMATCH-EUR',
                    status: 'COMPLETED',
                    amount: {
                      currency_code: 'EUR', // mismatched currency
                      value: (testProductPriceMinor / 100).toFixed(2),
                    },
                  },
                ],
              },
            },
          ],
        };
      });

      const captureRes = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `cap-mismatch-cur-${Date.now()}`)
        .send({});

      captureSpy.mockRestore();

      expect(captureRes.status).toBe(400);
      expect(captureRes.body.error.message).toMatch(/currency mismatch/i);

      const paymentInDb = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(paymentInDb?.status).toBe(PaymentStatus.FAILED);

      const journals = await prisma.ledgerJournal.findMany({
        where: { referenceId: paymentId },
      });
      expect(journals.length).toBe(0);
    });
  });

  // 2. Duplicate capture requests
  describe('2. Duplicate Capture Requests Idempotency', () => {
    it('safely replays duplicate capture without creating duplicate ledger journals', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `dup-cap-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'dup-cap@example.com',
          customerName: 'Duplicate Capture User',
        });
      const paymentId = orderRes.body.data.paymentId;
      const captureIdemKey = `dup-cap-key-${Date.now()}`;

      // First capture request
      const capRes1 = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', captureIdemKey)
        .send({});
      expect(capRes1.status).toBe(200);
      expect(capRes1.body.data.payment.status).toBe('COMPLETED');

      // Duplicate capture request with identical idempotency key
      const capRes2 = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', captureIdemKey)
        .send({});
      expect(capRes2.status).toBe(200);
      expect(capRes2.headers['x-idempotent-replay']).toBe('true');

      // Verify DB: exactly 1 ledger journal exists for this payment
      const journals = await prisma.ledgerJournal.findMany({
        where: { referenceId: paymentId },
      });
      expect(journals.length).toBe(1);
    });
  });

  // 3. Excess and concurrent refunds
  describe('3. Excess & Concurrent Refunds Safety', () => {
    it('prevents refunds that exceed the captured payment amount', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `excess-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'excess@example.com',
          customerName: 'Excess Refund User',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `excess-cap-${Date.now()}`)
        .send({});

      // Attempt to refund more than the total payment
      const excessAmount = testProductPriceMinor + 5000;
      const refundRes = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `excess-ref-${Date.now()}`)
        .send({
          amountMinor: excessAmount,
          reason: 'Excess refund test',
        });

      expect(refundRes.status).toBe(400);
      expect(refundRes.body.error.message).toMatch(/exceeds remaining/i);
    });

    it('safely serializes concurrent partial refunds and prevents cumulative excess', async () => {
      // Create and capture order
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `conc-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'concurrent@example.com',
          customerName: 'Concurrent Refund User',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `conc-cap-${Date.now()}`)
        .send({});

      // Try two concurrent refunds each requesting 70% of the total price
      // Combined, they equal 140%, which exceeds the 100% cap.
      // Under FOR UPDATE locking, exactly one must succeed and one must be rejected.
      const partialAmount = Math.ceil(testProductPriceMinor * 0.7);

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/payments/${paymentId}/refund`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `conc-ref-a-${Date.now()}`)
          .send({ amountMinor: partialAmount, reason: 'Concurrent partial A' }),
        request(app)
          .post(`/api/payments/${paymentId}/refund`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `conc-ref-b-${Date.now()}`)
          .send({ amountMinor: partialAmount, reason: 'Concurrent partial B' }),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);

      // Verify that total refunded amount in DB never exceeds captured total
      const paymentInDb = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { refunds: true },
      });
      const totalRefunded = paymentInDb!.refunds.reduce((sum, r) => sum + r.amountMinor, 0);
      expect(totalRefunded).toBe(partialAmount);
      expect(totalRefunded).toBeLessThanOrEqual(paymentInDb!.amountMinor);
    });
  });

  // 4. Provider-refused refunds
  describe('4. Provider-Refused Refunds Handling', () => {
    it('creates no ledger reversal entries if provider refuses or fails refund', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `refused-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'refused@example.com',
          customerName: 'Refused Refund User',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `refused-cap-${Date.now()}`)
        .send({});

      // Count journals before refund attempt
      const journalsBefore = await prisma.ledgerJournal.count({
        where: { referenceId: paymentId },
      });

      // Mock refundCapture to return status FAILED from PayPal
      const refundSpy = vi.spyOn(payPalClient, 'refundCapture').mockResolvedValueOnce({
        id: 'MOCK-REF-REJECTED',
        status: 'FAILED',
        amount: { value: '10.00', currency_code: 'USD' },
        create_time: new Date().toISOString(),
      });

      const refundRes = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `refused-ref-${Date.now()}`)
        .send({ amountMinor: 1000, reason: 'Simulated rejected refund' });

      refundSpy.mockRestore();

      expect(refundRes.status).toBe(400);
      expect(refundRes.body.error.message).toMatch(/PayPal refund was not completed/i);

      // Verify no new ledger journal reversal was posted
      const journalsAfter = await prisma.ledgerJournal.count({
        where: { referenceId: paymentId },
      });
      expect(journalsAfter).toBe(journalsBefore);
    });
  });

  // 5. Nested JSON idempotency payloads
  describe('5. Nested JSON Idempotency Payloads', () => {
    it('produces identical hash and replays response regardless of nested object key order', async () => {
      const idempotencyKey = `nested-idem-${Date.now()}`;

      // Payload 1: keys in order A
      const payload1 = {
        items: [{ quantity: 1, productId: testProductId }],
        customerEmail: 'nested@example.com',
        customerName: 'Nested Tester',
      };

      const res1 = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload1);

      expect(res1.status).toBe(201);
      const originalOrderId = res1.body.data.orderId;

      // Payload 2: keys in reverse order (customerName first, items second, nested properties inverted)
      const payload2 = {
        customerName: 'Nested Tester',
        customerEmail: 'nested@example.com',
        items: [{ productId: testProductId, quantity: 1 }],
      };

      const res2 = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload2);

      expect(res2.status).toBe(201);
      expect(res2.headers['x-idempotent-replay']).toBe('true');
      expect(res2.body.data.orderId).toBe(originalOrderId);
    });
  });

  // 6. Conflicting idempotency keys
  describe('6. Conflicting Idempotency Keys', () => {
    it('returns 409 Conflict when reusing an Idempotency-Key with different payload', async () => {
      const idempotencyKey = `conflict-payload-${Date.now()}`;

      const res1 = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'orig@example.com',
          customerName: 'Original User',
        });
      expect(res1.status).toBe(201);

      // Same key, different customer email
      const res2 = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'tampered@example.com',
          customerName: 'Original User',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('CONFLICT');
      expect(res2.body.error.message).toMatch(/different request payload/i);
    });

    it('returns 409 Conflict when reusing an Idempotency-Key across different operations', async () => {
      const idempotencyKey = `conflict-op-${Date.now()}`;

      // First use on CREATE_ORDER
      const res1 = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'op-conflict@example.com',
          customerName: 'Op Conflict User',
        });
      expect(res1.status).toBe(201);
      const paymentId = res1.body.data.paymentId;

      // Reusing the exact same key on CAPTURE_PAYMENT
      const res2 = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', idempotencyKey)
        .send({});

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('CONFLICT');
      expect(res2.body.error.message).toMatch(/cannot be reused for/i);
    });
  });

  // 7. Missing PayPal credentials fail safely
  describe('7. Missing PayPal Credentials Fail Safely', () => {
    it('throws 503 PAYPAL_NOT_CONFIGURED when unconfigured and mock mode is disabled', async () => {
      // Mock isConfigured to false and isMockAllowed to false
      const configSpy = vi.spyOn(payPalClient, 'isConfigured').mockReturnValue(false);
      const mockAllowedSpy = vi.spyOn(payPalClient, 'isMockAllowed').mockReturnValue(false);

      await expect(
        payPalClient.captureOrder({ providerOrderId: 'ORD-UNCONFIGURED' })
      ).rejects.toMatchObject({
        statusCode: 503,
        errorCode: 'PAYPAL_NOT_CONFIGURED',
      });

      await expect(
        payPalClient.createOrder({
          orderNumber: 'TEST',
          amountMinor: 1000,
          currency: 'USD',
          description: 'test',
        })
      ).rejects.toMatchObject({
        statusCode: 503,
        errorCode: 'PAYPAL_NOT_CONFIGURED',
      });

      configSpy.mockRestore();
      mockAllowedSpy.mockRestore();
    });
  });

  // 8. Invalid webhook signatures
  describe('8. Webhook Signature Verification Fail Closed', () => {
    it('rejects webhooks with invalid signatures with HTTP 400', async () => {
      const invalidEventId = `WH-INV-${Date.now()}`;
      const res = await request(app)
        .post('/api/webhooks/paypal')
        .set('paypal-transmission-sig', 'INVALID_SIGNATURE')
        .send({
          id: invalidEventId,
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: { id: 'CAP-FAKE' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('WEBHOOK_VERIFICATION_FAILED');

      // Verify event was NOT recorded in database
      const dbEvent = await prisma.webhookEvent.findUnique({
        where: { eventId: invalidEventId },
      });
      expect(dbEvent).toBeNull();
    });

    it('fails closed when credentials are not configured in production mode', async () => {
      const configSpy = vi.spyOn(payPalClient, 'isConfigured').mockReturnValue(false);
      const mockAllowedSpy = vi.spyOn(payPalClient, 'isMockAllowed').mockReturnValue(false);

      const isVerified = await payPalClient.verifyWebhookSignature({
        authAlgo: 'SHA256withRSA',
        certUrl: 'https://api.sandbox.paypal.com/cert',
        transmissionId: 'trans-123',
        transmissionSig: 'sig-123',
        transmissionTime: new Date().toISOString(),
        webhookId: 'wh-123',
        eventBody: { id: 'evt-123' },
      });

      configSpy.mockRestore();
      mockAllowedSpy.mockRestore();

      expect(isVerified).toBe(false);
    });
  });

  // 9. Duplicate webhook delivery
  describe('9. Duplicate Webhook Delivery Handling', () => {
    it('deduplicates duplicate webhook delivery gracefully without duplicate records', async () => {
      const eventId = `WH-DELIVERY-${Date.now()}`;
      const payload = {
        id: eventId,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: `CAP-REC-${Date.now()}`,
          status: 'COMPLETED',
        },
      };

      // First delivery
      const res1 = await request(app)
        .post('/api/webhooks/paypal')
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res1.body.message).toMatch(/accepted/);

      // Duplicate delivery
      const res2 = await request(app)
        .post('/api/webhooks/paypal')
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.body.message).toMatch(/deduplicated/);

      // Verify exactly one record in WebhookEvent table
      const events = await prisma.webhookEvent.findMany({
        where: { eventId },
      });
      expect(events.length).toBe(1);
    });
  });

  // 10. Ledger balancing invariant
  describe('10. Double-Entry Ledger Balancing Invariant', () => {
    it('verifies system-wide double-entry balance invariant across all accounts', async () => {
      const verification = await LedgerService.verifyInvariants();
      expect(verification.balanced).toBe(true);
      expect(verification.totalDebitsMinor).toBe(verification.totalCreditsMinor);
      expect(verification.imbalances.length).toBe(0);
    });
  });
});
