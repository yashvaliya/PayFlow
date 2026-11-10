import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatCents, formatDate } from '../lib/utils';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const LedgerPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [isVerifying, setIsVerifying] = useState(false);
  const [invariantReport, setInvariantReport] = useState<any | null>(null);

  // Accounts
  const { data: accountsData, isLoading: isAccountsLoading } = useQuery({
    queryKey: ['ledgerAccounts'],
    queryFn: () => api.getLedgerAccounts(),
  });

  // Journals
  const { data: journalsData, isLoading: isJournalsLoading, refetch } = useQuery({
    queryKey: ['ledgerJournals', page],
    queryFn: () => api.getLedgerJournals(page, 20),
  });

  const accounts = accountsData?.data?.accounts || [];
  const journals = journalsData?.data?.journals || [];
  const meta = journalsData?.meta || { page: 1, limit: 20, total: 0, totalPages: 1 };

  const handleVerifyInvariants = async () => {
    try {
      setIsVerifying(true);
      const res = await api.verifyLedgerInvariants();
      setInvariantReport(res.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Immutable Accounting
            </span>
            <span className="text-[10px] font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold px-2 py-0.5 rounded-full">
              Append-Only Ledger
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-1">
            Double-Entry Financial Ledger
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mathematical guarantee of financial integrity. Every captured payment and refund posts balanced debit/credit entries.
          </p>
        </div>

        <button
          onClick={handleVerifyInvariants}
          disabled={isVerifying}
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-2 shadow-sm hover:opacity-90 disabled:opacity-50 transition-all shrink-0"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{isVerifying ? 'Auditing Ledger...' : 'Verify Accounting Invariant'}</span>
        </button>
      </div>

      {/* Invariant Report Result Banner */}
      {invariantReport && (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            invariantReport.balanced
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {invariantReport.balanced ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <div>
                <h3 className="font-bold text-sm">
                  {invariantReport.balanced
                    ? 'All Ledger Invariants Verified & In Perfect Balance'
                    : 'Discrepancy Detected in Ledger Journals'}
                </h3>
                <p className="text-xs opacity-90 mt-0.5">
                  Audited <span className="font-semibold">{invariantReport.totalJournals}</span> total posted journals.
                  Total Debits: <span className="font-mono font-bold">{formatCents(invariantReport.totalDebitsMinor)}</span> | Total Credits: <span className="font-mono font-bold">{formatCents(invariantReport.totalCreditsMinor)}</span>.
                </p>
              </div>
            </div>

            <button
              onClick={() => setInvariantReport(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Chart of Accounts Grid */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
          Chart of Accounts Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isAccountsLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-border col-span-3">
              Loading chart of accounts...
            </div>
          ) : (
            accounts.map((acc) => (
              <div key={acc.id} className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-foreground">{acc.code}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {acc.type}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{acc.name}</div>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Account Balance:</span>
                  <span className="text-lg font-extrabold text-foreground">
                    {formatCents(acc.balanceMinor, acc.currency)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Posted Journals Table */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Posted Journal Entries</h2>
            <p className="text-xs text-muted-foreground">Chronological audit stream of double-entry financial transactions</p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-border text-xs">
          {isJournalsLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading journal history...</div>
          ) : journals.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No journal entries posted yet. Complete a payment via Checkout to initialize the ledger!
            </div>
          ) : (
            journals.map((journal) => (
              <div key={journal.id} className="py-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground">{journal.journalNumber}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      {journal.referenceType}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{formatDate(journal.postedAt)}</span>
                </div>

                <div className="text-xs text-muted-foreground">{journal.description}</div>

                {/* Entry lines */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 font-mono text-[11px]">
                  {journal.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between ${
                        entry.entryType === 'DEBIT'
                          ? 'bg-blue-500/5 border-blue-500/20'
                          : 'bg-emerald-500/5 border-emerald-500/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${
                            entry.entryType === 'DEBIT'
                              ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                              : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {entry.entryType}
                        </span>
                        <span className="font-semibold text-foreground">{entry.account?.code}</span>
                      </div>
                      <span className="font-bold text-foreground">
                        {formatCents(entry.amountMinor)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing <span className="font-semibold text-foreground">{journals.length}</span> of{' '}
            <span className="font-semibold text-foreground">{meta.total}</span> journals
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-foreground px-2">
              Page {page} of {meta.totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
