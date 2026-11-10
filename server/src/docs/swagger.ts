import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PayFlow API Documentation',
      version: '1.0.0',
      description:
        'Production-grade Payment Processing & Double-Entry Financial Reconciliation API for PayPal Sandbox',
      contact: {
        name: 'PayFlow Engineering Team',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API base path',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'payflow_token',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['ADMIN', 'VIEWER'] },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            orderId: { type: 'string' },
            amountMinor: { type: 'integer', description: 'Amount in integer cents (e.g. 2999 = $29.99)' },
            refundedAmountMinor: { type: 'integer' },
            currency: { type: 'string', example: 'USD' },
            status: {
              type: 'string',
              enum: [
                'CREATED',
                'PENDING_APPROVAL',
                'APPROVED',
                'COMPLETED',
                'FAILED',
                'CANCELLED',
                'REFUND_PENDING',
                'PARTIALLY_REFUNDED',
                'REFUNDED',
              ],
            },
            providerOrderId: { type: 'string' },
            providerCaptureId: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
