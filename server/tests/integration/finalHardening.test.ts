import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { payPalClient } from '../../src/integrations/paypal/client.js';
import { WebhookWorker } from '../../src/workers/webhookWorker.js';
import { WebhookService } from '../../src/services/webhookService.js';
import { computeRequestHash } from '../../src/middleware/idempotency.js';
import { PaymentStatus, RefundStatus, WebhookStatus } from '@prisma/client';

describe('Regression Tests: Final Hardening Round', () => {
  let adminToken: string;
  let viewerToken: string;
  let testProductId: string;
  let testProductPriceMinor: number;
  let adminUserId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@payflow.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;
    adminUserId = adminRes.body.data.user?.id;

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
  // 1. Refund Validation: Only explicit COMPLETED status posts ledger entries
  // =========================================================================
  describe('1. Refund Status Validation', () => {
    it('rejects refund with unexpected provider status (e.g., CANCELLED) and posts no ledger entries', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `rfv-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'rfv-cancel@example.com',
          customerName: 'Refund Cancel Test',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `rfv-cap-${Date.now()}`)
        .send({});

      // Mock PayPal returning an unexpected status 'CANCELLED'
      const refundSpy = vi.spyOn(payPalClient, 'refundCapture').mockResolvedValueOnce({
        id: `MOCK-REF-CANCEL-${Date.now()}`,
        status: 'CANCELLED',
        amount: { value: '10.00', currency_code: 'USD' },
        create_time: new Date().toISOString(),
      });

      const refundKey = `rfv-ref-cancel-${Date.now()}`;
      const refundRes = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', refundKey)
        .send({ amountMinor: 1000, reason: 'Testing unexpected status' });

      refundSpy.mockRestore();

      expect(refundRes.status).toBe(400);
      expect(refundRes.body.error.message).toMatch(/CANCELLED/);

      // Verify refund record is FAILED, not COMPLETED
      const refund = await prisma.refund.findUnique({ where: { idempotencyKey: refundKey } });
      expect(refund?.status).toBe(RefundStatus.FAILED);

      // Verify no refund ledger journal was posted
      const journals = await prisma.ledgerJournal.findMany({
        where: { referenceType: 'PAYMENT_REFUND', referenceId: refund?.id },
      });
      expect(journals.length).toBe(0);
    });

    it('rejects refund when provider returns missing status and posts no ledger entries', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `rfv-miss-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'rfv-miss@example.com',
          customerName: 'Refund Missing Status',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `rfv-miss-cap-${Date.now()}`)
        .send({});

      // Mock PayPal returning no status field at all
      const refundSpy = vi.spyOn(payPalClient, 'refundCapture').mockResolvedValueOnce({
        id: `MOCK-REF-NOSTATUS-${Date.now()}`,
        amount: { value: '10.00', currency_code: 'USD' },
        create_time: new Date().toISOString(),
      });

      const refundKey = `rfv-ref-miss-${Date.now()}`;
      const refundRes = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', refundKey)
        .send({ amountMinor: 1000, reason: 'Testing missing status' });

      refundSpy.mockRestore();

      expect(refundRes.status).toBe(400);
      expect(refundRes.body.error.message).toMatch(/MISSING/);

      const refund = await prisma.refund.findUnique({ where: { idempotencyKey: refundKey } });
      expect(refund?.status).toBe(RefundStatus.FAILED);
    });

    it('rejects refund when provider returns COMPLETED but amount or currency fields are missing', async () => {
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `rfv-noamt-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'rfv-noamt@example.com',
          customerName: 'Refund No Amount',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `rfv-noamt-cap-${Date.now()}`)
        .send({});

      // Mock PayPal returning COMPLETED but without amount fields
      const refundSpy = vi.spyOn(payPalClient, 'refundCapture').mockResolvedValueOnce({
        id: `MOCK-REF-NOAMT-${Date.now()}`,
        status: 'COMPLETED',
        create_time: new Date().toISOString(),
      });

      const refundKey = `rfv-ref-noamt-${Date.now()}`;
      const refundRes = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', refundKey)
        .send({ amountMinor: 1000, reason: 'Testing missing amount' });

      refundSpy.mockRestore();

      expect(refundRes.status).toBe(400);
      expect(refundRes.body.error.message).toMatch(/missing required amount/i);

      const refund = await prisma.refund.findUnique({ where: { idempotencyKey: refundKey } });
      expect(refund?.status).toBe(RefundStatus.FAILED);
    });

    it('rejects webhook refund with non-COMPLETED status', async () => {
      await prisma.webhookEvent.deleteMany({});

      // Create a payment to match against
      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `rfv-wh-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'rfv-wh@example.com',
          customerName: 'Refund Webhook Test',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `rfv-wh-cap-${Date.now()}`)
        .send({});

      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

      const refundId = `WEBHOOK-REF-PENDING-${Date.now()}`;
      const eventId = `WH-REFPEND-${Date.now()}`;

      const eventRecord = await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.REFUNDED',
          payload: {
            id: eventId,
            resource: {
              id: refundId,
              status: 'PENDING', // Non-COMPLETED status
              amount: { value: '10.00', currency_code: 'USD' },
              links: [{ rel: 'up', href: `https://api.sandbox.paypal.com/v2/payments/captures/${payment.providerCaptureId}` }],
            },
          },
          status: WebhookStatus.PENDING,
          processingAttempts: WebhookWorker.MAX_ATTEMPTS,
        },
      });

      await WebhookWorker.executeClaimedEvent(eventRecord);

      const dbEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(dbEvent?.status).toBe(WebhookStatus.FAILED);
      expect(dbEvent?.lastError).toMatch(/non-COMPLETED status/i);
    });

    it('rejects webhook refund with currency mismatch', async () => {
      await prisma.webhookEvent.deleteMany({});

      const orderRes = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', `rfv-whcur-ord-${Date.now()}`)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'rfv-whcur@example.com',
          customerName: 'Refund Webhook Currency Test',
        });
      const paymentId = orderRes.body.data.paymentId;

      await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Idempotency-Key', `rfv-whcur-cap-${Date.now()}`)
        .send({});

      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

      const refundId = `WEBHOOK-REF-EUR-${Date.now()}`;
      const eventId = `WH-REFEUR-${Date.now()}`;

      const eventRecord = await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.REFUNDED',
          payload: {
            id: eventId,
            resource: {
              id: refundId,
              status: 'COMPLETED',
              amount: { value: '10.00', currency_code: 'EUR' }, // Wrong currency
              links: [{ rel: 'up', href: `https://api.sandbox.paypal.com/v2/payments/captures/${payment.providerCaptureId}` }],
            },
          },
          status: WebhookStatus.PENDING,
          processingAttempts: WebhookWorker.MAX_ATTEMPTS,
        },
      });

      await WebhookWorker.executeClaimedEvent(eventRecord);

      const dbEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(dbEvent?.status).toBe(WebhookStatus.FAILED);
      expect(dbEvent?.lastError).toMatch(/currency mismatch/i);
    });
  });

  // =========================================================================
  // 2. Webhook Worker: claimedAt lease timestamp and error handling
  // =========================================================================
  describe('2. Webhook Worker Lease Timestamp', () => {
    it('sets claimedAt atomically when claiming an event', async () => {
      await prisma.webhookEvent.deleteMany({});
      const eventId = `WH-LEASE-${Date.now()}`;
      await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          payload: { id: eventId },
          status: WebhookStatus.PENDING,
          processingAttempts: 0,
          claimedAt: null,
        },
      });

      const claimed = await WebhookWorker.claimNextEvent();
      expect(claimed).toBeDefined();
      expect(claimed?.eventId).toBe(eventId);

      // Verify claimedAt was set in the database
      const dbEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(dbEvent?.status).toBe(WebhookStatus.PROCESSING);
      expect(dbEvent?.claimedAt).toBeDefined();
      expect(dbEvent?.claimedAt).not.toBeNull();

      // claimedAt should be very recent (within 5 seconds)
      const claimedAge = Date.now() - dbEvent!.claimedAt!.getTime();
      expect(claimedAge).toBeLessThan(5000);
    });

    it('does NOT reclaim an actively processed event with recent claimedAt', async () => {
      await prisma.webhookEvent.deleteMany({});
      const eventId = `WH-ACTIVE-${Date.now()}`;
      await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          payload: { id: eventId },
          status: WebhookStatus.PROCESSING,
          processingAttempts: 1,
          claimedAt: new Date(), // Just claimed — fresh lease
        },
      });

      // Another worker should NOT be able to claim this
      const claimed = await WebhookWorker.claimNextEvent();
      expect(claimed).toBeNull();
    });

    it('reclaims a stale event whose claimedAt lease has expired', async () => {
      await prisma.webhookEvent.deleteMany({});
      const eventId = `WH-STALE-${Date.now()}`;
      const staleTime = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago, exceeds 2-minute lease
      await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          payload: { id: eventId },
          status: WebhookStatus.PROCESSING,
          processingAttempts: 1,
          claimedAt: staleTime,
        },
      });

      const claimed = await WebhookWorker.claimNextEvent();
      expect(claimed).toBeDefined();
      expect(claimed?.eventId).toBe(eventId);
      expect(claimed?.processingAttempts).toBe(2);

      // Verify claimedAt was refreshed
      const dbEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(dbEvent!.claimedAt!.getTime()).toBeGreaterThan(staleTime.getTime());
    });

    it('does NOT reclaim PROCESSING events with null claimedAt (prevents legacy data issues)', async () => {
      await prisma.webhookEvent.deleteMany({});
      const eventId = `WH-NULL-CLAIM-${Date.now()}`;
      await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          payload: { id: eventId },
          status: WebhookStatus.PROCESSING,
          processingAttempts: 1,
          claimedAt: null, // No claimedAt — should NOT be reclaimed by lease logic
        },
      });

      const claimed = await WebhookWorker.claimNextEvent();
      expect(claimed).toBeNull();
    });
  });

  // =========================================================================
  // 3. Idempotency: Hash verification, user/guest identity, atomic recovery
  // =========================================================================
  describe('3. Idempotency Hardening', () => {
    it('never replaces an existing request hash during stale-lock recovery when payload differs', async () => {
      const crashedKey = `idem-nohash-${Date.now()}`;
      const originalPayload = {
        items: [{ productId: testProductId, quantity: 1 }],
        customerEmail: 'original@example.com',
        customerName: 'Original User',
      };
      const originalHash = computeRequestHash(originalPayload);

      // Simulate a stale-locked record with a known hash
      await prisma.idempotencyRecord.create({
        data: {
          key: crashedKey,
          operation: 'CREATE_ORDER',
          requestHash: originalHash,
          requestPayload: originalPayload,
          isLocked: true,
          lockedAt: new Date(Date.now() - 60_000), // 60s ago — stale
        },
      });

      // Attempt recovery with a DIFFERENT payload — must be rejected, NOT overwritten
      const differentPayload = {
        items: [{ productId: testProductId, quantity: 2 }],
        customerEmail: 'different@example.com',
        customerName: 'Different User',
      };

      const res = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', crashedKey)
        .send(differentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/different request payload/i);

      // Verify the original hash was NOT overwritten in the database
      const record = await prisma.idempotencyRecord.findUnique({ where: { key: crashedKey } });
      expect(record?.requestHash).toBe(originalHash);
    });

    it('prevents a guest from accessing an authenticated user key', async () => {
      const sharedKey = `idem-auth-guest-${Date.now()}`;

      // Authenticated user creates the key
      const res1 = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'auth@example.com',
          customerName: 'Auth User',
        });
      expect(res1.status).toBe(201);

      // Guest (no auth header) tries to reuse the same key — must be rejected
      const res2 = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', sharedKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'auth@example.com',
          customerName: 'Auth User',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.message).toMatch(/registered by another user/i);
    });

    it('prevents an authenticated user from accessing a guest key', async () => {
      const guestKey = `idem-guest-auth-${Date.now()}`;

      // Guest (no auth) creates the key
      const res1 = await request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', guestKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'guest@example.com',
          customerName: 'Guest User',
        });
      expect(res1.status).toBe(201);

      // Authenticated user tries to reuse the same key — must be rejected
      const res2 = await request(app)
        .post('/api/payments/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', guestKey)
        .send({
          items: [{ productId: testProductId, quantity: 1 }],
          customerEmail: 'guest@example.com',
          customerName: 'Guest User',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.message).toMatch(/registered by another user/i);
    });

    it('makes stale-lock recovery atomic — concurrent recovery attempts do not both succeed', async () => {
      const staleKey = `idem-atomic-${Date.now()}`;
      const payload = {
        items: [{ productId: testProductId, quantity: 1 }],
        customerEmail: 'atomic@example.com',
        customerName: 'Atomic Test',
      };
      const hash = computeRequestHash(payload);

      // Create a stale-locked record
      await prisma.idempotencyRecord.create({
        data: {
          key: staleKey,
          operation: 'CREATE_ORDER',
          requestHash: hash,
          requestPayload: payload,
          isLocked: true,
          lockedAt: new Date(Date.now() - 60_000), // 60s ago — stale
        },
      });

      // Fire two concurrent recovery requests with the same payload
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/payments/orders')
          .set('Idempotency-Key', staleKey)
          .send(payload),
        request(app)
          .post('/api/payments/orders')
          .set('Idempotency-Key', staleKey)
          .send(payload),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // One should succeed (201). The other either gets conflict (409) if it
      // arrives while the first is still executing, or replays (201 with
      // X-Idempotent-Replay) if it arrives after the first completes.
      // Both outcomes are correct — the key invariant is no double-execution.
      expect(statuses[0]).toBe(201);
      expect([201, 409]).toContain(statuses[1]);

      // Verify exactly one order was created for this key
      const record = await prisma.idempotencyRecord.findUnique({ where: { key: staleKey } });
      expect(record).toBeDefined();
      expect(record!.isLocked).toBe(false);
      expect(record!.responseStatus).toBe(201);
    });
  });
});
