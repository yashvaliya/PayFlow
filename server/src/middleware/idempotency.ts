import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { BadRequestError, ConflictError } from '../utils/errors.js';

export function computeRequestHash(payload: any): string {
  const normalized = JSON.stringify(payload ?? {}, Object.keys(payload ?? {}).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Idempotency Middleware for state-mutating endpoints (e.g. Orders, Capture, Refunds)
 * 
 * Inspects `Idempotency-Key` header:
 * - If record exists and payload hash matches: returns stored response.
 * - If record exists and payload hash differs: returns 409 Conflict.
 * - If record exists and is still in-flight (isLocked=true): returns 409 (Concurrent request in progress).
 * - Otherwise: creates locked record and hooks into res.json / res.send to save response upon completion.
 */
export function idempotency(operationName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.header('Idempotency-Key');

    // If no Idempotency-Key header is supplied, generate or require one based on strictness
    if (!idempotencyKey) {
      // In PayFlow, financial operations require Idempotency-Key for strict safety
      return next(new BadRequestError('Missing required "Idempotency-Key" header for this financial operation'));
    }

    const requestPayload = req.body || {};
    const requestHash = computeRequestHash(requestPayload);

    try {
      // Check existing record
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing) {
        // Check hash match
        if (existing.requestHash !== requestHash) {
          throw new ConflictError(
            `Idempotency-Key "${idempotencyKey}" was previously used with a different request payload.`
          );
        }

        // If still processing
        if (existing.isLocked) {
          throw new ConflictError(
            `A request with Idempotency-Key "${idempotencyKey}" is currently being processed. Please retry shortly.`
          );
        }

        // Replay previous response
        if (existing.responseStatus && existing.responseBody) {
          res.setHeader('X-Idempotent-Replay', 'true');
          res.status(existing.responseStatus).json(existing.responseBody);
          return;
        }
      }

      // Create a locked record (using try/catch to handle concurrent insert race)
      try {
        await prisma.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            operation: operationName,
            requestHash,
            requestPayload,
            isLocked: true,
          },
        });
      } catch (createErr: any) {
        // Handle unique constraint violation from concurrent request
        if (createErr.code === 'P2002') {
          throw new ConflictError(
            `A request with Idempotency-Key "${idempotencyKey}" is currently being processed. Please retry shortly.`
          );
        }
        throw createErr;
      }

      // Intercept response to store result
      const originalJson = res.json.bind(res);
      res.json = (body: any): Response => {
        // Asynchronously update the idempotency record with the final response
        prisma.idempotencyRecord
          .update({
            where: { key: idempotencyKey },
            data: {
              isLocked: false,
              responseStatus: res.statusCode,
              responseBody: body,
            },
          })
          .catch((err) => {
            console.error(`Failed to persist idempotency response for key ${idempotencyKey}:`, err);
          });

        return originalJson(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
