/**
 * Financial Money Arithmetic Utilities
 * 
 * In PayFlow, all monetary amounts are stored as integer minor currency units
 * (e.g. cents for USD: $29.99 = 2999) to completely eliminate JavaScript
 * IEEE-754 floating-point rounding errors.
 */

export function dollarsToCents(dollars: number | string): number {
  if (typeof dollars === 'string') {
    const parsed = parseFloat(dollars);
    if (isNaN(parsed)) {
      throw new Error(`Invalid monetary amount string: "${dollars}"`);
    }
    return Math.round(parsed * 100);
  }
  if (!Number.isFinite(dollars)) {
    throw new Error(`Invalid monetary amount: ${dollars}`);
  }
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Minor currency units must be integer cents, received: ${cents}`);
  }
  const isNegative = cents < 0;
  const absCents = Math.abs(cents);
  const dollars = Math.floor(absCents / 100);
  const remainingCents = absCents % 100;
  const formatted = `${dollars}.${remainingCents.toString().padStart(2, '0')}`;
  return isNegative ? `-${formatted}` : formatted;
}

export function formatCurrency(cents: number, currency: string = 'USD'): string {
  const dollarString = centsToDollars(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(parseFloat(dollarString));
}

export function addMinor(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error(`Operands must be integers: a=${a}, b=${b}`);
  }
  return a + b;
}

export function subtractMinor(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error(`Operands must be integers: a=${a}, b=${b}`);
  }
  return a - b;
}
