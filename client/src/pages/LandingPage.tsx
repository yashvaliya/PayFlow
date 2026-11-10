import React from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Scale,
  BookOpenCheck,
  ArrowRight,
  LayoutDashboard,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero Section */}
      <section className="pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          {/* Subtle Tag */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-secondary/50 text-muted-foreground text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>PayPal Sandbox Integration</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-3xl mx-auto leading-[1.1]">
            Payment processing with double-entry accounting.
          </h1>

          {/* 1 Clean Sentence */}
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Accept PayPal payments, prevent duplicate charges with idempotency keys, and settle balances in an append-only ledger.
          </p>

          {/* Primary Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/checkout"
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-foreground text-background font-semibold text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-xs"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Try Demo Checkout</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-60" />
            </Link>
            <Link
              to="/dashboard"
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary text-foreground font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Open Dashboard</span>
            </Link>
          </div>

          {/* 3 Metric Highlights */}
          <div className="pt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="p-4 rounded-xl border border-border bg-card/60 text-left space-y-1">
              <div className="text-2xl font-extrabold font-mono text-foreground">$0.00</div>
              <div className="text-xs font-semibold text-foreground">Zero Rounding Drift</div>
              <div className="text-[11px] text-muted-foreground">Calculated strictly in integer cents.</div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card/60 text-left space-y-1">
              <div className="text-2xl font-extrabold font-mono text-foreground">100%</div>
              <div className="text-xs font-semibold text-foreground">Balanced Ledger</div>
              <div className="text-[11px] text-muted-foreground">Every capture balances debits &amp; credits.</div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card/60 text-left space-y-1">
              <div className="text-2xl font-extrabold font-mono text-foreground">0</div>
              <div className="text-xs font-semibold text-foreground">Duplicate Charges</div>
              <div className="text-[11px] text-muted-foreground">Enforced with database idempotency keys.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Visual 3-Step Flow */}
      <section className="py-16 border-t border-border bg-secondary/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold tracking-tight text-foreground">How It Works</h2>
            <p className="text-xs text-muted-foreground">The end-to-end payment and accounting cycle.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-border bg-card space-y-2">
              <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center font-mono font-bold text-xs text-foreground">
                1
              </div>
              <h3 className="text-xs font-bold text-foreground">Authoritative Order</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Items and prices are verified against PostgreSQL. Totals are calculated server-side.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2">
              <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center font-mono font-bold text-xs text-foreground">
                2
              </div>
              <h3 className="text-xs font-bold text-foreground">PayPal Capture</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Payment captured via PayPal REST v2. The state machine transitions to COMPLETED.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2">
              <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center font-mono font-bold text-xs text-foreground">
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
      <section className="py-14 border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              to="/checkout"
              className="p-4 rounded-xl border border-border bg-card hover:bg-secondary/60 transition-colors group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <CreditCard className="w-4 h-4 text-foreground" />
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Checkout Demo</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Test a payment with the PayPal Sandbox.</p>
              </div>
            </Link>

            <Link
              to="/ledger"
              className="p-4 rounded-xl border border-border bg-card hover:bg-secondary/60 transition-colors group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <BookOpenCheck className="w-4 h-4 text-foreground" />
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Ledger Journals</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Audit debit/credit balanced entries.</p>
              </div>
            </Link>

            <Link
              to="/reconciliation"
              className="p-4 rounded-xl border border-border bg-card hover:bg-secondary/60 transition-colors group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <Scale className="w-4 h-4 text-foreground" />
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Reconciliation</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Cross-check internal records vs PayPal.</p>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
