import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatCents, formatDate, generateIdempotencyKey } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  ArrowLeft,
  Receipt,
  RotateCcw,
  Clock,
  BookOpenCheck,
  Loader2,
  Lock,
} from 'lucide-react';

export const TransactionDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['paymentDetails', id],
    queryFn: () => api.getPayment(id!),
    enabled: Boolean(id),
  });

  const payment = data?.data?.payment;

  // Refund Modal State
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundAmountDollars, setRefundAmountDollars] = useState<string>('');
  const [refundReason, setRefundReason] = useState('Customer return / settlement adjustment');
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-xs text-muted-foreground">
        Loading transaction audit trail...
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-xl font-bold">Transaction Not Found</h2>
        <Link to="/transactions" className="text-xs text-primary hover:underline">
          Return to Transactions
        </Link>
      </div>
    );
  }

  const remainingRefundableMinor = payment.amountMinor - payment.refundedAmountMinor;
  const isRefundEligible =
    (payment.status === 'COMPLETED' || payment.status === 'PARTIALLY_REFUNDED') &&
    remainingRefundableMinor > 0;

  const handleExecuteRefund = async () => {
    try {
      setRefundError(null);
      setIsRefunding(true);

      const minorUnits = refundAmountDollars
        ? Math.round(parseFloat(refundAmountDollars) * 100)
        : remainingRefundableMinor;

      if (minorUnits <= 0 || minorUnits > remainingRefundableMinor) {
        throw new Error(
          `Refund amount must be between $0.01 and ${formatCents(remainingRefundableMinor)}`
        );
      }

      const idempotencyKey = generateIdempotencyKey('IDEM-REF');
      await api.refundPayment(
        payment.id,
        {
          amountMinor: minorUnits,
          reason: refundReason,
        },
        idempotencyKey
      );

      setIsRefundModalOpen(false);
      refetch();
    } catch (err: any) {
      setRefundError(err.message || 'Refund operation failed');
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/transactions"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Transactions</span>
        </Link>

        {/* Refund CTA button */}
        {isRefundEligible && (
          <button
            onClick={() => {
              setRefundAmountDollars((remainingRefundableMinor / 100).toFixed(2));
              setIsRefundModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Process Refund</span>
          </button>
        )}
      </div>

      {/* Header Info Banner */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              Order: {payment.order?.orderNumber}
            </span>
            <StatusBadge status={payment.status} size="md" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground mt-2">
            {formatCents(payment.amountMinor, payment.currency)}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Initiated on {formatDate(payment.createdAt)}
            {payment.completedAt && ` • Settled on ${formatDate(payment.completedAt)}`}
          </p>
        </div>

        {/* Customer & Provider Quick Summary */}
        <div className="bg-muted/50 p-4 rounded-2xl border border-border text-xs space-y-1.5 font-mono min-w-[280px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Customer:</span>
            <span className="font-semibold text-foreground truncate max-w-[160px]">
              {payment.order?.customerName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Email:</span>
            <span className="text-foreground truncate max-w-[160px]">
              {payment.order?.customerEmail}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">PayPal Order ID:</span>
            <span className="text-primary font-semibold truncate max-w-[160px]">
              {payment.providerOrderId || '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Capture ID:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[160px]">
              {payment.providerCaptureId || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Section: Audit Details & Items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Purchased Items */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            <span>Purchased Line Items</span>
          </h2>

          <div className="divide-y divide-border text-xs">
            {payment.order?.items?.map((item) => (
              <div key={item.id} className="py-2.5 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-foreground">{item.product?.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Qty: {item.quantity} × {formatCents(item.unitAmountMinor)}
                  </div>
                </div>
                <div className="font-bold text-foreground">{formatCents(item.totalAmountMinor)}</div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-border flex justify-between items-baseline text-xs font-semibold">
            <span>Authoritative Total</span>
            <span className="text-sm font-extrabold text-foreground">
              {formatCents(payment.amountMinor)}
            </span>
          </div>
        </div>

        {/* State Transition Timeline */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span>State Machine Audit Trail</span>
          </h2>

          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-border">
            {payment.stateTransitions?.map((trans) => (
              <div key={trans.id} className="relative flex items-start gap-3 pl-1 text-xs">
                <div className="w-4 h-4 rounded-full bg-primary/20 border-2 border-primary z-10 shrink-0 mt-0.5" />
                <div className="flex-1 bg-muted/40 p-2.5 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">
                      {trans.fromStatus} → {trans.toStatus}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(trans.createdAt)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{trans.reason}</div>
                  <div className="text-[9px] font-mono text-primary mt-1">
                    Triggered by: {trans.triggeredBy}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Double-Entry Ledger Journals Associated with this Payment */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <BookOpenCheck className="w-4 h-4 text-primary" />
            <span>Associated Double-Entry Ledger Journals</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            Balanced debits &amp; credits invariant
          </span>
        </div>

        {payment.ledgerJournals && payment.ledgerJournals.length > 0 ? (
          <div className="space-y-4">
            {payment.ledgerJournals.map((j) => (
              <div key={j.id} className="p-4 rounded-2xl bg-muted/30 border border-border text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-foreground">{j.journalNumber}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDate(j.postedAt)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{j.description}</div>

                {/* Entry lines */}
                <div className="mt-2 divide-y divide-border/60 bg-card rounded-xl p-3 border border-border font-mono text-[11px]">
                  {j.entries.map((entry) => (
                    <div key={entry.id} className="py-1.5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            entry.entryType === 'DEBIT'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {entry.entryType}
                        </span>
                        <span className="text-foreground font-semibold">{entry.account?.code}</span>
                      </div>
                      <span className="font-bold text-foreground">
                        {formatCents(entry.amountMinor)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border">
            No ledger journal posted yet (payment has not been confirmed captured).
          </div>
        )}
      </div>

      {/* Refunds History */}
      {payment.refunds && payment.refunds.length > 0 && (
        <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-purple-600" />
            <span>Refund Records &amp; Ledger Reversals</span>
          </h2>

          <div className="divide-y divide-border text-xs">
            {payment.refunds.map((r) => (
              <div key={r.id} className="py-3 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-foreground">
                    Refund Amount: {formatCents(r.amountMinor)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Reason: {r.reason || 'Merchant initiated reversal'}
                  </div>
                  <div className="text-[10px] font-mono text-purple-600 dark:text-purple-400 mt-0.5">
                    PayPal Refund ID: {r.providerRefundId}
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={r.status} size="sm" />
                  <div className="text-[10px] text-muted-foreground mt-1">{formatDate(r.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {isRefundModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-purple-600" />
                <span>Process Payment Refund</span>
              </h3>
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {!isAdmin && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Role Warning:</span> Only accounts with the{' '}
                  <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">ADMIN</code> role can execute refunds. Log in as Demo Admin to test this action.
                </div>
              </div>
            )}

            {refundError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs">
                {refundError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-muted-foreground">
                  Refund Amount (USD) — Maximum available: {formatCents(remainingRefundableMinor)}
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(remainingRefundableMinor / 100).toFixed(2)}
                    value={refundAmountDollars}
                    onChange={(e) => setRefundAmountDollars(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-background border border-input text-foreground outline-none focus:ring-1 focus:ring-primary font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Audit Reason</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-background border border-input text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteRefund}
                disabled={isRefunding || !isAdmin}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                {isRefunding ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing Refund...</span>
                  </>
                ) : (
                  <span>Confirm Refund &amp; Post Ledger Reversal</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
