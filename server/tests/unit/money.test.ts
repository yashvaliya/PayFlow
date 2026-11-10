import { describe, it, expect } from 'vitest';
import {
  dollarsToCents,
  centsToDollars,
  formatCurrency,
  addMinor,
  subtractMinor,
} from '../../src/utils/money.js';

describe('Financial Money Utilities', () => {
  it('converts dollar numbers to integer cents correctly without IEEE-754 drift', () => {
    expect(dollarsToCents(29.99)).toBe(2999);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30 cents
    expect(dollarsToCents(100)).toBe(10000);
    expect(dollarsToCents(0)).toBe(0);
  });

  it('converts dollar strings to integer cents correctly', () => {
    expect(dollarsToCents('29.99')).toBe(2999);
    expect(dollarsToCents('149.00')).toBe(14900);
    expect(dollarsToCents('0.05')).toBe(5);
  });

  it('converts integer cents back to formatted dollar string', () => {
    expect(centsToDollars(2999)).toBe('29.99');
    expect(centsToDollars(10000)).toBe('100.00');
    expect(centsToDollars(5)).toBe('0.05');
    expect(centsToDollars(0)).toBe('0.00');
    expect(centsToDollars(-500)).toBe('-5.00');
  });

  it('throws on non-integer cents', () => {
    expect(() => centsToDollars(29.99)).toThrow(/must be integer cents/);
  });

  it('formats currency for display correctly', () => {
    const formatted = formatCurrency(2999, 'USD');
    expect(formatted).toBe('$29.99');
  });

  it('performs safe minor unit additions and subtractions', () => {
    expect(addMinor(1000, 2500)).toBe(3500);
    expect(subtractMinor(5000, 1500)).toBe(3500);
  });
});
