import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { payPalClient } from '../../src/integrations/paypal/client.js';
import { LedgerService } from '../../src/services/ledgerService.js';
import { WebhookWorker } from '../../src/workers/webhookWorker.js';
import { PaymentStatus, RefundStatus, WebhookStatus, EntryType } from '@prisma/client';

describe('Regression Tests: 6 Remaining Fintech Hardening Issues', () => {
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
    const prod = prodRes.body.data.products[0];
    testProductId = prod.id;
    testProductPriceMinor = prod.unitAmountMinor;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  // =========================================================================
  // Requirement 1: Concurrent Refunds & Durable Reservations
  // =========================================================================
  describe('1. Concurrent Refunds & Durable Reservations', () => {
    it('creates a durable PENDING reservation before calling PayPal, preventing concurrent excess refunds', async () => {
      // Create and capture order
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `res-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'res-test@example.com',
          customerName: 'Reservation Test',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `res-cap-${Date.now()}`)
        .send({});

      // Fire two concurrent refund requests for 60% each (total 120%)
      const refundAmount = Math.ceil(testProductPriceMinor * 0.6);

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/payments/${paymentId}/refund`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `conc-res-a-${Date.now()}`)
          .send({ amountMinor: refundAmount, reason: 'Concurrent reservation A' }),
        request(app)
          .post(`/api/payments/${paymentId}/refund`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `conc-res-b-${Date.now()}`)
          .send({ amountMinor: refundAmount, reason: 'Concurrent reservation B' }),
      ]);

      // Exactly one must succeed, and the other must be rejected due to reservation
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      const failedRes = res1.status === 400 ? res1 : res2;
      expect(failedRes.body.error.message).toMatch(/exceeds remaining unreserved refundable balance/i);

      // Verify DB has only 1 COMPLETED refund, exactly matching the 60% amount
      const refunds = await prisma.refund.findMany({
        where: { paymentId, status: RefundStatus.COMPLETED },
      });
      expect(refunds.length).toBe(1);
      expect(refunds[0].amountMinor).toBe(refundAmount);
    });

    it('maintains durable PENDING reservation when PayPal returns an ambiguous/timeout error', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `ambig-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'ambig@example.com',
          customerName: 'Ambig Test',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `ambig-cap-${Date.now()}`)
        .send({});

      // Mock PayPal refundCapture to simulate a network drop / timeout
      const refundSpy = vi.spyOn(payPalClient, 'refundCapture').mockRejectedValueOnce(
        new Error('ETIMEDOUT: Connection to PayPal API timed out')
      );

      const refundKey = `ambig-ref-${Date.now()}`;
      const refundRes = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', refundKey)
        .send({ amountMinor: 1000, reason: 'Network drop simulation' });

      refundSpy.mockRestore();

      expect(refundRes.status).toBe(500);

      // Verify the refund record remains in PENDING status so money is NOT double-spent
      const pendingRefund = await prisma.refund.findUnique({
        where: { idempotencyKey: refundKey },
      });
      expect(pendingRefund).toBeDefined();
      expect(pendingRefund?.status).toBe(RefundStatus.PENDING);
      expect((pendingRefund?.rawProviderData as any)?.ambiguousError).toMatch(/ETIMEDOUT/);
    });

    it('releases durable reservation when provider explicitly declines/fails the refund', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `rel-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'rel@example.com',
          customerName: 'Release Test',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `rel-cap-${Date.now()}`)
        .send({});

      // Mock PayPal refundCapture returning status FAILED
      const refundSpy = vi.spyOn(payPalClient, 'refundCapture').mockResolvedValueOnce({
        id: `MOCK-REF-DECLINED-${Date.now()}`,
        status: 'FAILED',
        amount: { value: '10.00', currency_code: 'USD' },
        create_time: new Date().toISOString(),
      });

      const refundKey = `rel-ref-${Date.now()}`;
      const refundRes = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', refundKey)
        .send({ amountMinor: 1000, reason: 'Provider declined' });

      refundSpy.mockRestore();

      expect(refundRes.status).toBe(400);

      // Verify refund record is marked FAILED, releasing the reservation
      const failedRefund = await prisma.refund.findUnique({
        where: { idempotencyKey: refundKey },
      });
      expect(failedRefund?.status).toBe(RefundStatus.FAILED);
    });
  });

  // =========================================================================
  // Requirement 2: Webhook Processing via Persistent PostgreSQL Worker
  // =========================================================================
  describe('2. Persistent PostgreSQL Webhook Worker', () => {
    it('atomically claims events using FOR UPDATE SKIP LOCKED and increments processingAttempts', async () => {
      await prisma.webhookEvent.deleteMany({});
      const eventId = `WH-WORKER-CLAIM-${Date.now()}`;
      await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          payload: { id: eventId },
          status: WebhookStatus.PENDING,
          processingAttempts: 0,
        },
      });

      const claimed = await WebhookWorker.claimNextEvent();
      expect(claimed).toBeDefined();
      expect(claimed?.eventId).toBe(eventId);
      expect(claimed?.processingAttempts).toBe(1);

      // Verify status in DB is now PROCESSING
      const dbEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(dbEvent?.status).toBe(WebhookStatus.PROCESSING);
    });

    it('never marks events PROCESSED when payment matching fails, bounding retries to FAILED', async () => {
      await prisma.webhookEvent.deleteMany({});
      const eventId = `WH-MATCH-FAIL-${Date.now()}`;
      const eventRecord = await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          payload: {
            id: eventId,
            resource: {
              id: `NON_EXISTENT_CAPTURE_${Date.now()}`,
              status: 'COMPLETED',
            },
          },
          status: WebhookStatus.PENDING,
          processingAttempts: WebhookWorker.MAX_ATTEMPTS,
        },
      });

      // Execute claimed event directly at MAX_ATTEMPTS
      await WebhookWorker.executeClaimedEvent(eventRecord);

      // Verify event was marked FAILED (never PROCESSED) because payment matching failed
      const dbEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(dbEvent?.status).toBe(WebhookStatus.FAILED);
      expect(dbEvent?.status).not.toBe(WebhookStatus.PROCESSED);
      expect(dbEvent?.lastError).toMatch(/Payment matching failed/i);
    });

    it('never marks events PROCESSED when financial validation fails, holding payment under REQUIRES_REVIEW', async () => {
      await prisma.webhookEvent.deleteMany({});
      // Create payment
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `w-fin-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'wfin@example.com',
          customerName: 'WFin User',
        });
      const paymentId = orderRes.body.data.paymentId;
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

      const fakeCaptureId = `CAP-WH-MISMATCH-${Date.now()}`;
      const eventId = `WH-FIN-FAIL-${Date.now()}`;

      const eventRecord = await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          payload: {
            id: eventId,
            resource: {
              id: fakeCaptureId,
              status: 'COMPLETED',
              supplementary_data: { related_ids: { order_id: payment.providerOrderId } },
              amount: { value: '9999.00', currency_code: 'USD' }, // mismatched amount
            },
          },
          status: WebhookStatus.PENDING,
          processingAttempts: WebhookWorker.MAX_ATTEMPTS,
        },
      });

      await WebhookWorker.executeClaimedEvent(eventRecord);

      // Event must NOT be PROCESSED
      const dbEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(dbEvent?.status).toBe(WebhookStatus.FAILED);
      expect(dbEvent?.status).not.toBe(WebhookStatus.PROCESSED);
      expect(dbEvent?.lastError).toMatch(/Financial validation failed/i);

      // Payment must be placed under REQUIRES_REVIEW with details preserved
      const updatedPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(updatedPayment?.status).toBe(PaymentStatus.REQUIRES_REVIEW);
      expect(updatedPayment?.providerCaptureId).toBe(fakeCaptureId);
    });
  });

  // =========================================================================
  // Requirement 3: Capture Mismatch Review State & Transaction Preservation
  // =========================================================================
  describe('3. Capture Mismatch Review State & Preservation', () => {
    it('places provider-confirmed capture with mismatched amount in REQUIRES_REVIEW and preserves details', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `rev-cap-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'rev-cap@example.com',
          customerName: 'Review Capture User',
        });
      const paymentId = orderRes.body.data.paymentId;
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

      const dynamicCapId = `CAP-MISMATCH-REV-${Date.now()}`;
      const captureSpy = vi.spyOn(payPalClient, 'captureOrder').mockResolvedValueOnce({
        id: payment.providerOrderId!,
        status: 'COMPLETED',
        purchase_units: [
          {
            payments: {
              captures: [
                {
                  id: dynamicCapId,
                  status: 'COMPLETED',
                  amount: { value: '1234.56', currency_code: 'USD' }, // amount mismatch
                },
              ],
            },
          },
        ],
      });

      const captureRes = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `cap-rev-key-${Date.now()}`)
        .send({});

      captureSpy.mockRestore();

      expect(captureRes.status).toBe(400);
      expect(captureRes.body.error.message).toMatch(/REQUIRES_REVIEW/i);

      // Verify payment state is REQUIRES_REVIEW, NEVER FAILED
      const updatedPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(updatedPayment?.status).toBe(PaymentStatus.REQUIRES_REVIEW);
      expect(updatedPayment?.status).not.toBe(PaymentStatus.FAILED);
      expect(updatedPayment?.providerCaptureId).toBe(dynamicCapId);
      expect(updatedPayment?.providerStatus).toBe('COMPLETED');
      expect(updatedPayment?.failureReason).toMatch(/Held for reconciliation review/i);
    });
  });

  // =========================================================================
  // Requirement 4: Ledger Protection & Database-Level Uniqueness
  // =========================================================================
  describe('4. Ledger Protection & Concurrency Safety', () => {
    it('enforces database-level uniqueness on (referenceType, referenceId) and safely handles concurrent calls', async () => {
      const paymentId = `test-ledger-payment-${Date.now()}`;

      // Call recordCaptureJournal concurrently twice for the same paymentId
      const [journal1, journal2] = await Promise.all([
        prisma.$transaction((tx) =>
          LedgerService.recordCaptureJournal(tx, {
            paymentId,
            amountMinor: 5000,
            currency: 'USD',
            providerCaptureId: `CAP-${paymentId}`,
          })
        ),
        prisma.$transaction((tx) =>
          LedgerService.recordCaptureJournal(tx, {
            paymentId,
            amountMinor: 5000,
            currency: 'USD',
            providerCaptureId: `CAP-${paymentId}`,
          })
        ),
      ]);

      // Both must return the exact same journal record
      expect(journal1.id).toBe(journal2.id);
      expect(journal1.referenceId).toBe(paymentId);

      // Verify database contains exactly one journal for this payment
      const count = await prisma.ledgerJournal.count({
        where: { referenceId: paymentId },
      });
      expect(count).toBe(1);
    });
  });

  // =========================================================================
  // Requirement 5: Idempotency Recovery, User Isolation & Reliable Persistence
  // =========================================================================
  describe('5. Idempotency Recovery & Session/User Isolation', () => {
    it('prevents cross-user replay of idempotency keys', async () => {
      const sharedKey = `shared-idem-${Date.now()}`;

      // Admin executes an operation with sharedKey
      const resAdmin = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'admin-idem@example.com',
          customerName: 'Admin User',
        });
      expect(resAdmin.status).toBe(201);

      // Viewer attempts to reuse the same key -> must be rejected with 409 Conflict
      const resViewer = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', `Bearer ${viewerToken}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'admin-idem@example.com',
          customerName: 'Admin User',
        });

      expect(resViewer.status).toBe(409);
      expect(resViewer.body.error.message).toMatch(/registered by another user/i);
    });

    it('recovers unlocked idempotency records without saved responses', async () => {
      const crashedKey = `crashed-idem-${Date.now()}`;
      const payload = {
        items: [{ productId: testProductId, quantity: 1 }],
        customerEmail: 'crashed@example.com',
        customerName: 'Crashed Tester',
      };

      // Simulate a crashed request: unlocked record with null response
      await prisma.idempotencyRecord.create({
        data: {
          key: crashedKey,
          operation: 'CREATE_ORDER',
          requestHash: 'placeholder-hash',
          isLocked: false, // unlocked
          responseStatus: null, // no saved response
          responseBody: null,
        },
      });

      // Next request with same key should recover the record and successfully execute
      const res = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', crashedKey)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify the record is now fully persisted with the saved response
      const record = await prisma.idempotencyRecord.findUnique({
        where: { key: crashedKey },
      });
      expect(record?.responseStatus).toBe(201);
      expect(record?.isLocked).toBe(false);
    });

    it('reliably persists the response in PostgreSQL before the client receives the response', async () => {
      const reliableKey = `reliable-idem-${Date.now()}`;

      const res = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', reliableKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'reliable@example.com',
          customerName: 'Reliable Tester',
        });

      expect(res.status).toBe(201);

      // Immediately query database: record MUST already be unlocked with response saved
      const record = await prisma.idempotencyRecord.findUnique({
        where: { key: reliableKey },
      });
      expect(record?.isLocked).toBe(false);
      expect(record?.responseStatus).toBe(201);
      expect(record?.responseBody).toBeDefined();
    });
  });

  // =========================================================================
  // Requirement 6: Sandbox Safety Guardrails
  // =========================================================================
  describe('6. Sandbox Safety Guardrails', () => {
    it('permanently blocks live PayPal API endpoints and throws fatal safety exception', () => {
      // Temporarily set baseUrl to live PayPal endpoint
      const client = payPalClient as any;
      const originalBaseUrl = client.baseUrl;

      client.baseUrl = 'https://api-m.paypal.com';
      expect(() => client.assertSandboxSafety()).toThrow(/Fatal Safety Violation/i);

      client.baseUrl = 'https://api.paypal.com/v1';
      expect(() => client.assertSandboxSafety()).toThrow(/Fatal Safety Violation/i);

      client.baseUrl = originalBaseUrl;
      expect(() => client.assertSandboxSafety()).not.toThrow();
    });
  });
});
