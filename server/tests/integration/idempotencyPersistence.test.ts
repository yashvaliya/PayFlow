import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';

/**
 * Regression tests for idempotency response persistence.
 *
 * Validates that:
 * 1. Successful DB persistence sends the original response.
 * 2. DB persistence failure does NOT send the original success response.
 * 3. The idempotency lock is NOT released after persistence failure.
 * 4. Retrying the same key after failure re-executes safely via stale-lock recovery.
 * 5. Existing successful idempotency replay continues working.
 * 6. Concurrent requests with the same key remain protected.
 */
describe('Idempotency Response Persistence', () => {
  let testProductId: string;
  let testProductPriceMinor: number;

  // Capture the original prisma update function ONCE before any mocking
  const originalPrismaUpdate = (...args: any[]) =>
    (prisma.idempotencyRecord.update as any)(...args);

  beforeAll(async () => {
    await prisma.$connect();

    const prodRes = await request(app).get('/api/products');
    const prod = prodRes.body.data.products[0];
    testProductId = prod.id;
    testProductPriceMinor = prod.unitAmountMinor;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  /**
   * Helper: installs a mock on prisma.idempotencyRecord.update that fails
   * only the response-persistence call (the one setting isLocked=false + responseBody)
   * for a specific idempotency key.
   *
   * Returns a cleanup function that restores the original.
   */
  function mockPersistenceFailure(targetKey: string): () => void {
    const realUpdate = prisma.idempotencyRecord.update;

    prisma.idempotencyRecord.update = (async (args: any) => {
      if (
        args?.where?.key === targetKey &&
        args?.data?.isLocked === false &&
        args?.data?.responseBody !== undefined
      ) {
        throw new Error('Simulated database persistence failure');
      }
      return realUpdate.call(prisma.idempotencyRecord, args);
    }) as any;

    return () => {
      prisma.idempotencyRecord.update = realUpdate;
    };
  }

  function makePayload(email: string) {
    return {
      items: [{ productId: testProductId, quantity: 1 }],
      customerEmail: email,
      customerName: 'Test User',
    };
  }

  // =========================================================================
  // 1. Successful database persistence sends the original response
  // =========================================================================
  it('sends the original response after successful database persistence', async () => {
    const key = `persist-ok-${Date.now()}`;
    const payload = makePayload('persist-ok@example.com');

    const res = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderId).toBeDefined();

    const record = await prisma.idempotencyRecord.findUnique({ where: { key } });
    expect(record!.isLocked).toBe(false);
    expect(record!.responseStatus).toBe(201);
    expect(record!.responseBody).toBeDefined();
    expect((record!.responseBody as any).success).toBe(true);
  });

  // =========================================================================
  // 2. Database persistence failure does NOT send the original success response
  // =========================================================================
  it('does not send the original success response when database persistence fails', async () => {
    const key = `persist-fail-${Date.now()}`;
    const payload = makePayload('persist-fail@example.com');

    const restore = mockPersistenceFailure(key);

    const res = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    restore();

    // Client must NOT receive 201 — must receive 500 instead
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('IDEMPOTENCY_PERSISTENCE_FAILURE');
  });

  // =========================================================================
  // 3. Idempotency record is NOT unlocked after persistence failure
  // =========================================================================
  it('keeps the idempotency lock held when database persistence fails', async () => {
    const key = `persist-lock-${Date.now()}`;
    const payload = makePayload('persist-lock@example.com');

    const restore = mockPersistenceFailure(key);

    await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    restore();

    const record = await prisma.idempotencyRecord.findUnique({ where: { key } });
    expect(record).toBeDefined();
    expect(record!.isLocked).toBe(true);
    expect(record!.responseStatus).toBeNull();
    expect(record!.responseBody).toBeNull();
  });

  // =========================================================================
  // 4. Retrying the same key cannot execute the financial operation a second time
  // =========================================================================
  it('retrying the same key cannot execute the financial operation a second time', async () => {
    const key = `persist-retry-${Date.now()}`;
    const email = `persist-retry-${Date.now()}@example.com`;
    const payload = makePayload(email);

    // First request: persistence fails, leaving lock held
    const restore = mockPersistenceFailure(key);

    const res1 = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    restore();

    expect(res1.status).toBe(500);

    // Count orders created before retry
    const ordersBefore = await prisma.order.count({
      where: { customerEmail: email },
    });
    expect(ordersBefore).toBe(1);

    // Retry with the same key and payload — cannot execute a second time
    const res2 = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    // Lock remains held, so retry is rejected with 409 Conflict
    expect(res2.status).toBe(409);
    expect(res2.body.error.message).toMatch(/currently being processed/i);

    // Verify no second order was created
    const ordersAfter = await prisma.order.count({
      where: { customerEmail: email },
    });
    expect(ordersAfter).toBe(ordersBefore);

    // Test retrying after the 30-second lock expiry (stale-lock recovery)
    await prisma.idempotencyRecord.update({
      where: { key },
      data: { lockedAt: new Date(Date.now() - 60_000) },
    });

    const res3 = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    // Stale-lock recovery must NOT duplicate the payment operation; it safely replays the completed result
    expect(res3.status).toBe(201);
    expect(res3.headers['x-idempotent-replay']).toBe('true');
    expect(res3.body.success).toBe(true);
    expect(res3.body.data.orderId).toBeDefined();
    expect(res3.body.data.orderNumber).toBeDefined();
    expect(typeof res3.body.data.orderNumber).toBe('string');
    expect(res3.body.data.paymentId).toBeDefined();
    expect(res3.body.data.providerOrderId).toBeDefined();
    expect(res3.body.data.totalAmountMinor).toBe(testProductPriceMinor);
    expect(res3.body.data.currency).toBe('USD');
    expect(res3.body.data.approvalUrl).toBeDefined();
    expect(res3.body.data.status).toBe('PENDING_APPROVAL');

    // Verify order count is STILL exactly 1 (no duplicate operation occurred after lock expiry)
    const ordersFinal = await prisma.order.count({
      where: { customerEmail: email },
    });
    expect(ordersFinal).toBe(ordersBefore);
    expect(ordersFinal).toBe(1);
  });

  // =========================================================================
  // 5. Existing successful idempotency replay continues working
  // =========================================================================
  it('replays the cached response on identical retry after successful persistence', async () => {
    const key = `persist-replay-${Date.now()}`;
    const payload = makePayload('persist-replay@example.com');

    const res1 = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res1.status).toBe(201);
    const originalOrderId = res1.body.data.orderId;

    const res2 = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.headers['x-idempotent-replay']).toBe('true');
    expect(res2.body.data.orderId).toBe(originalOrderId);
  });

  // =========================================================================
  // 6. Concurrent requests with the same key remain protected
  // =========================================================================
  it('rejects concurrent requests with the same idempotency key', async () => {
    const key = `persist-conc-${Date.now()}`;
    const email = `persist-conc-${Date.now()}@example.com`;
    const payload = makePayload(email);

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', key)
        .send(payload),
      request(app)
        .post('/api/payments/orders')
        .set('Idempotency-Key', key)
        .send(payload),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // One request must succeed with 201. The other either gets 409 Conflict (if in-flight)
    // or safely replays with 201 (if the first finished persisting before the second claimed)
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);

    // Crucially: exactly one order exists in the database — no duplicate financial operations
    const orderCount = await prisma.order.count({
      where: { customerEmail: email },
    });
    expect(orderCount).toBe(1);

    const record = await prisma.idempotencyRecord.findUnique({ where: { key } });
    expect(record).toBeDefined();
    expect(record!.isLocked).toBe(false);
    expect(record!.responseStatus).toBe(201);
  });
});
