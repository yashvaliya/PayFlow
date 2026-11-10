import React from 'react';
import { ShieldAlert, Info } from 'lucide-react';

export const SandboxBanner: React.FC = () => {
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs md:text-sm font-medium flex items-center justify-between">
      <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
        <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1 truncate">
          <span className="font-semibold">PayPal Sandbox Environment:</span> Real-money transactions are disabled. All checkout and payment operations operate strictly within the PayPal Developer Sandbox testing network.
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs shrink-0 font-mono">
          <Info className="w-3.5 h-3.5" />
          <span>PORTFOLIO DEMO</span>
        </div>
      </div>
    </div>
  );
};
