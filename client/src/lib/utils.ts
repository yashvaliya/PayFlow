import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number, currency: string = 'USD'): string {
  const isNegative = cents < 0;
  const absVal = Math.abs(cents);
  const dollars = (absVal / 100).toFixed(2);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(parseFloat(dollars));

  return isNegative ? `-${formatted}` : formatted;
}

export function formatDate(dateStr?: string | Date | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

export function generateIdempotencyKey(prefix: string = 'IDEM'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
