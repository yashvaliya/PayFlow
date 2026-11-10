import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { WebhookService } from './services/webhookService.js';

const PORT = parseInt(env.PORT, 10) || 5001;

async function start() {
  try {
    // Verify database connectivity
    await prisma.$connect();
    console.log('PostgreSQL database connected successfully.');

    // Recover any pending unhandled webhooks from PostgreSQL
    await WebhookService.recoverPendingEvents().catch((err) => {
      console.error('Error recovering pending webhooks on startup:', err);
    });

    const server = app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(` PayFlow Payment Platform Server Running`);
      console.log(` Port: ${PORT}`);
      console.log(` Mode: ${env.NODE_ENV} | PayPal: ${env.PAYPAL_MODE}`);
      console.log(` OpenAPI Docs: http://localhost:${PORT}/api/docs`);
      console.log(`===============================================`);
    });

    const shutdown = async () => {
      console.log('Initiating graceful shutdown...');
      server.close(async () => {
        await prisma.$disconnect();
        console.log('PayFlow server closed gracefully.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start PayFlow server:', error);
    process.exit(1);
  }
}

start();
