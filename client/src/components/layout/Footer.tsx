import React from 'react';
import { ShieldCheck, Database, GitBranch, Terminal } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border bg-card/40 mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">PayFlow</span>
            <span>— Payment Processing & Double-Entry Financial Reconciliation Platform</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>PayPal Sandbox API v2</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-500" />
              <span>PostgreSQL + Prisma ORM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-4 h-4 text-purple-500" />
              <span>Double-Entry Ledger</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-amber-500" />
              <span>Idempotency-Key Enforced</span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
          <p>© {new Date().getFullYear()} PayFlow Portfolio Project. Developed for PayPal SWE Intern Assessment.</p>
          <p className="font-mono">Authoritative minor units (cents) • Append-only accounting</p>
        </div>
      </div>
    </footer>
  );
};
