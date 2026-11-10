# PayFlow — Payment Processing & Double-Entry Ledger

[![CI Pipeline](https://github.com/yashvaliya/payflow/actions/workflows/ci.yml/badge.svg)](https://github.com/yashvaliya/payflow/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A full-stack payment processing platform built with **React**, **Node/Express**, **PostgreSQL**, and the **PayPal REST API**.

Built by **Yash Valiya** to study how real-world fintech systems handle money, failure states, and accounting without rounding errors or duplicate charges.

---

## Why I Built This

Most tutorial payment apps make fundamental mistakes when handling real money:

1. **Floating-point money bugs:** Writing `0.1 + 0.2` in JavaScript produces `0.30000000000000004`. Over thousands of transactions, penny drift destroys accounting balances.
2. **Trusting the browser with prices:** If the client sends `{ amount: 99.00 }`, a malicious user can inspect element and send `{ amount: 1.00 }`.
3. **Double-click charges:** If a user clicks "Pay" twice or their network drops during checkout, they get charged twice without an idempotency key.
4. **Out-of-order or missed webhooks:** Webhooks can arrive out of order, get dropped by network partitions, or fire multiple times.
5. **Editing historical rows:** When someone gets a refund, typical apps just update `status = "REFUNDED"`. Real accounting requires an immutable double-entry journal so every dollar is tracked.

**PayFlow solves each of these problems directly.**

---

## Key Features

- **PayPal Sandbox Checkout:** Integrated directly with PayPal's REST API v2 (`/v2/checkout/orders` and capture/refund endpoints) using OAuth 2.0 client credentials and token caching.
- **Server-Authoritative Pricing:** The frontend sends item IDs and quantities; the server looks up authoritative prices in PostgreSQL and calculates totals.
- **Double-Entry Financial Ledger:** Every capture and refund posts balanced debit/credit journals (`PAYPAL_CLEARING` and `MERCHANT_PAYABLE`). The system verifies the invariant $\sum \text{Debits} \equiv \sum \text{Credits}$ atomically.
- **Integer Minor Units (Cents):** No floating-point math anywhere. $99.00 is stored and calculated as `9900` integer cents.
- **Idempotency Engine:** State-changing endpoints require an `Idempotency-Key` header. Duplicate requests replay the original response, and payload changes return `409 Conflict`.
- **Deduplicated Webhook Queue:** Ingests PayPal webhooks, verifies signatures, deduplicates on `eventId`, and processes settlements asynchronously.
- **Order-Level Reconciliation:** Cross-references internal database records against PayPal's actual records to flag missing callbacks or discrepancies, and exports an audit CSV.
- **Role-Based Access Control:** Separate Admin (`yash@payflow.dev`) and Auditor (`alex@payflow.dev`) roles with JWT authentication. Only Admins can issue refunds or trigger reconciliation runs.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │          React 18 + Vite (SPA)          │
                      │  Tailwind CSS • TanStack Query • Recharts│
                      └────────────────────┬────────────────────┘
                                           │ Idempotency-Key
                                           │ Bearer JWT
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │         Express.js API Gateway          │
                      │       Zod Validation • Rate Limiter     │
                      └────┬───────────────┬────────────────┬───┘
                           │               │                │
            ┌──────────────▼───┐   ┌───────▼──────┐  ┌──────▼────────┐
            │  Payment Service │   │ Ledger Engine│  │ Reconciliation│
            │  (State Machine) │   │ (Double-Entry│  │    Engine     │
            └──────────────┬───┘   └───────┬──────┘  └──────┬────────┘
                           │               │                │
                           ▼               ▼                ▼
                      ┌─────────────────────────────────────────┐
                      │          PostgreSQL 16 Database         │
                      │          (Managed with Prisma)          │
                      └────────────────────┬────────────────────┘
                                           │
                                           │ REST v2 & Webhooks
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │           PayPal Sandbox Cloud          │
                      └─────────────────────────────────────────┘
```

---

## How a Payment Moves Through PayFlow

```
1. Customer picks items
      │
      ▼
2. Server recalculates total from Postgres (never trusts client amount)
      │
      ▼
3. Server creates PayPal Order with PayPal-Request-Id (Idempotent)
      │
      ▼
4. Buyer approves checkout in PayPal
      │
      ▼
5. Server calls PayPal /capture endpoint
      │
      ▼
6. In a single atomic database transaction:
   ├── Transition state: PENDING_APPROVAL -> COMPLETED
   ├── Post Ledger Journal:
   │     Debit:  PAYPAL_CLEARING      +$99.00 (Asset increases)
   │     Credit: MERCHANT_PAYABLE     +$99.00 (Liability increases)
   └── Verify invariant: Debits == Credits
```

---

## Tech Stack

| Layer | Tools |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Recharts, Lucide Icons |
| **Backend** | Node.js 22 LTS, Express.js, TypeScript, Prisma ORM, Zod |
| **Database** | PostgreSQL 16 |
| **Payments** | PayPal REST API v2, PayPal JS SDK |
| **Testing** | Vitest, Supertest (19 unit & integration tests) |
| **DevOps** | Docker, Docker Compose, GitHub Actions CI |

---

## Project Structure

```
PayFlow/
├── client/                      # React frontend
│   ├── src/
│   │   ├── api/client.ts        # Typed API client
│   │   ├── components/          # Navbar, Footer, SandboxBanner, StatusBadge
│   │   ├── context/             # AuthContext, ThemeContext
│   │   ├── pages/               # Lazy-loaded route pages (Dashboard, Checkout, Ledger, etc.)
│   │   └── lib/utils.ts         # Money formatting (cents -> dollars)
│   └── vite.config.ts
├── server/                      # Express backend
│   ├── prisma/
│   │   ├── schema.prisma        # 16 database models
│   │   ├── migrations/          # Version-controlled SQL migrations
│   │   └── seed.ts              # Demo products and accounts
│   ├── src/
│   │   ├── controllers/         # HTTP request handlers
│   │   ├── services/            # Payment, Ledger, Webhook, and Reconciliation services
│   │   ├── middleware/          # Idempotency, Auth, Error handling
│   │   ├── integrations/paypal/ # PayPal REST client with token caching
│   │   └── utils/               # Money arithmetic & custom error classes
│   └── tests/                   # Vitest unit & integration test suites
├── Dockerfile                   # Multi-stage production container build
├── docker-compose.yml           # App + PostgreSQL container setup
└── .github/workflows/ci.yml     # Automated GitHub Actions test & build pipeline
```

---

## Quickstart

### Prerequisites
- Node.js >= 20.0.0
- Docker & Docker Compose (or a local PostgreSQL 16 instance)

### 1. Clone & Install
```bash
git clone https://github.com/yashvaliya/PayFlow.git
cd PayFlow
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example server/.env
```

### 3. Start Database & Seed
```bash
docker compose up -d db
npm run prisma:migrate
npm run prisma:seed
```

### 4. Run the Dev Servers
```bash
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5001`
- Swagger Docs: `http://localhost:5001/api/docs`

---

## Automated Test Suite

Run the full test suite with:
```bash
npm test
```

PayFlow includes 19 automated tests covering:
- **Money arithmetic (`tests/unit/money.test.ts`):** Verifies no floating-point rounding errors and proper cent conversions.
- **State machine (`tests/unit/stateMachine.test.ts`):** Ensures invalid transitions (e.g. `FAILED` -> `COMPLETED`) are blocked.
- **Ledger invariant (`tests/unit/ledger.test.ts`):** Tests that every capture and refund journal balances ($\sum \text{Debits} = \sum \text{Credits}$).
- **Integration flows (`tests/integration/payments.test.ts`):**
  - Rejection of financial requests without `Idempotency-Key`
  - Cached response replay on repeated requests
  - Rejection of modified payloads under the same key (`409 Conflict`)
  - Capture & atomic ledger settlement
  - Role-based refund access (`VIEWER` blocked, `ADMIN` allowed)
  - Webhook deduplication on `eventId`

---

## Demo Credentials

| Role | Email | Password | Permissions |
|---|---|---|---|
| **Admin** | `yash@payflow.dev` (or `admin@payflow.internal`) | `AdminPassword123!` | Full access: capture, refund, trigger reconciliation |
| **Auditor** | `alex@payflow.dev` (or `viewer@payflow.internal`) | `ViewerPassword123!` | Read-only: view dashboards, transactions, ledger, and webhooks |

*(The web interface also includes 1-click login buttons on the login page and landing page).*

---

## License

MIT © Yash Valiya
