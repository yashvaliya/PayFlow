# PayFlow Deployment & Operations Guide

PayFlow is designed for seamless, single-container or multi-service deployment with Docker, Docker Compose, or managed cloud platforms (Railway, Render, Fly.io, AWS, Heroku).

---

## 1. Environment Variables Reference

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | Runtime environment | `production` |
| `PORT` | Yes | HTTP listening port | `5001` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@host:5432/payflow?schema=public` |
| `JWT_SECRET` | Yes | Secret key for signing session tokens (min 32 chars) | `32_char_secure_random_string` |
| `SESSION_SECRET` | Yes | Secret for cookie sessions | `32_char_secure_random_string` |
| `APP_BASE_URL` | Yes | Public HTTPS URL of the frontend | `https://payflow.yourdomain.com` |
| `PAYPAL_MODE` | Yes | PayPal environment | `sandbox` (or `live`) |
| `PAYPAL_CLIENT_ID` | Yes | PayPal Sandbox REST App Client ID | `AU...` |
| `PAYPAL_CLIENT_SECRET` | Yes | PayPal Sandbox REST App Secret | `EL...` |
| `PAYPAL_WEBHOOK_ID` | Yes | Registered Webhook ID from PayPal Developer Portal | `WH-...` |

---

## 2. Docker Compose (Local & Production Server)

To run the complete stack locally with persistent PostgreSQL:

```bash
# 1. Clone repository
git clone https://github.com/yashvaliya/payflow.git
cd payflow

# 2. Configure environment
cp .env.example .env
# Edit .env with your PayPal Sandbox credentials

# 3. Build and run containers
docker-compose up --build -d

# 4. Check application logs
docker-compose logs -f app
```

The application will be accessible at:
- Web App & Dashboard: `http://localhost:5001`
- OpenAPI Swagger: `http://localhost:5001/api/docs`

---

## 3. Cloud Deployment (e.g. Railway or Render)

### Deploying to Railway
1. **New Project:** In Railway, select **Deploy from GitHub repo**.
2. **Add PostgreSQL:** Add a Railway PostgreSQL database plugin. Railway automatically sets `DATABASE_URL`.
3. **Environment Variables:**
   - Add `JWT_SECRET`, `SESSION_SECRET`, `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
   - Set `APP_BASE_URL` to your Railway generated domain (e.g., `https://payflow-production.up.railway.app`).
4. **Build & Start:**
   - The multi-stage Dockerfile handles database migration synchronization (`prisma db push`), frontend asset compilation, and server launch.

---

## 4. PayPal Webhook Registration

To receive live webhooks from PayPal Sandbox:
1. Log in to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox).
2. Open your Sandbox REST API App.
3. Click **Add Webhook**.
4. Set **Webhook URL** to:
   ```
   https://<your-deployed-domain>/api/webhooks/paypal
   ```
5. Select the following event types:
   - `Payment capture completed` (`PAYMENT.CAPTURE.COMPLETED`)
   - `Payment capture denied` (`PAYMENT.CAPTURE.DENIED`)
   - `Payment capture refunded` (`PAYMENT.CAPTURE.REFUNDED`)
6. Copy the resulting **Webhook ID** and configure `PAYPAL_WEBHOOK_ID` in your server environment variables.
