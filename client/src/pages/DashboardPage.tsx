import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatCents, formatDate } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  TrendingUp,
  RotateCcw,
  Clock,
  Building2,
  ArrowRight,
  RefreshCw,
  CreditCard,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['dashboardSummary'],
    queryFn: () => api.getDashboardSummary(),
    refetchInterval: 10000,
  });

  const {
    data: analyticsData,
    isLoading: isAnalyticsLoading,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['dashboardAnalytics'],
    queryFn: () => api.getDashboardAnalytics(),
    refetchInterval: 10000,
  });

  const summary = summaryData?.data;
  const analytics = analyticsData?.data;

  const chartVolumeData = (analytics?.volumeOverTime || []).map((item) => ({
    date: item.date.slice(5), // MM-DD
    volume: item.volumeMinor / 100, // in dollars
    count: item.count,
  }));

  const pieColors: Record<string, string> = {
    COMPLETED: '#10b981',
    PARTIALLY_REFUNDED: '#8b5cf6',
    REFUNDED: '#a855f7',
    PENDING_APPROVAL: '#3b82f6',
    CREATED: '#60a5fa',
    FAILED: '#ef4444',
    CANCELLED: '#6b7280',
  };

  const statusDistributionData = (analytics?.statusDistribution || []).map((item) => ({
    name: item.status.replace('_', ' '),
    value: item.count,
    color: pieColors[item.status] || '#94a3b8',
  }));

  const handleRefresh = () => {
    refetchSummary();
    refetchAnalytics();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Merchant Overview &amp; Settlements
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Authoritative, database-backed settlement metrics and financial activity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="px-3.5 py-2 rounded-xl bg-card border border-border text-foreground hover:bg-muted text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Metrics</span>
          </button>
          <Link
            to="/checkout"
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-95 text-xs font-semibold flex items-center gap-2 shadow-sm transition-opacity"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>New Demo Payment</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Captured Volume */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Gross Captured
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {isSummaryLoading ? '...' : formatCents(summary?.totalVolumeMinor || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>{summary?.successfulCount || 0} confirmed captures</span>
            </div>
          </div>
        </div>

        {/* Net Merchant Payable */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Net Merchant Payable
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {isSummaryLoading ? '...' : formatCents(summary?.merchantPayableBalanceMinor || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                MERCHANT_PAYABLE
              </span>
              <span>liability account</span>
            </div>
          </div>
        </div>

        {/* Total Refunds */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Refunds
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {isSummaryLoading ? '...' : formatCents(summary?.totalRefundedVolumeMinor || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              <span>{summary?.totalRefundsCount || 0} executed reversals</span>
            </div>
          </div>
        </div>

        {/* Pending & Failed Transactions */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              In-Flight / Failed
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-4">
            <div>
              <div className="text-2xl font-extrabold text-foreground">
                {isSummaryLoading ? '...' : summary?.pendingCount || 0}
              </div>
              <div className="text-[11px] text-muted-foreground">Pending</div>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
                {isSummaryLoading ? '...' : summary?.failedCount || 0}
              </div>
              <div className="text-[11px] text-muted-foreground">Failed/Cancelled</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settlement Volume Over Time */}
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Settlement Volume (Last 30 Days)</h2>
              <p className="text-xs text-muted-foreground">Confirmed captured payment volume in USD ($)</p>
            </div>
          </div>
          <div className="h-72 w-full">
            {isAnalyticsLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Loading analytics...
              </div>
            ) : chartVolumeData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No recent transaction volume recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartVolumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Captured Volume']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#volumeGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Status Breakdown Pie */}
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Payment Status Distribution</h2>
            <p className="text-xs text-muted-foreground">Current lifecycle states across all orders</p>
          </div>
          <div className="h-72 w-full flex items-center justify-center">
            {isAnalyticsLoading ? (
              <div className="text-xs text-muted-foreground">Loading status breakdown...</div>
            ) : statusDistributionData.length === 0 ? (
              <div className="text-xs text-muted-foreground">No transactions available.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [`${value} orders`, name]} />
                  <Legend verticalAlign="bottom" height={36} iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Recent Payment Operations</h2>
            <p className="text-xs text-muted-foreground">Authoritative ledger transactions and real-time state</p>
          </div>
          <Link
            to="/transactions"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="pb-3 px-3">Order #</th>
                <th className="pb-3 px-3">Customer</th>
                <th className="pb-3 px-3">Amount</th>
                <th className="pb-3 px-3">Status</th>
                <th className="pb-3 px-3">PayPal Order ID</th>
                <th className="pb-3 px-3">Date</th>
                <th className="pb-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isAnalyticsLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading recent activity...
                  </td>
                </tr>
              ) : !analytics?.recentActivity || analytics.recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No transactions found. Complete a payment via Checkout to see it here!
                  </td>
                </tr>
              ) : (
                analytics.recentActivity.map((payment) => (
                  <tr key={payment.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-medium text-foreground">
                      {payment.order?.orderNumber || 'N/A'}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-foreground">{payment.order?.customerName || 'N/A'}</div>
                      <div className="text-[11px] text-muted-foreground">{payment.order?.customerEmail}</div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-foreground">
                      {formatCents(payment.amountMinor)}
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className="py-3 px-3 font-mono text-muted-foreground">
                      {payment.providerOrderId || '—'}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        to={`/transactions/${payment.id}`}
                        className="px-2.5 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
