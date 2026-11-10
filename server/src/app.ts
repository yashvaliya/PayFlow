import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import fs from 'fs';

import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { swaggerSpec } from './docs/swagger.js';
import { errorHandler } from './middleware/errorHandler.js';

import { authRouter } from './routes/authRoutes.js';
import { productRouter } from './routes/productRoutes.js';
import { paymentRouter } from './routes/paymentRoutes.js';
import { dashboardRouter } from './routes/dashboardRoutes.js';
import { ledgerRouter } from './routes/ledgerRoutes.js';
import { webhookRouter } from './routes/webhookRoutes.js';
import { reconciliationRouter } from './routes/reconciliationRoutes.js';

export const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows flexible integration of PayPal SDK scripts in frontend
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration with explicit origin allowlist
const rawAllowedOrigins = [
  ...env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  env.APP_BASE_URL.trim(),
];
const allowedOrigins = Array.from(new Set(rawAllowedOrigins));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server or non-browser requests without origin header (e.g. PayPal webhooks, curl)
      if (!origin) {
        return callback(null, true);
      }
      if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
        if (
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:') ||
          allowedOrigins.includes(origin)
        ) {
          return callback(null, true);
        }
      } else {
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
      }
      return callback(new Error(`Origin "${origin}" is not allowed by CORS`));
    },
    credentials: true,
  })
);

// Morgan HTTP request logging (disabled during automated unit tests)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Rate Limiting on financial / auth endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // generous threshold for dashboard and polling
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Cookie Parser
app.use(cookieParser());

// Express JSON body parser with rawBody capture for webhook signature verification
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as any).rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// Swagger / OpenAPI documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health & Readiness checks
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'PayFlow API',
    version: '1.0.0',
    paypalMode: env.PAYPAL_MODE,
  });
});

app.get('/api/health/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'READY',
      database: 'CONNECTED',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'NOT_READY',
      database: 'DISCONNECTED',
      error: error.message,
    });
  }
});

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/api/reconciliation', reconciliationRouter);

// Serve frontend build if dist exists (unified production deployment)
const clientDistPath = path.resolve(process.cwd(), '../client/dist');
const localClientDistPath = path.resolve(process.cwd(), 'client/dist');
const staticPath = fs.existsSync(clientDistPath)
  ? clientDistPath
  : fs.existsSync(localClientDistPath)
  ? localClientDistPath
  : null;

if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// Centralized Error Handling Middleware
app.use(errorHandler);
