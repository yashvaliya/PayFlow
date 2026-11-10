import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { BadRequestError, ConflictError } from '../utils/errors.js';

/**
 * Recursively canonicalizes JSON data structures so identical objects
 * produce identical serialized representations regardless of key insertion order.
 */
export function canonicalizeJson(value: any): any {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  const sortedKeys = Object.keys(value).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalizeJson(value[key]);
  }
  return result;
}

/**
 * Computes a deterministic SHA-256 hash of a payload using recursive key sorting.
 */
export function computeRequestHash(payload: any): string {
  const canonical = canonicalizeJson(payload ?? {});
  const normalized = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Idempotency Middleware for state-mutating financial endpoints.
 * 
 * Enforces:
 * - Presence of Idempotency-Key header
 * - Operation identity validation (same key cannot be reused across different operations)
 * - Recursive request payload hash validation (returns 409 Conflict if payload differs)
 * - In-flight concurrency lock (returns 409 Conflict if request is in progress)
 * - Response caching and transparent replay with X-Idempotent-Replay header
 */
export function idempotency(operationName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.header('Idempotency-Key');

    if (!idempotencyKey || !idempotencyKey.trim()) {
      return next(new BadRequestError('Missing required "Idempotency-Key" header for this financial operation'));
    }

    const trimmedKey = idempotencyKey.trim();
    const requestPayload = req.body || {};
    const requestHash = computeRequestHash(requestPayload);

    try {
      // 1. Check existing record
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key: trimmedKey },
      });

      if (existing) {
        // Validate operation identity: same key cannot be used for a different operation
        if (existing.operation !== operationName) {
          throw new ConflictError(
            `Idempotency-Key "${trimmedKey}" was previously used for operation "${existing.operation}" and cannot be reused for "${operationName}".`
          );
        }

        // Validate payload hash match
        if (existing.requestHash !== requestHash) {
          throw new ConflictError(
            `Idempotency-Key "${trimmedKey}" was previously used with a different request payload.`
          );
        }

        // If request is currently in-flight
        if (existing.isLocked) {
          throw new ConflictError(
            `A request with Idempotency-Key "${trimmedKey}" is currently being processed. Please retry shortly.`
          );
        }

        // Replay previous response if available
        if (existing.responseStatus && existing.responseBody !== null) {
          res.setHeader('X-Idempotent-Replay', 'true');
          res.status(existing.responseStatus).json(existing.responseBody);
          return;
        }
      }

      // 2. Create or acquire a locked record atomically
      try {
        await prisma.idempotencyRecord.create({
          data: {
            key: trimmedKey,
            operation: operationName,
            requestHash,
            requestPayload,
            isLocked: true,
          },
        });
      } catch (createErr: any) {
        // Handle concurrent insert race (P2002: unique constraint violation)
        if (createErr.code === 'P2002') {
          throw new ConflictError(
            `A request with Idempotency-Key "${trimmedKey}" is currently being processed. Please retry shortly.`
          );
        }
        throw createErr;
      }

      // 3. Intercept response to persist the result and release the lock
      let responsePersisted = false;
      const originalJson = res.json.bind(res);

      res.json = (body: any): Response => {
        if (!responsePersisted) {
          responsePersisted = true;
          prisma.idempotencyRecord
            .update({
              where: { key: trimmedKey },
              data: {
                isLocked: false,
                responseStatus: res.statusCode,
                responseBody: body,
              },
            })
            .catch((err) => {
              console.error(`Failed to persist idempotency response for key ${trimmedKey}:`, err);
            });
        }
        return originalJson(body);
      };

      // Fallback: if connection closes prematurely or error without json, release lock
      res.on('close', () => {
        if (!responsePersisted && !res.writableEnded) {
          prisma.idempotencyRecord
            .updateMany({
              where: { key: trimmedKey, isLocked: true },
              data: { isLocked: false },
            })
            .catch(() => {});
        }
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}
