import React from 'react';
import { cn } from '../../lib/utils';
import { CheckCircle2, Clock, XCircle, AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className, size = 'sm' }) => {
  const getBadgeConfig = (st: string) => {
    switch (st) {
      case 'COMPLETED':
      case 'MATCHED':
        return {
          bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
          icon: <CheckCircle2 className="w-3 h-3" />,
          label: st === 'MATCHED' ? 'Matched' : 'Completed',
        };
      case 'PENDING':
      case 'PENDING_APPROVAL':
      case 'CREATED':
      case 'RUNNING':
        return {
          bg: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
          icon: <Clock className="w-3 h-3 animate-pulse" />,
          label: st.replace('_', ' '),
        };
      case 'APPROVED':
        return {
          bg: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20',
          icon: <CheckCircle2 className="w-3 h-3" />,
          label: 'Approved',
        };
      case 'REFUND_PENDING':
        return {
          bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
          icon: <RefreshCw className="w-3 h-3 animate-spin" />,
          label: 'Refund Pending',
        };
      case 'PARTIALLY_REFUNDED':
        return {
          bg: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
          icon: <RotateCcw className="w-3 h-3" />,
          label: 'Partially Refunded',
        };
      case 'REFUNDED':
        return {
          bg: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
          icon: <RotateCcw className="w-3 h-3" />,
          label: 'Refunded',
        };
      case 'FAILED':
      case 'CANCELLED':
      case 'INTERNAL_MISMATCH':
      case 'PROVIDER_MISMATCH':
        return {
          bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
          icon: <XCircle className="w-3 h-3" />,
          label: st.replace('_', ' '),
        };
      case 'PENDING_REVIEW':
        return {
          bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
          icon: <AlertCircle className="w-3 h-3" />,
          label: 'Review Needed',
        };
      default:
        return {
          bg: 'bg-secondary text-muted-foreground border-border',
          icon: <AlertCircle className="w-3 h-3" />,
          label: st,
        };
    }
  };

  const config = getBadgeConfig(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border rounded-md capitalize select-none tracking-tight font-sans',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        config.bg,
        className
      )}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};
