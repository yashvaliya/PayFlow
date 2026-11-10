import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatCents, formatDate } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Play,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  Lock,
} from 'lucide-react';

export const ReconciliationPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [page] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [runNotes] = useState('Daily settlement parity check with PayPal Sandbox');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // List past runs
  const { data: runsData, isLoading: isRunsLoading, refetch: refetchRuns } = useQuery({
    queryKey: ['reconciliationRuns', page],
    queryFn: () => api.listReconciliationRuns(page, 15),
  });

  // Selected run details
  const { data: runDetailsData } = useQuery({
    queryKey: ['reconciliationRunDetails', selectedRunId],
    queryFn: () => api.getReconciliationRun(selectedRunId!),
    enabled: Boolean(selectedRunId),
  });

  const runs = runsData?.data?.runs || [];
  const selectedRun = runDetailsData?.data?.run;

  const handleTriggerReconciliation = async () => {
    try {
      setIsRunning(true);
      const res = await api.triggerReconciliationRun(runNotes);
      refetchRuns();
      if (res.data?.run?.id) {
        setSelectedRunId(res.data.run.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to trigger reconciliation run');
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadCsv = async (runId: string) => {
    try {
      const csvData = await api.downloadReconciliationReport(runId);
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payflow-reconciliation-${runId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('Failed to download reconciliation CSV: ' + err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Settlement Verification
            </span>
            <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold px-2 py-0.5 rounded-full">
              Ground Truth Audit
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-1">
            PayPal Order Reconciliation Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-references internal PostgreSQL transactions against live PayPal Sandbox order and capture states.
          </p>
        </div>

        {/* Trigger Button */}
        <div className="flex items-center gap-2">
          {!isAdmin && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
              <Lock className="w-3.5 h-3.5" /> Demo Admin required
            </span>
          )}
          <button
            onClick={handleTriggerReconciliation}
            disabled={isRunning || !isAdmin}
            className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-all"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Comparing with PayPal...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Reconciliation Job</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Past Runs on Left, Detail Viewer on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Runs History */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Reconciliation Run History</h2>
            <button
              onClick={() => refetchRuns()}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {isRunsLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-border">
                Loading runs...
              </div>
            ) : runs.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-dashed border-border">
                No reconciliation jobs executed yet. Click "Run Reconciliation Job" to trigger one!
              </div>
            ) : (
              runs.map((run) => {
                const isSelected = selectedRunId === run.id;
                return (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-card border-primary ring-1 ring-primary/20 shadow-md'
                        : 'bg-card/70 border-border hover:border-border/80'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-mono font-bold text-xs text-foreground">
                          {run.runNumber}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(run.startedAt)}
                        </div>
                      </div>
                      <StatusBadge status={run.status} size="sm" />
                    </div>

                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{run.matchedCount}</span>
                        </span>
                        <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{run.mismatchedCount}</span>
                        </span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{run.pendingReviewCount}</span>
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadCsv(run.id);
                        }}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Download CSV Report"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Run Detail Inspection */}
        <div className="lg:col-span-7">
          {selectedRun ? (
            <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-base text-foreground">
                      {selectedRun.runNumber}
                    </span>
                    <StatusBadge status={selectedRun.status} size="sm" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Executed on {formatDate(selectedRun.startedAt)}
                    {selectedRun.triggeredBy && ` by ${selectedRun.triggeredBy.name}`}
                  </div>
                </div>

                <button
                  onClick={() => handleDownloadCsv(selectedRun.id)}
                  className="px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Export CSV Report</span>
                </button>
              </div>

              {/* KPI Summary */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <div className="text-lg font-bold text-foreground">{selectedRun.totalChecked}</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Total Audited</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedRun.matchedCount}
                  </div>
                  <div className="text-[10px] text-emerald-600 uppercase font-semibold">Matched</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                    {selectedRun.mismatchedCount}
                  </div>
                  <div className="text-[10px] text-rose-600 uppercase font-semibold">Discrepant</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {selectedRun.pendingReviewCount}
                  </div>
                  <div className="text-[10px] text-amber-600 uppercase font-semibold">Review</div>
                </div>
              </div>

              {/* Itemized Comparison Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Order-Level Discrepancy Matrix
                </h3>

                <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 sticky top-0 border-b border-border text-[11px] font-semibold text-muted-foreground">
                      <tr>
                        <th className="py-2.5 px-3">Order / Payment</th>
                        <th className="py-2.5 px-3">Internal Status</th>
                        <th className="py-2.5 px-3">PayPal Status</th>
                        <th className="py-2.5 px-3">Amount Match</th>
                        <th className="py-2.5 px-3">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedRun.items?.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/30">
                          <td className="py-2.5 px-3 font-mono">
                            <div className="font-semibold text-foreground">
                              {item.payment?.order?.orderNumber || '—'}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                              {item.providerOrderId}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={item.internalStatus || 'UNKNOWN'} size="sm" />
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-foreground">
                            {item.providerStatus}
                          </td>
                          <td className="py-2.5 px-3">
                            {item.amountMatch ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{item.internalAmountMinor != null ? formatCents(item.internalAmountMinor) : 'N/A'}</span>
                              </span>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Mismatch</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={item.outcome} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-16 text-center text-xs text-muted-foreground bg-card rounded-3xl border border-dashed border-border flex flex-col items-center justify-center space-y-2">
              <Scale className="w-8 h-8 text-muted-foreground/60" />
              <p className="font-semibold text-foreground">No Run Selected</p>
              <p>Select a past reconciliation run from the list or trigger a new audit to inspect parity.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
