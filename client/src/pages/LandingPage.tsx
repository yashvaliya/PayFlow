import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard,
  ShieldCheck,
  Scale,
  BookOpenCheck,
  Zap,
  ArrowRight,
  Lock,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { quickLogin } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            {/* Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Engineered for PayPal Software Engineering Portfolio</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
              Real-time Payment Processing &amp;{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent">
                Double-Entry Reconciliation
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed">
              An enterprise-grade merchant settlement platform built with real PayPal Sandbox API integrations, strict idempotency keys, append-only financial ledgers, and order-level discrepancy reconciliation.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/checkout"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:opacity-95 transition-all text-base"
              >
                <CreditCard className="w-5 h-5" />
                <span>Launch Demo Checkout</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
              <Link
                to="/dashboard"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-card border border-border text-foreground font-semibold flex items-center justify-center gap-2 hover:bg-muted transition-all text-base"
              >
                <span>Explore Merchant Dashboard</span>
              </Link>
            </div>

            {/* Recruiter 1-Click Login Card */}
            <div className="mt-10 p-5 rounded-2xl bg-card border border-border/80 shadow-md text-left max-w-xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-primary" /> Recruiter Demo Credentials
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full">
                  Ready to test
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-muted/60 border border-border flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-foreground">Admin User</div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-0.5">admin@payflow.internal</div>
                    <div className="text-[10px] text-muted-foreground/80 mt-1">Has refund &amp; reconciliation privileges</div>
                  </div>
                  <button
                    onClick={() => quickLogin('ADMIN')}
                    className="mt-3 w-full py-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>1-Click Admin Login</span>
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-muted/60 border border-border flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-foreground">Viewer User</div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-0.5">viewer@payflow.internal</div>
                    <div className="text-[10px] text-muted-foreground/80 mt-1">Read-only auditing &amp; analytics view</div>
                  </div>
                  <button
                    onClick={() => quickLogin('VIEWER')}
                    className="mt-3 w-full py-1.5 px-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>1-Click Viewer Login</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Engineering Features Grid */}
      <section className="py-16 bg-card/50 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Built on Core Fintech Engineering Principles
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Designed to avoid common portfolio pitfalls: floating-point errors, duplicate billing, out-of-order webhooks, and ledger drift.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">PayPal REST API v2</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                OAuth 2.0 client credential token caching with safety buffer. Authoritative server-side price calculation and direct capture verification.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4">
                <BookOpenCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Double-Entry Financial Ledger</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Immutable, append-only journal entries. Debits equal credits invariant strictly verified in atomic database transactions.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Strict Idempotency Layer</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                All financial endpoints require <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">Idempotency-Key</code>. Detects concurrent requests, replays cached responses, and rejects payload mutation with HTTP 409.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Event-Driven Webhook Engine</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Cryptographic signature verification, durable persistence, event ID deduplication, and asynchronous background settlement workers.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-4">
                <Scale className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Order-Level Reconciliation</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Compares internal database state against PayPal ground truth. Identifies discrepancies, missing callbacks, and produces auditable CSV reports.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Zero Floating-Point Money</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Monetary amounts are stored exclusively in integer minor units (cents) across database, APIs, and state machine transitions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack Callout */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="p-8 rounded-3xl bg-gradient-to-br from-blue-600/10 via-indigo-600/5 to-transparent border border-blue-500/20">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="max-w-xl">
              <h3 className="text-2xl font-bold text-foreground">Complete Modern TypeScript Monorepo</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Featuring Express.js, PostgreSQL, Prisma ORM, React 18, Vite, Tailwind CSS, TanStack Query, and Vitest testing suite.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono">
                {['TypeScript', 'React.js', 'Express.js', 'PostgreSQL', 'Prisma ORM', 'PayPal REST API', 'Vitest', 'Docker'].map((tech) => (
                  <span key={tech} className="px-2.5 py-1 rounded-md bg-card border border-border text-foreground font-semibold">
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <Link
                to="/checkout"
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center hover:opacity-90 shadow-sm transition-opacity"
              >
                Test Checkout Flow
              </Link>
              <a
                href="/api/docs"
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 rounded-xl bg-card border border-border text-foreground text-sm font-semibold text-center hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Interactive Swagger</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
