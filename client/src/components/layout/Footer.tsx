import React from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, ExternalLink } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border/80 bg-background/50 backdrop-blur-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Col 1: Brand & Status */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight text-foreground">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                <CreditCard className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-foreground">PayFlow</span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
              Merchant payment processing, double-entry financial ledger accounting, and settlement reconciliation.
            </p>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>PayPal Sandbox Connected</span>
            </div>
          </div>

          {/* Col 2: Platform */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground">Platform</div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <Link to="/dashboard" className="hover:text-foreground transition-colors">Merchant Dashboard</Link>
              </li>
              <li>
                <Link to="/checkout" className="hover:text-foreground transition-colors">Demo Checkout</Link>
              </li>
              <li>
                <Link to="/transactions" className="hover:text-foreground transition-colors">Transaction Explorer</Link>
              </li>
              <li>
                <Link to="/ledger" className="hover:text-foreground transition-colors">Double-Entry Ledger</Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Operations */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground">Operations</div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <Link to="/reconciliation" className="hover:text-foreground transition-colors">Reconciliation Runs</Link>
              </li>
              <li>
                <Link to="/webhooks" className="hover:text-foreground transition-colors">Webhook Event Log</Link>
              </li>
              <li>
                <a
                  href="/api/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <span>OpenAPI Spec</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <span>System Health</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Architecture */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground">Architecture</div>
            <ul className="space-y-2 text-xs text-muted-foreground font-mono">
              <li>PostgreSQL 16</li>
              <li>Prisma ORM</li>
              <li>Express + TypeScript</li>
              <li>React 18 + Vite</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} PayFlow. Sandbox Demonstration Platform.</p>
          <div className="flex items-center gap-6 text-[11px]">
            <span>Integer Minor Units (USD Cents)</span>
            <span>Balanced Accounting Invariant</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
