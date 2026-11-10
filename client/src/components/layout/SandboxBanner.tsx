import React, { useState } from 'react';
import { X } from 'lucide-react';

export const SandboxBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-zinc-900 text-zinc-300 dark:bg-zinc-950 dark:text-zinc-400 border-b border-zinc-800 text-[11px] sm:text-xs py-1.5 px-4 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="font-semibold text-zinc-100">Sandbox Environment</span>
          <span className="text-zinc-400 hidden sm:inline">— Real money is disabled. All checkouts use PayPal Developer test accounts.</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded transition-colors"
          title="Dismiss notification"
          aria-label="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
