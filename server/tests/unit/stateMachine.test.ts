import { describe, it, expect } from 'vitest';
import { PaymentStateMachine } from '../../src/services/stateMachine.js';
import { PaymentStatus } from '@prisma/client';

describe('Payment State Machine', () => {
  it('allows valid progressive transitions', () => {
    expect(
      PaymentStateMachine.isValidTransition(PaymentStatus.CREATED, PaymentStatus.PENDING_APPROVAL)
    ).toBe(true);

    expect(
      PaymentStateMachine.isValidTransition(
        PaymentStatus.PENDING_APPROVAL,
        PaymentStatus.COMPLETED
      )
    ).toBe(true);

    expect(
      PaymentStateMachine.isValidTransition(
        PaymentStatus.COMPLETED,
        PaymentStatus.PARTIALLY_REFUNDED
      )
    ).toBe(true);

    expect(
      PaymentStateMachine.isValidTransition(
        PaymentStatus.PARTIALLY_REFUNDED,
        PaymentStatus.REFUNDED
      )
    ).toBe(true);
  });

  it('rejects invalid backwards transitions', () => {
    // Cannot move back to CREATED from COMPLETED
    expect(
      PaymentStateMachine.isValidTransition(PaymentStatus.COMPLETED, PaymentStatus.CREATED)
    ).toBe(false);

    // Cannot move back to PENDING_APPROVAL from REFUNDED
    expect(
      PaymentStateMachine.isValidTransition(PaymentStatus.REFUNDED, PaymentStatus.PENDING_APPROVAL)
    ).toBe(false);

    // Terminal states cannot transition further
    expect(
      PaymentStateMachine.isValidTransition(PaymentStatus.CANCELLED, PaymentStatus.COMPLETED)
    ).toBe(false);

    expect(
      PaymentStateMachine.isValidTransition(PaymentStatus.FAILED, PaymentStatus.APPROVED)
    ).toBe(false);
  });

  it('permits idempotent self-transitions', () => {
    expect(
      PaymentStateMachine.isValidTransition(PaymentStatus.COMPLETED, PaymentStatus.COMPLETED)
    ).toBe(true);
  });
});
