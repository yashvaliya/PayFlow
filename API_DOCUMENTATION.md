# PayFlow API Documentation

Interactive OpenAPI / Swagger UI is accessible at:
```
http://localhost:5001/api/docs
```

## Global Standards

- **Base Path:** `/api`
- **Content-Type:** `application/json`
- **Amounts:** Handled in integer minor currency units (cents for USD: $29.99 = `2999`).
- **Idempotency:** State-mutating endpoints (`/orders`, `/capture`, `/refund`) require the `Idempotency-Key` header.
- **Authentication:** `Authorization: Bearer <JWT>` header or HTTP-only cookie `payflow_token`.

---

## 1. Authentication Endpoints

### Register User
- **`POST /api/auth/register`**
- **Body:**
  ```json
  {
    "email": "sarah@example.com",
    "password": "Password123!",
    "name": "Sarah Chen"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "uuid",
        "email": "sarah@example.com",
        "name": "Sarah Chen",
        "role": "VIEWER",
        "createdAt": "2026-11-10T12:00:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1Ni..."
    }
  }
  ```

### Login
- **`POST /api/auth/login`**
- **Body:**
  ```json
  {
    "email": "admin@payflow.internal",
    "password": "AdminPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "user": { "id": "...", "email": "admin@payflow.internal", "role": "ADMIN" },
      "token": "..."
    }
  }
  ```

### Logout
- **`POST /api/auth/logout`**
- **Response (200 OK):** Clears cookie.

### Current User Profile
- **`GET /api/auth/me`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** Returns current user details.

---

## 2. Products Endpoint

### List Products
- **`GET /api/products`**
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "products": [
        {
          "id": "uuid",
          "name": "Enterprise API Gateway Subscription",
          "sku": "SKU-ENT-API",
          "unitAmountMinor": 9900,
          "currency": "USD",
          "stock": 50
        }
      ]
    }
  }
  ```

---

## 3. Payments Endpoints

### Get Client Configuration
- **`GET /api/payments/config`**
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "clientId": "sandbox_client_id",
      "mode": "sandbox",
      "currency": "USD"
    }
  }
  ```

### Create Payment Order
- **`POST /api/payments/orders`**
- **Headers:** `Idempotency-Key: <unique_key>`
- **Body:**
  ```json
  {
    "items": [
      {
        "productId": "uuid",
        "quantity": 1
      }
    ],
    "customerEmail": "buyer@sandbox.test",
    "customerName": "Alex Rivera"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "orderId": "uuid",
      "orderNumber": "ORD-1762810000-1234",
      "paymentId": "uuid",
      "providerOrderId": "5O190127TN364715T",
      "totalAmountMinor": 9900,
      "currency": "USD",
      "approvalUrl": "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
      "status": "PENDING_APPROVAL"
    }
  }
  ```

### Capture Payment
- **`POST /api/payments/:id/capture`**
- **Headers:** `Idempotency-Key: <unique_key>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Payment captured and settled successfully",
    "data": {
      "payment": {
        "id": "uuid",
        "status": "COMPLETED",
        "providerOrderId": "5O190127TN364715T",
        "providerCaptureId": "2C67938466730433X",
        "amountMinor": 9900,
        "completedAt": "2026-11-10T12:05:00.000Z"
      }
    }
  }
  ```

### Refund Payment (Admin Only)
- **`POST /api/payments/:id/refund`**
- **Headers:** `Authorization: Bearer <ADMIN_TOKEN>`, `Idempotency-Key: <unique_key>`
- **Body:**
  ```json
  {
    "amountMinor": 4900,
    "reason": "Customer cancellation request"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Refund executed successfully",
    "data": {
      "refund": {
        "id": "uuid",
        "amountMinor": 4900,
        "providerRefundId": "REF-99887766",
        "status": "COMPLETED"
      },
      "payment": {
        "id": "uuid",
        "status": "PARTIALLY_REFUNDED",
        "refundedAmountMinor": 4900
      }
    }
  }
  ```

### List Payments
- **`GET /api/payments?page=1&limit=20&status=COMPLETED&search=ORD-123`**
- **Response (200 OK):** Paginated payment records.

### Get Payment Details
- **`GET /api/payments/:id`**
- **Response (200 OK):** Returns payment, order items, refund history, state transition audit trail, and associated double-entry ledger journals.

---

## 4. Ledger Endpoints

### List Journal Entries
- **`GET /api/ledger?page=1&limit=20`**
- **Response (200 OK):** Returns chronological list of double-entry journals with debit and credit lines.

### Chart of Accounts
- **`GET /api/ledger/accounts`**
- **Response (200 OK):** Returns `PAYPAL_CLEARING`, `MERCHANT_PAYABLE`, and `REFUND_CLEARING` with current balances.

### Verify Accounting Invariants
- **`GET /api/ledger/verify-invariants`**
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "balanced": true,
      "totalJournals": 14,
      "totalDebitsMinor": 124800,
      "totalCreditsMinor": 124800,
      "imbalances": []
    }
  }
  ```

---

## 5. Webhooks Endpoints

### Incoming PayPal Webhook
- **`POST /api/webhooks/paypal`**
- **Headers:** `paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`
- **Response (200 OK):** Acknowledges receipt and enqueues event for asynchronous processing.

### List Logged Webhook Events
- **`GET /api/webhooks/events?page=1&limit=20`**
- **Response (200 OK):** Returns persisted events and processing status (`PROCESSED`, `IGNORED`, `FAILED`).

---

## 6. Reconciliation Endpoints

### Run Reconciliation (Admin Only)
- **`POST /api/reconciliation/run`**
- **Headers:** `Authorization: Bearer <ADMIN_TOKEN>`
- **Body:** `{ "notes": "Parity audit" }`
- **Response (201 Created):** Returns completed reconciliation run with itemized discrepancies.

### List Past Runs
- **`GET /api/reconciliation?page=1&limit=20`**

### Download CSV Report
- **`GET /api/reconciliation/:id/report`**
- **Response (200 OK):** Content-Type `text/csv`.
