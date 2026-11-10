import { PaymentStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export class DashboardService {
  /**
   * Retrieves live high-level merchant KPI metrics directly from PostgreSQL
   */
  public static async getSummary() {
    // 1. Captured Payments metrics
    const completedPayments = await prisma.payment.aggregate({
      where: {
        status: {
          in: [
            PaymentStatus.COMPLETED,
            PaymentStatus.PARTIALLY_REFUNDED,
            PaymentStatus.REFUNDED,
          ],
        },
      },
      _sum: {
        amountMinor: true,
        refundedAmountMinor: true,
      },
      _count: {
        id: true,
      },
    });

    // 2. Count by statuses
    const [pendingCount, failedCount, totalRefundsCount] = await Promise.all([
      prisma.payment.count({
        where: {
          status: {
            in: [PaymentStatus.CREATED, PaymentStatus.PENDING_APPROVAL, PaymentStatus.APPROVED],
          },
        },
      }),
      prisma.payment.count({
        where: {
          status: { in: [PaymentStatus.FAILED, PaymentStatus.CANCELLED] },
        },
      }),
      prisma.refund.count({
        where: { status: 'COMPLETED' },
      }),
    ]);

    // 3. Merchant payable ledger balance from ledger_accounts
    const merchantPayableAccount = await prisma.ledgerAccount.findUnique({
      where: { code: 'MERCHANT_PAYABLE' },
    });

    const totalCapturedVolumeMinor = completedPayments._sum.amountMinor || 0;
    const totalRefundedVolumeMinor = completedPayments._sum.refundedAmountMinor || 0;
    const netVolumeMinor = totalCapturedVolumeMinor - totalRefundedVolumeMinor;

    return {
      totalVolumeMinor: totalCapturedVolumeMinor,
      netVolumeMinor,
      successfulCount: completedPayments._count.id || 0,
      pendingCount,
      failedCount,
      totalRefundsCount,
      totalRefundedVolumeMinor,
      merchantPayableBalanceMinor: merchantPayableAccount?.balanceMinor ?? netVolumeMinor,
      currency: 'USD',
    };
  }

  /**
   * Retrieves analytics time series and status distribution for charts
   */
  public static async getAnalytics() {
    // 1. Status distribution
    const statusCounts = await prisma.payment.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { amountMinor: true },
    });

    // 2. Volume over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCompleted = await prisma.payment.findMany({
      where: {
        status: {
          in: [
            PaymentStatus.COMPLETED,
            PaymentStatus.PARTIALLY_REFUNDED,
            PaymentStatus.REFUNDED,
          ],
        },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        amountMinor: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by YYYY-MM-DD
    const volumeByDateMap = new Map<string, { date: string; volumeMinor: number; count: number }>();

    for (let d = 29; d >= 0; d--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      const dateStr = dt.toISOString().split('T')[0];
      volumeByDateMap.set(dateStr, { date: dateStr, volumeMinor: 0, count: 0 });
    }

    for (const item of recentCompleted) {
      const dateStr = item.createdAt.toISOString().split('T')[0];
      if (volumeByDateMap.has(dateStr)) {
        const bucket = volumeByDateMap.get(dateStr)!;
        bucket.volumeMinor += item.amountMinor;
        bucket.count += 1;
      }
    }

    // 3. Recent 10 payments activity
    const recentActivity = await prisma.payment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            orderNumber: true,
            customerEmail: true,
            customerName: true,
          },
        },
      },
    });

    return {
      volumeOverTime: Array.from(volumeByDateMap.values()),
      statusDistribution: statusCounts.map((s) => ({
        status: s.status,
        count: s._count.id,
        amountMinor: s._sum.amountMinor || 0,
      })),
      recentActivity,
    };
  }
}
