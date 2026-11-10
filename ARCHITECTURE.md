# PayFlow Architecture & System Design

PayFlow is a high-reliability merchant payment processing and reconciliation platform engineered to demonstrate core fintech principles:
- **Authoritative Pricing:** The browser is never trusted with price totals.
- **Double-Entry Financial Accounting:** Every captured payment or refund posts balanced debits and credits across immutable accounts.
- **Strict Idempotency:** State-mutating operations (`orders`, `capture`, `refunds`) require an `Idempotency-Key` header with payload hash validation to prevent double-billing and race conditions.
- **Event-Driven Resilience:** PayPal Webhooks are cryptographically verified, persisted durably, deduplicated on Event ID, and settled asynchronously.
- **Discrepancy Reconciliation:** Automated inspection cross-referencing internal PostgreSQL records against PayPal Sandbox ground truth.

---

## 1. System Architecture Overview

```mermaid
flowchart TD
    Buyer([Customer / Buyer]) -->|HTTPS / UI| SPA[React 18 + Vite SPA Client]
    SPA -->|Idempotency-Key + Bearer JWT| API[Express.js REST API Gateway]
    
    subgraph Core Platform
        API --> Auth[Authentication & RBAC Middleware]
        API --> Idem[Idempotency Engine]
        API --> PaySvc[Payment Settlement Service]
        API --> LedgerSvc[Double-Entry Ledger Service]
        API --> ReconSvc[Reconciliation Engine]
        API --> WbhSvc[Webhook Ingestion Engine]
        
        PaySvc --> StateMachine[Payment State Machine]
        PaySvc --> DB[(PostgreSQL Database)]
        LedgerSvc --> DB
        Idem --> DB
        WbhSvc --> DB
    end

    subgraph PayPal Cloud
        PaySvc -->|OAuth 2.0 / Orders API v2| PayPalAPI[PayPal Sandbox REST API]
        PayPalAPI -->|Webhooks: Transmission Sig| WbhSvc
        ReconSvc -->|Ground Truth Check| PayPalAPI
    end
```

---

## 2. Payment Lifecycle & State Machine

Every payment transitions strictly according to the defined finite state machine. Terminal states (`FAILED`, `CANCELLED`, `REFUNDED`) cannot be overwritten by out-of-order webhooks or delayed events.

```mermaid
stateDiagram-v2
    [*] --> CREATED: Order Initiated (Authoritative Pricing)
    CREATED --> PENDING_APPROVAL: PayPal Order ID Generated
    CREATED --> CANCELLED: Buyer Abandons Checkout
    CREATED --> FAILED: Provider Error / Rejection

    PENDING_APPROVAL --> APPROVED: Buyer Approves Sandbox Modal
    PENDING_APPROVAL --> CANCELLED: Buyer Cancels in PayPal
    PENDING_APPROVAL --> FAILED: Card / Auth Denied

    APPROVED --> COMPLETED: Capture Confirmed (Debit CLEARING, Credit PAYABLE)
    PENDING_APPROVAL --> COMPLETED: Direct Capture Settlement

    COMPLETED --> REFUND_PENDING: Admin Initiates Refund
    REFUND_PENDING --> PARTIALLY_REFUNDED: Partial Amount Settled
    REFUND_PENDING --> REFUNDED: Full Amount Settled
    REFUND_PENDING --> COMPLETED: Refund Provider Rejection Reversal

    PARTIALLY_REFUNDED --> REFUND_PENDING: Additional Partial Refund
    PARTIALLY_REFUNDED --> REFUNDED: Balance Reaches $0

    REFUNDED --> [*]
    CANCELLED --> [*]
    FAILED --> [*]
```

---

## 3. Double-Entry Accounting Invariant

Monetary values in PayFlow are calculated and stored exclusively in **integer minor units** (e.g. cents in USD: $29.99 = `2999`), completely avoiding IEEE-754 floating-point inaccuracies.

### The Chart of Accounts

| Account Code | Account Type | Normal Balance | Purpose |
| :--- | :--- | :--- | :--- |
| `PAYPAL_CLEARING` | ASSET | Debit | Tracks gross funds received and held by PayPal. |
| `MERCHANT_PAYABLE` | LIABILITY | Credit | Tracks net funds owed to the merchant for settlement. |
| `REFUND_CLEARING` | ASSET / CONTRA | Debit | Temporary holding for processing settlement adjustments. |

### Journal Posting Rules

1. **Captured Payment ($100.00 = 10000 cents):**
   - **Debit:** `PAYPAL_CLEARING` (+10000)
   - **Credit:** `MERCHANT_PAYABLE` (+10000)
   - **Invariant:** `Sum(Debits) == Sum(Credits) == 10000`

2. **Executed Refund ($40.00 = 4000 cents):**
   - **Debit:** `MERCHANT_PAYABLE` (-4000)
   - **Credit:** `PAYPAL_CLEARING` (-4000)
   - **Invariant:** `Sum(Debits) == Sum(Credits) == 4000`

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant Server as PayFlow Settlement Engine
    participant DB as PostgreSQL Transaction
    participant PayPal as PayPal Sandbox REST API

    Admin->>Server: POST /api/payments/:id/refund (Idempotency-Key)
    Server->>DB: Verify Payment Status == COMPLETED & Refundable >= Amount
    Server->>PayPal: POST /v2/payments/captures/{id}/refund (PayPal-Request-Id)
    PayPal-->>Server: HTTP 201 Created (Refund ID)
    
    rect rgb(240, 248, 255)
        Note over Server,DB: Atomic Database Transaction
        Server->>DB: Insert into refunds table
        Server->>DB: Increment payment.refundedAmountMinor
        Server->>DB: Transition state: COMPLETED -> PARTIALLY_REFUNDED / REFUNDED
        Server->>DB: Insert ledger_journal (JRNL-REF-...)
        Server->>DB: Insert Debit entry: MERCHANT_PAYABLE
        Server->>DB: Insert Credit entry: PAYPAL_CLEARING
        Server->>DB: Decrement account balances
    end
    Server-->>Admin: HTTP 200 OK (Refund Confirmed & Ledger Reversal Complete)
```

---

## 4. Idempotency Architecture

All financial endpoints enforce database-backed idempotency using the `Idempotency-Key` header:

```mermaid
flowchart TD
    Req[Incoming Request with Idempotency-Key] --> Check{Key in idempotency_records?}
    
    Check -- No --> Lock[Insert Locked Record & Hash Payload]
    Lock --> Exec[Execute Financial State Mutation]
    Exec --> Save[Update Record with HTTP Status & Response Body]
    Save --> Return[Return Response to Client]
    
    Check -- Yes --> HashCheck{Stored Hash == Request Hash?}
    HashCheck -- No --> Err409[HTTP 409 Conflict: Key Reused with Different Payload]
    HashCheck -- Yes --> LockedCheck{Is Record Locked?}
    LockedCheck -- Yes --> ErrInFlight[HTTP 409: Concurrent Request in Progress]
    LockedCheck -- No --> Replay[Replay Stored Response with X-Idempotent-Replay: true]
```
