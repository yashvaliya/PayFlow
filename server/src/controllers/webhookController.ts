import { Request, Response, NextFunction } from 'express';
import { WebhookService } from '../services/webhookService.js';

export class WebhookController {
  public static async handlePayPalWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      const result = await WebhookService.receiveAndQueueWebhook({
        headers: req.headers,
        rawBody,
        parsedBody: req.body,
      });

      // Immediate 200/202 acknowledge to provider
      res.status(200).json({
        success: true,
        message: result.duplicate
          ? 'Event already registered (deduplicated)'
          : 'Webhook event received and accepted for processing',
        eventId: result.event.eventId,
      });
    } catch (error: any) {
      console.error('PayPal webhook acceptance failed:', error.message);
      // Return 400 if signature failed or malformed, so PayPal knows or retries
      res.status(400).json({
        success: false,
        error: {
          code: 'WEBHOOK_VERIFICATION_FAILED',
          message: error.message,
        },
      });
    }
  }

  public static async listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

      const result = await WebhookService.listEvents({ page, limit });

      res.json({
        success: true,
        data: {
          events: result.events,
        },
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
