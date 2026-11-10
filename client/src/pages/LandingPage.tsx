import React from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Scale,
  BookOpenCheck,
  Zap,
  ArrowRight,
  Layers,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Terminal,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-secondary/80 text-foreground text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Full-Stack Payment Architecture • PayPal REST API v2</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.12]">
              Payment processing meets double-entry accounting.
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              PayFlow integrates real PayPal Sandbox checkouts with an append-only double-entry ledger. Every capture balances debits and credits, every retry is guarded by database idempotency, and every webhook is deduplicated.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/checkout"
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-foreground text-background font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity text-sm shadow-sm"
              >
                <CreditCard className="w-4 h-4" />
                <span>Open Interactive Checkout</span>
                <ArrowRight className="w-4 h-4 ml-0.5 opacity-70" />
              </Link>
              <Link
                to="/ledger"
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary text-foreground font-semibold flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <BookOpenCheck className="w-4 h-4 text-muted-foreground" />
                <span>Inspect Double-Entry Ledger</span>
              </Link>
            </div>
          </div>

          {/* Interactive Live Architecture Preview Card */}
          <div className="mt-14 max-w-4xl mx-auto rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            {/* Window header */}
            <div className="px-4 py-2.5 bg-muted/60 border-b border-border flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                <span className="ml-2 text-muted-foreground text-[11px]">payflow-core • state-machine &amp; ledger</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Invariant Verified (Δ = 0.00)</span>
              </div>
            </div>

            {/* Mockup content */}
            <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-background">
              {/* Left pane: Payment state */}
              <div className="space-y-3 font-mono text-xs">
                <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
                  1. Authoritative Payment Lifecycle
                </div>
                <div className="p-3.5 rounded-lg bg-secondary/50 border border-border space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Order ID:</span>
                    <span className="font-semibold text-foreground">ORD-2026-9812</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-semibold text-foreground">$99.00 USD <span className="text-[10px] text-muted-foreground font-normal">(9900 cents)</span></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">State Transition:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-sans font-semibold text-[11px]">
                      <CheckCircle2 className="w-3 h-3" />
                      COMPLETED
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Idempotency Key:</span>
                    <span className="text-muted-foreground truncate max-w-[150px]">IDEM-ORD-8f12a9</span>
                  </div>
                </div>
              </div>

              {/* Right pane: Ledger entry */}
              <div className="space-y-3 font-mono text-xs">
                <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Atomic Double-Entry Settlement
                </div>
                <div className="p-3.5 rounded-lg bg-secondary/50 border border-border space-y-2">
                  <div className="flex justify-between items-center border-b border-border/60 pb-1.5">
                    <span className="text-foreground font-semibold">JRNL-CAP-9812</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-medium">BALANCED</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">DEBIT</span>
                    <span className="text-muted-foreground">PAYPAL_CLEARING</span>
                    <span className="font-semibold text-foreground">+$99.00</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-purple-600 dark:text-purple-400 font-semibold">CREDIT</span>
                    <span className="text-muted-foreground">MERCHANT_PAYABLE</span>
                    <span className="font-semibold text-foreground">+$99.00</span>
                  </div>
                  <div className="pt-1.5 border-t border-border/60 flex justify-between text-[11px] text-muted-foreground">
                    <span>Accounting Invariant:</span>
                    <span className="text-foreground font-semibold">Debits ≡ Credits</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Architectural Guardrails */}
      <section className="py-16 md:py-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Built for financial edge cases
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Six architectural decisions that prevent real-world payment failures:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1 */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-muted-foreground">01 / PRICING</span>
              <ShieldCheck className="w-4 h-4 text-foreground/80" />
            </div>
            <h3 className="font-bold text-foreground text-sm">Authoritative Server Pricing</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Product prices are fetched directly from PostgreSQL. Quantities are validated server-side, preventing client payload tampering.
            </p>
          </div>

          {/* 2 */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-muted-foreground">02 / ACCOUNTING</span>
              <BookOpenCheck className="w-4 h-4 text-foreground/80" />
            </div>
            <h3 className="font-bold text-foreground text-sm">Double-Entry Ledger</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Append-only journals record assets and liabilities atomically. When a payment captures, PayPal Clearing is debited and Merchant Payable is credited.
            </p>
          </div>

          {/* 3 */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-muted-foreground">03 / CONCURRENCY</span>
              <Zap className="w-4 h-4 text-foreground/80" />
            </div>
            <h3 className="font-bold text-foreground text-sm">Strict Idempotency Layer</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Accepts <code className="text-[11px] bg-secondary px-1 py-0.5 rounded font-mono">Idempotency-Key</code>. Replays cached responses on network retries and blocks concurrent duplicate operations.
            </p>
          </div>

          {/* 4 */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-muted-foreground">04 / WEBHOOKS</span>
              <Layers className="w-4 h-4 text-foreground/80" />
            </div>
            <h3 className="font-bold text-foreground text-sm">Signature Verification &amp; Dedup</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Verifies PayPal cryptographic certificates, persists incoming raw payloads, deduplicates on event ID, and processes asynchronously.
            </p>
          </div>

          {/* 5 */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-muted-foreground">05 / AUDITING</span>
              <Scale className="w-4 h-4 text-foreground/80" />
            </div>
            <h3 className="font-bold text-foreground text-sm">Automated Reconciliation</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cross-references every internal database transaction against PayPal ground truth. Flags missing webhooks or amount mismatches for manual review.
            </p>
          </div>

          {/* 6 */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-muted-foreground">06 / PRECISION</span>
              <Terminal className="w-4 h-4 text-foreground/80" />
            </div>
            <h3 className="font-bold text-foreground text-sm">Integer Minor Units</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Zero JavaScript floating-point arithmetic. All monetary calculations are performed in integer cents to completely eliminate rounding drift.
            </p>
          </div>
        </div>
      </section>

      {/* Explore Section */}
      <section className="py-12 border-t border-border bg-secondary/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-foreground">Ready to test the application?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Launch a demo checkout, capture a test payment, and view the posted journal in the ledger.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/checkout"
              className="px-4 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Start Checkout
            </Link>
            <a
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-lg border border-border bg-card text-foreground text-xs font-semibold hover:bg-secondary transition-colors inline-flex items-center gap-1.5"
            >
              <span>Swagger API Docs</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
