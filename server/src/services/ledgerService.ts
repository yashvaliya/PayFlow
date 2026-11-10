import crypto from 'crypto';
import { Prisma, EntryType, AccountType } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { BadRequestError } from '../utils/errors.js';

export interface PostJournalParams {
  referenceType: 'PAYMENT_CAPTURE' | 'PAYMENT_REFUND' | 'ADJUSTMENT';
  referenceId: string;
  description: string;
  amountMinor: number;
  currency?: string;
}

export class LedgerService {
  /**
   * Helper to ensure standard chart of accounts exists
   */
  public static async ensureAccounts(tx: Prisma.TransactionClient) {
    const defaultAccounts = [
      {
        code: 'PAYPAL_CLEARING',
        name: 'PayPal Clearing Asset',
        type: AccountType.ASSET,
      },
      {
        code: 'MERCHANT_PAYABLE',
        name: 'Merchant Settlement Payable',
        type: AccountType.LIABILITY,
      },
      {
        code: 'REFUND_CLEARING',
        name: 'Refund Clearing Holding',
        type: AccountType.ASSET,
      },
    ];

    for (const acc of defaultAccounts) {
      await tx.ledgerAccount.upsert({
        where: { code: acc.code },
        update: {},
        create: {
          code: acc.code,
          name: acc.name,
          type: acc.type,
          currency: 'USD',
          balanceMinor: 0,
        },
      });
    }
  }

  /**
   * Records a Double-Entry Journal for a confirmed payment capture:
   *   Debit:  PAYPAL_CLEARING (Asset increases)
   *   Credit: MERCHANT_PAYABLE (Liability increases)
   */
  public static async recordCaptureJournal(
    tx: Prisma.TransactionClient,
    params: {
      paymentId: string;
      amountMinor: number;
      currency?: string;
      providerCaptureId?: string;
    }
  ) {
    const currency = params.currency || 'USD';
    const amountMinor = params.amountMinor;

    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new BadRequestError(`Invalid ledger amount: ${amountMinor}`);
    }

    // Check if journal for this payment capture already exists (prevent duplicate posting)
    const existingJournal = await tx.ledgerJournal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: 'PAYMENT_CAPTURE',
          referenceId: params.paymentId,
        },
      },
      include: { entries: true },
    });

    if (existingJournal) {
      // Idempotently return existing journal
      return existingJournal;
    }

    await this.ensureAccounts(tx);

    const paypalClearing = await tx.ledgerAccount.findUniqueOrThrow({
      where: { code: 'PAYPAL_CLEARING' },
    });
    const merchantPayable = await tx.ledgerAccount.findUniqueOrThrow({
      where: { code: 'MERCHANT_PAYABLE' },
    });

    const journalNumber = `JRNL-CAP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const journalId = crypto.randomUUID();
    const description = `Settlement capture for payment ${params.paymentId}${
      params.providerCaptureId ? ` (Capture: ${params.providerCaptureId})` : ''
    }`;

    // Concurrency-safe atomic insert using PostgreSQL ON CONFLICT DO NOTHING
    // Prevents transaction abortion (25P02) under simultaneous race conditions
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ledger_journals (id, "journalNumber", "referenceType", "referenceId", description, "postedAt", "createdAt")
      VALUES (${journalId}, ${journalNumber}, 'PAYMENT_CAPTURE', ${params.paymentId}, ${description}, NOW(), NOW())
      ON CONFLICT ("referenceType", "referenceId") DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) {
      // Conflict occurred: journal already created concurrently! Fetch and return existing
      return await tx.ledgerJournal.findUniqueOrThrow({
        where: {
          referenceType_referenceId: {
            referenceType: 'PAYMENT_CAPTURE',
            referenceId: params.paymentId,
          },
        },
        include: { entries: true },
      });
    }

    // Newly inserted: create balanced entries and update account running balances
    await tx.ledgerEntry.createMany({
      data: [
        {
          journalId,
          accountId: paypalClearing.id,
          entryType: EntryType.DEBIT,
          amountMinor,
          currency,
        },
        {
          journalId,
          accountId: merchantPayable.id,
          entryType: EntryType.CREDIT,
          amountMinor,
          currency,
        },
      ],
    });

    await tx.ledgerAccount.update({
      where: { id: paypalClearing.id },
      data: {
        balanceMinor: { increment: amountMinor },
      },
    });

    await tx.ledgerAccount.update({
      where: { id: merchantPayable.id },
      data: {
        balanceMinor: { increment: amountMinor },
      },
    });

    return await tx.ledgerJournal.findUniqueOrThrow({
      where: { id: journalId },
      include: { entries: true },
    });
  }

  /**
   * Records a Double-Entry Journal for a confirmed refund:
   *   Debit:  MERCHANT_PAYABLE (Liability decreases)
   *   Credit: PAYPAL_CLEARING (Asset decreases)
   */
  public static async recordRefundJournal(
    tx: Prisma.TransactionClient,
    params: {
      refundId: string;
      amountMinor: number;
      currency?: string;
      providerRefundId?: string;
      reason?: string;
    }
  ) {
    const currency = params.currency || 'USD';
    const amountMinor = params.amountMinor;

    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new BadRequestError(`Invalid refund amount: ${amountMinor}`);
    }

    // Check duplicate posting using database unique constraint index
    const existingJournal = await tx.ledgerJournal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: 'PAYMENT_REFUND',
          referenceId: params.refundId,
        },
      },
      include: { entries: true },
    });

    if (existingJournal) {
      return existingJournal;
    }

    await this.ensureAccounts(tx);

    const paypalClearing = await tx.ledgerAccount.findUniqueOrThrow({
      where: { code: 'PAYPAL_CLEARING' },
    });
    const merchantPayable = await tx.ledgerAccount.findUniqueOrThrow({
      where: { code: 'MERCHANT_PAYABLE' },
    });

    const journalNumber = `JRNL-REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const journalId = crypto.randomUUID();
    const description = `Refund reversal for refund ${params.refundId}${
      params.providerRefundId ? ` (Provider ID: ${params.providerRefundId})` : ''
    }${params.reason ? `: ${params.reason}` : ''}`;

    // Concurrency-safe atomic insert using PostgreSQL ON CONFLICT DO NOTHING
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ledger_journals (id, "journalNumber", "referenceType", "referenceId", description, "postedAt", "createdAt")
      VALUES (${journalId}, ${journalNumber}, 'PAYMENT_REFUND', ${params.refundId}, ${description}, NOW(), NOW())
      ON CONFLICT ("referenceType", "referenceId") DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) {
      // Conflict occurred: refund journal already created concurrently! Fetch and return existing
      return await tx.ledgerJournal.findUniqueOrThrow({
        where: {
          referenceType_referenceId: {
            referenceType: 'PAYMENT_REFUND',
            referenceId: params.refundId,
          },
        },
        include: { entries: true },
      });
    }

    // Newly inserted: create balanced entries and update account running balances
    await tx.ledgerEntry.createMany({
      data: [
        {
          journalId,
          accountId: merchantPayable.id,
          entryType: EntryType.DEBIT,
          amountMinor,
          currency,
        },
        {
          journalId,
          accountId: paypalClearing.id,
          entryType: EntryType.CREDIT,
          amountMinor,
          currency,
        },
      ],
    });

    await tx.ledgerAccount.update({
      where: { id: merchantPayable.id },
      data: {
        balanceMinor: { decrement: amountMinor },
      },
    });

    await tx.ledgerAccount.update({
      where: { id: paypalClearing.id },
      data: {
        balanceMinor: { decrement: amountMinor },
      },
    });

    return await tx.ledgerJournal.findUniqueOrThrow({
      where: { id: journalId },
      include: { entries: true },
    });
  }

  /**
   * System-wide accounting invariant verification:
   * Verifies that for EVERY journal in the ledger:
   * SUM(DEBITS) === SUM(CREDITS)
   */
  public static async verifyInvariants(): Promise<{
    balanced: boolean;
    totalJournals: number;
    totalDebitsMinor: number;
    totalCreditsMinor: number;
    imbalances: Array<{
      journalId: string;
      journalNumber: string;
      debits: number;
      credits: number;
      discrepancy: number;
    }>;
  }> {
    const journals = await prisma.ledgerJournal.findMany({
      include: {
        entries: true,
      },
    });

    let systemTotalDebits = 0;
    let systemTotalCredits = 0;
    const imbalances: any[] = [];

    for (const journal of journals) {
      let journalDebits = 0;
      let journalCredits = 0;

      for (const entry of journal.entries) {
        if (entry.entryType === EntryType.DEBIT) {
          journalDebits += entry.amountMinor;
        } else if (entry.entryType === EntryType.CREDIT) {
          journalCredits += entry.amountMinor;
        }
      }

      systemTotalDebits += journalDebits;
      systemTotalCredits += journalCredits;

      if (journalDebits !== journalCredits) {
        imbalances.push({
          journalId: journal.id,
          journalNumber: journal.journalNumber,
          debits: journalDebits,
          credits: journalCredits,
          discrepancy: journalDebits - journalCredits,
        });
      }
    }

    return {
      balanced: imbalances.length === 0 && systemTotalDebits === systemTotalCredits,
      totalJournals: journals.length,
      totalDebitsMinor: systemTotalDebits,
      totalCreditsMinor: systemTotalCredits,
      imbalances,
    };
  }

  /**
   * Get ledger journals with pagination and entries
   */
  public static async getJournals(params: {
    page?: number;
    limit?: number;
    referenceType?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.LedgerJournalWhereInput = {};
    if (params.referenceType) {
      where.referenceType = params.referenceType;
    }

    const [total, journals] = await Promise.all([
      prisma.ledgerJournal.count({ where }),
      prisma.ledgerJournal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { postedAt: 'desc' },
        include: {
          entries: {
            include: {
              account: true,
            },
          },
        },
      }),
    ]);

    return {
      journals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all chart of accounts with current computed and cached balances
   */
  public static async getAccounts() {
    return prisma.ledgerAccount.findMany({
      orderBy: { code: 'asc' },
    });
  }
}
