import React from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Scale,
  BookOpenCheck,
  ArrowRight,
  LayoutDashboard,
  Crown,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero Section with Royal Glow */}
      <section className="relative pt-20 pb-20 md:pt-28 md:pb-32 royal-glow border-b border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          {/* Heading with Royal Gold Accent */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-3xl mx-auto leading-[1.12]">
            Payment processing with{' '}
            <span className="gold-gradient-text font-black">
              double-entry
            </span>{' '}
            accounting.
          </h1>

          {/* 1 Clean Sentence */}
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Accept payments, prevent duplicate charges with idempotency keys, and settle balances in an append-only ledger.
          </p>

          {/* Primary Actions with Royal Gold Button */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/checkout"
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 border border-amber-300/40 transition-all"
            >
              <CreditCard className="w-3.5 h-3.5 text-zinc-950" />
              <span>Try Demo Checkout</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5 opacity-80" />
            </Link>
            <Link
              to="/dashboard"
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-border/80 bg-card/70 hover:bg-secondary text-foreground font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Open Dashboard</span>
            </Link>
          </div>

          {/* 3 Metric Highlights with Gold Accents */}
          <div className="pt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs text-left space-y-1 hover:border-amber-500/30 transition-colors">
              <div className="text-2xl font-extrabold font-mono text-amber-500 dark:text-amber-400">$0.00</div>
              <div className="text-xs font-semibold text-foreground">Zero Rounding Drift</div>
              <div className="text-[11px] text-muted-foreground">Calculated strictly in integer cents.</div>
            </div>

            <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs text-left space-y-1 hover:border-amber-500/30 transition-colors">
              <div className="text-2xl font-extrabold font-mono text-amber-500 dark:text-amber-400">100%</div>
              <div className="text-xs font-semibold text-foreground">Balanced Ledger</div>
              <div className="text-[11px] text-muted-foreground">Every capture balances debits &amp; credits.</div>
            </div>

            <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs text-left space-y-1 hover:border-amber-500/30 transition-colors">
              <div className="text-2xl font-extrabold font-mono text-amber-500 dark:text-amber-400">0</div>
              <div className="text-xs font-semibold text-foreground">Duplicate Charges</div>
              <div className="text-[11px] text-muted-foreground">Enforced with database idempotency keys.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Visual 3-Step Flow */}
      <section className="py-16 border-t border-border/60 bg-secondary/15">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-500 dark:text-amber-400 uppercase tracking-wider">
              <Crown className="w-3 h-3" />
              <span>Architecture</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">The Financial Processing Cycle</h2>
            <p className="text-xs text-muted-foreground">End-to-end transaction integrity from checkout to ledger settlement.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-border bg-card space-y-2 hover:border-amber-500/20 transition-colors">
              <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                1
              </div>
              <h3 className="text-xs font-bold text-foreground">Authoritative Order</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Items and prices are verified against PostgreSQL. Totals are calculated server-side in integer cents.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2 hover:border-amber-500/20 transition-colors">
              <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                2
              </div>
              <h3 className="text-xs font-bold text-foreground">Authoritative Capture</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Payment captured via REST API. The state machine transitions safely to COMPLETED.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2 hover:border-amber-500/20 transition-colors">
              <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                3
              </div>
              <h3 className="text-xs font-bold text-foreground">Double-Entry Journal</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Debits PayPal Clearing and credits Merchant Payable in a single atomic transaction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Launch Cards */}
      <section className="py-14 border-t border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              to="/checkout"
              className="p-4 rounded-xl border border-border bg-card hover:bg-secondary/60 hover:border-amber-500/30 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <CreditCard className="w-4 h-4 text-foreground group-hover:text-amber-500 transition-colors" />
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Checkout Demo</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Test an end-to-end checkout flow.</p>
              </div>
            </Link>

            <Link
              to="/ledger"
              className="p-4 rounded-xl border border-border bg-card hover:bg-secondary/60 hover:border-amber-500/30 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <BookOpenCheck className="w-4 h-4 text-foreground group-hover:text-amber-500 transition-colors" />
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Ledger Journals</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Audit debit/credit balanced entries.</p>
              </div>
            </Link>

            <Link
              to="/reconciliation"
              className="p-4 rounded-xl border border-border bg-card hover:bg-secondary/60 hover:border-amber-500/30 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <Scale className="w-4 h-4 text-foreground group-hover:text-amber-500 transition-colors" />
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Reconciliation</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Cross-check database records vs provider.</p>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
