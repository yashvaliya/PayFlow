# PayFlow Testing & Quality Assurance Guide

PayFlow includes a comprehensive suite of unit tests, integration tests, failure case scenarios, and accounting invariant validations built with **Vitest** and **Supertest**.

## Test Execution

Run the complete test suite:
```bash
npm run test --workspace=server
```

Or run Vitest in watch mode:
```bash
npm run test:watch --workspace=server
```

---

## 1. Test Coverage Matrix

### A. Unit Tests

| Suite | File | Tests | Key Invariants Tested |
| :--- | :--- | :--- | :--- |
| **Money Arithmetic** | `tests/unit/money.test.ts` | 6 | IEEE-754 floating point drift prevention (`0.1 + 0.2 = 30 cents`), integer minor units parsing, non-integer cents rejection, string currency formatting. |
| **State Machine** | `tests/unit/stateMachine.test.ts` | 3 | Forward valid transitions, rejection of illegal backward transitions (e.g. `COMPLETED` -> `CREATED`), idempotent self-transitions, terminal status immutability. |
| **Double-Entry Ledger** | `tests/unit/ledger.test.ts` | 3 | Capture journal generation, refund journal reversal, balancing invariant: `Sum(Debits) === Sum(Credits)`, system-wide invariant verification (`verifyInvariants`). |

### B. Integration & Failure Case Tests

| Suite | File | Tests | Key Scenarios Tested |
| :--- | :--- | :--- | :--- |
| **Payments & Idempotency** | `tests/integration/payments.test.ts` | 7 | Missing `Idempotency-Key` header rejection (400 Bad Request), order creation with server-authoritative totals, idempotent response replay on duplicate requests with `X-Idempotent-Replay: true`, key reuse rejection when payload is modified (409 Conflict), authoritative capture & ledger settlement, role-based authorization guard (VIEWER denied refund with 403 Forbidden, ADMIN allowed with 200 OK), and incoming webhook deduplication on `eventId`. |

---

## 2. Tested Failure Cases

1. **Repeated Create-Order Request:** Replays original created order without creating duplicate orders or double-reserving inventory.
2. **Repeated Capture Request:** Idempotent capture returns existing payment record; skips duplicate ledger journal posting.
3. **Payload Tampering on Idempotent Key:** Rejection with HTTP 409 Conflict when the same key is supplied with a modified body.
4. **Unauthorized Refund Attempt:** Attempting a refund using a Viewer account returns HTTP 403 Forbidden.
5. **Over-Refund Protection:** Refunding an amount greater than the unrefunded balance is rejected by validation logic.
6. **Duplicate Webhook Delivery:** Second delivery of the same PayPal event ID returns HTTP 200 with `deduplicated` status, preventing duplicate ledger entries.
7. **Database Transaction Rollback:** When payment state transitions or external API calls fail, all intermediate database writes are safely rolled back.

---

## 3. Real PayPal Sandbox Verification Checklist

To test against live PayPal Sandbox accounts:
1. Ensure `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are configured in `.env`.
2. Launch the application and navigate to `/checkout`.
3. Choose a product and click **Proceed to PayPal Sandbox Checkout**.
4. Log in using a standard PayPal Sandbox Personal/Buyer account:
   - Generate via [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/accounts).
5. Complete sandbox authorization and verify that the internal payment advances to `COMPLETED` and posted ledger entries appear under `/ledger`.
