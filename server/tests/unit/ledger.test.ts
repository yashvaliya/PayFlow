import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { LedgerService } from '../../src/services/ledgerService.js';
import { EntryType } from '@prisma/client';

describe('Double-Entry Ledger Integrity', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('records capture journal and maintains balancing invariant (Debits == Credits)', async () => {
    const testPaymentId = `test-payment-${Date.now()}`;
    const amountMinor = 5000; // $50.00

    const journal = await prisma.$transaction(async (tx) => {
      return LedgerService.recordCaptureJournal(tx, {
        paymentId: testPaymentId,
        amountMinor,
        currency: 'USD',
        providerCaptureId: 'CAP-TEST-123',
      });
    });

    expect(journal).toBeDefined();
    expect(journal.referenceType).toBe('PAYMENT_CAPTURE');
    expect(journal.entries.length).toBe(2);

    const debitEntry = journal.entries.find((e) => e.entryType === EntryType.DEBIT);
    const creditEntry = journal.entries.find((e) => e.entryType === EntryType.CREDIT);

    expect(debitEntry).toBeDefined();
    expect(creditEntry).toBeDefined();
    expect(debitEntry?.amountMinor).toBe(amountMinor);
    expect(creditEntry?.amountMinor).toBe(amountMinor);

    // Debits must exactly equal Credits
    expect(debitEntry?.amountMinor).toBe(creditEntry?.amountMinor);
  });

  it('records refund journal and reverses balances with double-entry balance', async () => {
    const testRefundId = `test-refund-${Date.now()}`;
    const amountMinor = 2000; // $20.00

    const journal = await prisma.$transaction(async (tx) => {
      return LedgerService.recordRefundJournal(tx, {
        refundId: testRefundId,
        amountMinor,
        currency: 'USD',
        providerRefundId: 'REF-TEST-999',
        reason: 'Customer requested return',
      });
    });

    expect(journal).toBeDefined();
    expect(journal.referenceType).toBe('PAYMENT_REFUND');
    expect(journal.entries.length).toBe(2);

    const debit = journal.entries.find((e) => e.entryType === EntryType.DEBIT);
    const credit = journal.entries.find((e) => e.entryType === EntryType.CREDIT);

    expect(debit?.amountMinor).toBe(amountMinor);
    expect(credit?.amountMinor).toBe(amountMinor);
  });

  it('system-wide invariant verification returns balanced = true', async () => {
    const report = await LedgerService.verifyInvariants();
    expect(report.balanced).toBe(true);
    expect(report.imbalances.length).toBe(0);
    expect(report.totalDebitsMinor).toBe(report.totalCreditsMinor);
  });
});
