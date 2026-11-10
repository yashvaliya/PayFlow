import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatCents, formatDate } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

export const TransactionsPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'createdAt' | 'amountMinor'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, search, statusFilter, sortBy, sortOrder],
    queryFn: () =>
      api.listPayments({
        page,
        limit: 15,
        search: search.trim() || undefined,
        status: statusFilter,
        sortBy,
        sortOrder,
      }),
  });

  const payments = data?.data?.payments || [];
  const meta = data?.meta || { page: 1, limit: 15, total: 0, totalPages: 1 };

  const handleSortToggle = (field: 'createdAt' | 'amountMinor') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Transaction Ledger &amp; History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, filter, and audit all payment attempts, capture records, and refund transactions.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Payment ID, Order #, or Email..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-background border border-input text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
            <option value="REFUNDED">Refunded</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <button
            onClick={() => handleSortToggle('createdAt')}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              sortBy === 'createdAt'
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-background border-input text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Date {sortBy === 'createdAt' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</span>
          </button>

          <button
            onClick={() => handleSortToggle('amountMinor')}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              sortBy === 'amountMinor'
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-background border-input text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Amount {sortBy === 'amountMinor' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</span>
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="pb-3 px-3">Order Number</th>
                <th className="pb-3 px-3">Customer</th>
                <th className="pb-3 px-3">Amount</th>
                <th className="pb-3 px-3">Status</th>
                <th className="pb-3 px-3">Refunded</th>
                <th className="pb-3 px-3">PayPal Order ID</th>
                <th className="pb-3 px-3">Date</th>
                <th className="pb-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    Loading transactions...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No transactions found matching your criteria.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3.5 px-3 font-mono font-medium text-foreground">
                      {p.order?.orderNumber || p.id.slice(0, 8)}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="font-medium text-foreground">{p.order?.customerName || 'Guest'}</div>
                      <div className="text-[11px] text-muted-foreground">{p.order?.customerEmail}</div>
                    </td>
                    <td className="py-3.5 px-3 font-bold text-foreground">
                      {formatCents(p.amountMinor)}
                    </td>
                    <td className="py-3.5 px-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {p.refundedAmountMinor > 0 ? (
                        <span className="text-purple-600 dark:text-purple-400 font-medium">
                          {formatCents(p.refundedAmountMinor)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-muted-foreground">
                      {p.providerOrderId || '—'}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <Link
                        to={`/transactions/${p.id}`}
                        className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs inline-flex items-center gap-1.5 transition-colors"
                      >
                        <span>Audit</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing <span className="font-semibold text-foreground">{payments.length}</span> of{' '}
            <span className="font-semibold text-foreground">{meta.total}</span> transactions
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-foreground px-2">
              Page {page} of {meta.totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="p-1.5 rounded-lg border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
