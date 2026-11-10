import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatDate } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  Radio,
  CheckCircle2,
  RefreshCw,
  Code2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const WebhooksPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['webhookEvents', page],
    queryFn: () => api.listWebhookEvents(page, 20),
  });

  const events = data?.data?.events || [];
  const meta = data?.meta || { page: 1, limit: 20, total: 0, totalPages: 1 };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Event-Driven Pipeline
            </span>
            <span className="text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-full">
              PayPal Webhooks
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-1">
            Incoming Webhook Events Stream
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cryptographically verified, durably persisted, deduplicated on Event ID, and settled asynchronously.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="px-3.5 py-2 rounded-xl bg-card border border-border text-foreground hover:bg-muted text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Events</span>
        </button>
      </div>

      {/* Pipeline explanation card */}
      <div className="p-5 rounded-2xl bg-muted/40 border border-border grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-foreground">1. Signature Verification</div>
            <p className="text-muted-foreground mt-0.5">
              Raw HTTP body checked against PayPal's verification certificate API before persistence.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-foreground">2. Strict Deduplication</div>
            <p className="text-muted-foreground mt-0.5">
              Unique constraint on <code className="font-mono">eventId</code> ensures duplicate callbacks never double-bill or duplicate journals.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-foreground">3. Shared Settlement Worker</div>
            <p className="text-muted-foreground mt-0.5">
              Invokes the exact same state machine &amp; double-entry ledger logic as synchronous direct capture.
            </p>
          </div>
        </div>
      </div>

      {/* Events Table and Payload Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Events Table */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-card border border-border shadow-sm space-y-4">
          <h2 className="text-base font-bold text-foreground">Received Events Log</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 px-3">Event ID</th>
                  <th className="pb-3 px-3">Event Type</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3">Received At</th>
                  <th className="pb-3 px-3 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      Loading webhook events...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      No webhook events logged yet. Webhooks triggered by PayPal will be persisted here.
                    </td>
                  </tr>
                ) : (
                  events.map((evt) => (
                    <tr
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className={`cursor-pointer transition-colors ${
                        selectedEvent?.id === evt.id ? 'bg-primary/5' : 'hover:bg-muted/40'
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-semibold text-foreground truncate max-w-[140px]">
                        {evt.eventId}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                        {evt.eventType}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={evt.status} size="sm" />
                      </td>
                      <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(evt.receivedAt)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(evt);
                          }}
                          className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-[11px] font-semibold text-foreground inline-flex items-center gap-1"
                        >
                          <Code2 className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing <span className="font-semibold text-foreground">{events.length}</span> of{' '}
              <span className="font-semibold text-foreground">{meta.total}</span> events
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

        {/* Payload Inspector on Right */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Code2 className="w-4 h-4 text-primary" />
              <span>Raw Event Payload Inspector</span>
            </h2>
            {selectedEvent && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {selectedEvent.eventId}
              </span>
            )}
          </div>

          {selectedEvent ? (
            <div className="mt-4 flex-1 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{selectedEvent.eventType}</span>
                <StatusBadge status={selectedEvent.status} size="sm" />
              </div>

              {selectedEvent.lastError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs">
                  <span className="font-semibold">Processing Error:</span> {selectedEvent.lastError}
                </div>
              )}

              <pre className="p-4 rounded-xl bg-muted/60 border border-border text-[11px] font-mono overflow-x-auto max-h-[480px] text-foreground leading-relaxed">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-xs text-muted-foreground">
              <Code2 className="w-8 h-8 text-muted-foreground/60 mb-2" />
              <p className="font-semibold text-foreground">Select an Event</p>
              <p>Click any incoming webhook row to inspect its JSON structure and verify supplementary ids.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
