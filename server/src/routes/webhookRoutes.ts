import { Router } from 'express';
import { WebhookController } from '../controllers/webhookController.js';
import { optionalAuthenticate } from '../middleware/auth.js';

export const webhookRouter = Router();

// Incoming PayPal Webhook callback
webhookRouter.post('/paypal', WebhookController.handlePayPalWebhook);

// List received webhook events for inspection & auditing
webhookRouter.get('/events', optionalAuthenticate, WebhookController.listEvents);
