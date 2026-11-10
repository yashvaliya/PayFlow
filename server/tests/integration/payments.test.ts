import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';

describe('Payments & Idempotency Integration Tests', () => {
  let adminToken: string;
  let viewerToken: string;
  let testProductId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Authenticate Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@payflow.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;

    // Authenticate Viewer
    const viewerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'viewer@payflow.internal', password: 'ViewerPassword123!' });
    viewerToken = viewerRes.body.data.token;

    // Fetch a seeded product
    const prodRes = await request(app).get('/api/products');
    expect(prodRes.body.data.products.length).toBeGreaterThan(0);
    testProductId = prodRes.body.data.products[0].id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects order creation without Idempotency-Key header', async () => {
    const res = await request(app)
      .post('/api/payments/orders')
      .send({
        items: [{ productId: testProductId, quantity: 1 }],
        customerEmail: 'customer@example.com',
        customerName: 'Alice Customer',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toMatch(/Idempotency-Key/);
  });

  it('creates an order with server-calculated totals when Idempotency-Key is provided', async () => {
    const idempotencyKey = `idem-test-${Date.now()}`;

    const res = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [{ productId: testProductId, quantity: 2 }],
        customerEmail: 'customer@example.com',
        customerName: 'Alice Customer',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.paymentId).toBeDefined();
    expect(res.body.data.totalAmountMinor).toBeGreaterThan(0);
  });

  it('replays identical cached response on repeated request with identical Idempotency-Key', async () => {
    const idempotencyKey = `idem-replay-${Date.now()}`;
    const payload = {
      items: [{ productId: testProductId, quantity: 1 }],
      customerEmail: 'bob@example.com',
      customerName: 'Bob Replay',
    };

    // First request
    const res1 = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    const orderId1 = res1.body.data.orderId;

    // Second request with same key and payload
    const res2 = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.headers['x-idempotent-replay']).toBe('true');
    expect(res2.body.data.orderId).toBe(orderId1);
  });

  it('rejects reuse of Idempotency-Key when request payload differs (409 Conflict)', async () => {
    const idempotencyKey = `idem-conflict-${Date.now()}`;

    // First request
    await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [{ productId: testProductId, quantity: 1 }],
        customerEmail: 'charlie@example.com',
        customerName: 'Charlie Original',
      });

    // Second request with different body
    const conflictRes = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [{ productId: testProductId, quantity: 5 }], // changed quantity!
        customerEmail: 'charlie@example.com',
        customerName: 'Charlie Tampered',
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe('CONFLICT');
  });

  it('captures an order payment, creates double-entry ledger entries, and completes order', async () => {
    const createKey = `create-cap-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', createKey)
      .send({
        items: [{ productId: testProductId, quantity: 1 }],
        customerEmail: 'capture-user@example.com',
        customerName: 'Capture User',
      });

    const paymentId = createRes.body.data.paymentId;
    const captureKey = `cap-key-${Date.now()}`;

    const captureRes = await request(app)
      .post(`/api/payments/${paymentId}/capture`)
      .set('Idempotency-Key', captureKey)
      .send({});

    expect(captureRes.status).toBe(200);
    expect(captureRes.body.success).toBe(true);
    expect(captureRes.body.data.payment.status).toBe('COMPLETED');
    expect(captureRes.body.data.payment.ledgerJournals.length).toBeGreaterThan(0);
  });

  it('forbids refund execution by VIEWER role and allows by ADMIN role', async () => {
    // 1. Create and capture a payment
    const createRes = await request(app)
      .post('/api/payments/orders')
      .set('Idempotency-Key', `create-ref-${Date.now()}`)
      .send({
        items: [{ productId: testProductId, quantity: 1 }],
        customerEmail: 'refund-test@example.com',
        customerName: 'Refund Test',
      });

    const paymentId = createRes.body.data.paymentId;

    await request(app)
      .post(`/api/payments/${paymentId}/capture`)
      .set('Idempotency-Key', `cap-ref-${Date.now()}`)
      .send({});

    // 2. Attempt refund as VIEWER -> Should be 403 Forbidden
    const viewerAttempt = await request(app)
      .post(`/api/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .set('Idempotency-Key', `ref-viewer-${Date.now()}`)
      .send({ reason: 'Unauthorized viewer refund' });

    expect(viewerAttempt.status).toBe(403);
    expect(viewerAttempt.body.error.code).toBe('FORBIDDEN');

    // 3. Attempt refund as ADMIN -> Should succeed (200)
    const adminAttempt = await request(app)
      .post(`/api/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `ref-admin-${Date.now()}`)
      .send({ reason: 'Authorized admin refund' });

    expect(adminAttempt.status).toBe(200);
    expect(adminAttempt.body.success).toBe(true);
    expect(adminAttempt.body.data.payment.status).toBe('REFUNDED');
  });

  it('deduplicates incoming webhooks on eventId', async () => {
    const eventId = `WH-EVT-${Date.now()}`;
    const payload = {
      id: eventId,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAP-WH-123',
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
  });
});
