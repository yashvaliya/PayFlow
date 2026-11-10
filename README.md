# PayFlow — Payment Processing & Reconciliation Platform

[![CI Pipeline](https://github.com/yashvaliya/payflow/actions/workflows/ci.yml/badge.svg)](https://github.com/yashvaliya/payflow/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> A production-grade fintech web platform demonstrating real-world payment API integration, transaction integrity, double-entry financial ledger accounting, strict idempotency, event-driven webhook processing, and automated settlement reconciliation.

Built for the **PayPal Software Engineering Intern** portfolio assessment.

---

## 1. Project Introduction

PayFlow is a professional merchant settlement and payment management platform built from first principles to simulate a real payment facilitator. Rather than treating payment APIs as simple webhook callbacks or static checkouts, PayFlow handles the complete transaction lifecycle: authoritative pricing, payment order creation, secure PayPal Sandbox capture, append-only double-entry ledger settlement, full/partial refund reversals, cryptographic webhook signature verification, and order-level discrepancy reconciliation.

---

## 2. Problem Statement

Many web applications make fatal financial engineering mistakes:
1. **Floating-point rounding errors:** Using JavaScript `Number` for currency calculations leads to penny discrepancies ($0.1 + $0.2 = $0.30000000000000004).
2. **Client-side price tampering:** Accepting prices or totals sent directly from the browser allows malicious users to alter checkout amounts.
3. **Duplicate billing & race conditions:** Rapid double-clicking or network retries creating duplicate charges without strict server idempotency.
4. **Discrepancies & missing callbacks:** Webhooks dropped due to network partitions leaving internal order states out of sync with payment providers.
5. **Single-entry or editable balances:** Modifying historical transaction rows rather than maintaining an immutable, balanced accounting journal.

**PayFlow solves every one of these problems with robust architectural safeguards.**

---

## 3. Key Features

- **Real PayPal Sandbox Integration:** Direct integration with PayPal REST API v2 (`/v2/checkout/orders` and `/v2/payments/captures/{id}/refund`) using cached OAuth 2.0 client credentials.
- **Authoritative Server Pricing:** Product catalog retrieved from PostgreSQL; totals calculated exclusively on the server in integer cents.
- **Double-Entry Financial Ledger:** Append-only ledger recording debit and credit journal entries (`PAYPAL_CLEARING` and `MERCHANT_PAYABLE`). System invariant `Sum(Debits) === Sum(Credits)` verified in atomic database transactions.
- **Strict Idempotency Engine:** State-mutating endpoints require `Idempotency-Key`. Replays identical responses on repeated requests and rejects payload changes with HTTP 409 Conflict.
- **Event-Driven Webhook Pipeline:** Cryptographic signature verification against PayPal certs, event ID deduplication, and asynchronous background settlement workers.
- **Order-Level Reconciliation Engine:** Cross-references internal PostgreSQL records against PayPal ground truth, flags discrepancies, and exports CSV audit reports.
- **Role-Based Access Control (RBAC):** Admin and Viewer roles. Only authorized Admins can initiate refunds or trigger reconciliation jobs.
- **1-Click Recruiter Demo Access:** Instant sign-in buttons for Admin (`admin@payflow.internal`) and Viewer (`viewer@payflow.internal`).

---

## 4. Technology Stack

### Frontend
- **Framework:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS, shadcn/ui design tokens
- **State & Data Fetching:** TanStack React Query (v5)
- **Routing:** React Router 7
- **Visualizations:** Recharts (Area charts, Donut charts)
- **Icons:** Lucide React

### Backend
- **Runtime:** Node.js 22 LTS, Express.js, TypeScript (ES2022 / NodeNext)
- **Database & ORM:** PostgreSQL 16, Prisma ORM
- **Validation:** Zod schemas for all request payloads
- **Security:** Helmet, CORS, Argon2/Bcrypt password hashing, JWT HTTP-only cookies, Rate Limiting
- **Documentation:** Swagger UI / OpenAPI 3.0

### Testing & DevOps
- **Testing:** Vitest, Supertest (19 unit & integration tests, 100% passing)
- **Containerization:** Multi-stage Dockerfile, Docker Compose
- **CI/CD:** GitHub Actions automated test & build pipeline

---

## 5. Architecture Diagram

```mermaid
flowchart TD
    Client[React 18 + Vite SPA] -->|Idempotency-Key + Bearer JWT| Gateway[Express.js REST Gateway]
    
    subgraph PayFlow Platform Core
        Gateway --> AuthMiddleware[RBAC & JWT Auth]
        Gateway --> IdempotencyEngine[Idempotency Middleware]
        Gateway --> PaymentService[Authoritative Payment Service]
        Gateway --> LedgerService[Double-Entry Ledger Service]
        Gateway --> ReconciliationService[Reconciliation Engine]
        Gateway --> WebhookService[Webhook Ingestion Engine]
        
        PaymentService --> StateMachine[Payment State Machine]
        PaymentService --> PostgreSQL[(PostgreSQL Database)]
        LedgerService --> PostgreSQL
        IdempotencyEngine --> PostgreSQL
        WebhookService --> PostgreSQL
    end

    subgraph PayPal Cloud
        PaymentService -->|OAuth 2.0 / REST v2| PayPalAPI[PayPal Sandbox API]
        PayPalAPI -->|Signature-Verified Webhook| WebhookService
        ReconciliationService -->|Ground Truth Verification| PayPalAPI
    end
```

---

## 6. Database Schema Overview

Designed with Prisma ORM and PostgreSQL:

```
users                     — User credentials, names, and roles (ADMIN, VIEWER)
products                  — Authoritative catalog, SKUs, and unit amounts in cents
orders                    — Customer orders and totals
order_items               — Order line items linked to products
payments                  — Payment records, statuses, PayPal Order & Capture IDs
payment_state_transitions — Auditable state transition history
refunds                   — Full or partial refund records with PayPal Refund IDs
idempotency_records       — Unique keys, operation names, request hashes, response cache
ledger_accounts           — Chart of accounts (PAYPAL_CLEARING, MERCHANT_PAYABLE)
ledger_journals           — Double-entry journals (Capture, Refund reversals)
ledger_entries            — Debit and Credit entries with amountMinor
webhook_events            — Persisted PayPal events with deduplicated eventId
reconciliation_runs       — Reconciliation batches and summaries
reconciliation_items      — Itemized comparison matrices and discrepancy flags
audit_logs                — Administrative audit trail
```

---

## 7. Payment Lifecycle & State Transitions

1. `CREATED`: Local order and payment record initialized with server-calculated price.
2. `PENDING_APPROVAL`: PayPal order created; awaiting buyer sandbox authorization.
3. `APPROVED`: Buyer authorizes payment via PayPal Sandbox modal.
4. `COMPLETED`: Payment captured by PayPal; atomically posts double-entry ledger capture journal.
5. `REFUND_PENDING`: Admin submits full or partial refund request.
6. `PARTIALLY_REFUNDED`: PayPal confirms partial refund; posts reversing ledger journal.
7. `REFUNDED`: Full amount refunded; order marked refunded.
8. `FAILED` / `CANCELLED`: Terminal failure states.

---

## 8. Idempotency Implementation

State-mutating endpoints (`/api/payments/orders`, `/api/payments/:id/capture`, `/api/payments/:id/refund`) require the `Idempotency-Key` header:
1. **Uniqueness:** Stored in PostgreSQL with unique index on `key`.
2. **Payload Hash Check:** Compares SHA-256 hash of incoming JSON payload against original request.
3. **Response Replay:** If key exists with matching hash, returns stored response with `X-Idempotent-Replay: true`.
4. **Tamper Rejection:** If key exists with different payload, returns `HTTP 409 Conflict`.
5. **In-Flight Lock:** If another request is currently processing with that key, returns `HTTP 409 Concurrent Request in Progress`.

---

## 9. Double-Entry Financial Ledger

PayFlow implements strict double-entry bookkeeping:
- All values stored in **integer minor units** (e.g. cents: $99.00 = `9900`).
- **Capture Journal:**
  - **Debit:** `PAYPAL_CLEARING` (Asset increases)
  - **Credit:** `MERCHANT_PAYABLE` (Liability increases)
- **Refund Journal:**
  - **Debit:** `MERCHANT_PAYABLE` (Liability decreases)
  - **Credit:** `PAYPAL_CLEARING` (Asset decreases)
- **Invariant:** `Sum(Debits) === Sum(Credits)` strictly verified across every journal.

---

## 10. Webhook Processing

- **Endpoint:** `POST /api/webhooks/paypal`
- **Signature Verification:** Preserves raw HTTP body; verifies transmission headers with PayPal API.
- **Deduplication:** Unique index on `eventId` prevents duplicate event processing.
- **Asynchronous Execution:** Accepts event immediately with HTTP 200, then settles in background.
- **Shared Service:** Invokes the same settlement and ledger service as synchronous capture.

---

## 11. Reconciliation Logic

The Reconciliation Engine compares PostgreSQL transactions against live PayPal Sandbox records:
1. Fetches recent payments with PayPal Order or Capture IDs.
2. Queries PayPal API for authoritative status and amount.
3. Compares internal status vs. PayPal status and internal amount vs. provider amount.
4. Categorizes into:
   - `MATCHED`: Parity confirmed across state and amount.
   - `INTERNAL_MISMATCH`: Discrepancy between internal database and provider.
   - `PROVIDER_MISMATCH`: Amount or status mismatch.
   - `PENDING_REVIEW`: Ambiguous state or missing capture ID.
5. Generates downloadable CSV audit reports.

---

## 12. Local Installation Instructions

### Prerequisites
- Node.js >= 22.0.0
- npm >= 10.0.0
- Docker and Docker Compose (or local PostgreSQL)

### Steps
```bash
# 1. Clone repository
git clone https://github.com/yashvaliya/payflow.git
cd payflow

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
cp server/.env.example server/.env

# 4. Start local database
docker-compose up db -d

# 5. Push schema and seed demo data
npm run prisma:migrate --workspace=server
npm run prisma:seed --workspace=server

# 6. Start development server
npm run dev
```

Visit `http://localhost:5173` for the Vite development client.

---

## 13. Environment Configuration

```env
PORT=5001
NODE_ENV=development
APP_BASE_URL=http://localhost:5173
DATABASE_URL="postgresql://payflow_user:payflow_secure_password@localhost:5432/payflow?schema=public"
JWT_SECRET="secure_random_key_min_32_characters_long"
SESSION_SECRET="secure_random_key_min_32_characters_long"

PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
```

---

## 14. PayPal Sandbox Setup

1. Create a developer account at [developer.paypal.com](https://developer.paypal.com).
2. Create a Sandbox REST App in the dashboard.
3. Copy **Client ID** and **Secret** to `.env`.
4. In sandbox accounts, create a **Personal / Buyer** account for checkout testing.
5. In your PayPal App settings, register webhook URL: `https://<domain>/api/webhooks/paypal`.

---

## 15. Testing Instructions

Run the automated Vitest test suite:
```bash
npm run test --workspace=server
```

All 19 tests in 4 test suites will execute, verifying:
- Minor units money arithmetic & float safety
- State machine transition rules & terminal states
- Double-entry ledger balancing invariants
- Idempotency replay and conflict detection
- Role-based authorization guards on refunds
- Webhook signature verification and deduplication

---

## 16. Docker Instructions

Run the entire application in Docker:
```bash
docker-compose up --build -d
```
Access the application at `http://localhost:5001`.

---

## 17. Deployment Instructions

PayFlow is containerized with a production multi-stage Dockerfile:
1. Connect repository to [Railway](https://railway.app) or [Render](https://render.com).
2. Provision a managed PostgreSQL instance.
3. Set environment variables: `DATABASE_URL`, `JWT_SECRET`, `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
4. Set build command to `npm run build` and start command to `node server/dist/server.js`.

---

## 18. API Documentation Link

- **Interactive OpenAPI / Swagger UI:** `http://localhost:5001/api/docs`
- **Markdown Specification:** See [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

---

## 19. Demo Flow & User Walkthrough

1. Open the application.
2. Click **1-Click Admin Login** on the home page or navbar.
3. Open **Checkout** (`/checkout`), choose a service, and click **Proceed to PayPal Sandbox Checkout**.
4. Confirm sandbox capture.
5. Inspect the generated **Transaction Details** (`/transactions/:id`).
6. Inspect the double-entry journal entries posted under **Ledger** (`/ledger`).
7. Click **Verify Accounting Invariant** to confirm `Sum(Debits) === Sum(Credits)`.
8. Execute a partial or full refund and observe the reversing ledger entry.
9. Open **Reconciliation** (`/reconciliation`), trigger a job, and export the CSV report.

---

## 20. Known Limitations

- **Currency Scope:** Currently configured for USD minor units (cents) to maintain strict financial invariants. Architecture is structured to support multi-currency ISO codes in future iterations.
- **Sandbox Boundary:** Designed exclusively for PayPal Sandbox API testing; real-money transactions are intentionally disabled.
