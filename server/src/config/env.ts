import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

// Search possible .env locations (root, server directory, cwd)
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'server/.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

const DEFAULT_DEV_JWT_SECRET = 'payflow_dev_jwt_secret_change_in_production_min_32_chars';
const DEFAULT_DEV_SESSION_SECRET = 'payflow_dev_session_secret_change_in_production_min_32';

const envSchema = z
  .object({
    PORT: z.string().default('5001'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').default(DEFAULT_DEV_JWT_SECRET),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').default(DEFAULT_DEV_SESSION_SECRET),
    APP_BASE_URL: z.string().default('http://localhost:5173'),
    API_BASE_URL: z.string().default('http://localhost:5001'),
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5001'),

    // PayPal configuration - strictly sandboxed for safety
    PAYPAL_MODE: z.literal('sandbox').default('sandbox'),
    PAYPAL_BASE_URL: z.string().default('https://api-m.sandbox.paypal.com'),
    PAYPAL_CLIENT_ID: z.string().default(''),
    PAYPAL_CLIENT_SECRET: z.string().default(''),
    PAYPAL_WEBHOOK_ID: z.string().default(''),
    PAYPAL_ALLOW_MOCK: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
  })
  .superRefine((data, ctx) => {
    // Sandbox Safety: Prevent any accidental real-money / live PayPal configuration
    if (data.PAYPAL_MODE !== 'sandbox') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Fatal safety check: PayFlow only supports PAYPAL_MODE="sandbox". Real-money payments are forbidden.',
        path: ['PAYPAL_MODE'],
      });
    }

    if (
      data.PAYPAL_BASE_URL &&
      (data.PAYPAL_BASE_URL.includes('api.paypal.com') ||
        (data.PAYPAL_BASE_URL.includes('api-m.paypal.com') && !data.PAYPAL_BASE_URL.includes('sandbox')))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Fatal safety check: Live PayPal base URL detected. Only sandbox.paypal.com endpoints are allowed.',
        path: ['PAYPAL_BASE_URL'],
      });
    }
    // Production security validation
    if (data.NODE_ENV === 'production') {
      if (data.JWT_SECRET === DEFAULT_DEV_JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'In production, JWT_SECRET must be explicitly set and cannot use the development default',
          path: ['JWT_SECRET'],
        });
      }
      if (data.SESSION_SECRET === DEFAULT_DEV_SESSION_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'In production, SESSION_SECRET must be explicitly set and cannot use the development default',
          path: ['SESSION_SECRET'],
        });
      }
      if (data.PAYPAL_ALLOW_MOCK) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PAYPAL_ALLOW_MOCK cannot be enabled in production environment',
          path: ['PAYPAL_ALLOW_MOCK'],
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('CRITICAL: Invalid environment configuration:');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;
