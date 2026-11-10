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
 * - Exact user/session isolation including authenticated-vs-guest distinction
 * - Operation identity validation (same key cannot be reused across different operations)
 * - Recursive request payload hash validation (returns 409 Conflict if payload differs)
 * - In-flight concurrency lock with atomic stale lock recovery
 * - Recovery of unlocked records without saved responses (verified payload match first)
 * - Reliable response persistence before transmitting HTTP response over the wire
 * - Response caching and transparent replay with X-Idempotent-Replay header
 */
export function idempotency(operationName: string) {
  const LOCK_EXPIRY_MS = 30_000; // 30 seconds maximum processing lock before recovery

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.header('Idempotency-Key');

    if (!idempotencyKey || !idempotencyKey.trim()) {
      return next(new BadRequestError('Missing required "Idempotency-Key" header for this financial operation'));
    }

    const trimmedKey = idempotencyKey.trim();
    const requestPayload = req.body || {};
    const requestHash = computeRequestHash(requestPayload);
    const currentUserId = (req as any).user?.id || null;

    try {
      // 1. Check existing record
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key: trimmedKey },
      });

      if (existing) {
        // Enforce exact user/session identity, including authenticated-vs-guest distinction.
        // A guest (null userId) cannot access a key registered by an authenticated user, and vice versa.
        const existingUserId = existing.userId ?? null;
        if (existingUserId !== currentUserId) {
          throw new ConflictError(
            `Idempotency-Key "${trimmedKey}" was registered by another user and cannot be reused or accessed.`
          );
        }

        // Validate operation identity: same key cannot be used for a different operation
        if (existing.operation !== operationName) {
          throw new ConflictError(
            `Idempotency-Key "${trimmedKey}" was previously used for operation "${existing.operation}" and cannot be reused for "${operationName}".`
          );
        }

        // Check for stale lock (crashed or timed-out request)
        const lockAge = Date.now() - existing.lockedAt.getTime();
        const isStaleLock = existing.isLocked && lockAge > LOCK_EXPIRY_MS;

        // Check for unlocked record without a saved response (crashed before saving response)
        const isUnlockedWithoutResponse =
          !existing.isLocked && (existing.responseStatus === null || existing.responseBody === null);

        if (isStaleLock || isUnlockedWithoutResponse) {
          // NEVER replace the existing request hash before verifying the incoming payload matches.
          // If the record already has a requestHash, verify the incoming payload matches it.
          if (existing.requestHash && existing.requestHash !== requestHash) {
            throw new ConflictError(
              `Idempotency-Key "${trimmedKey}" was previously used with a different request payload.`
            );
          }

          // Atomic stale-lock recovery using conditional database update.
          // The WHERE clause ensures only the specific stale/crashed state is reclaimed,
          // preventing TOCTOU races where another worker concurrently reclaims the same record.
          const reclaimed = await prisma.idempotencyRecord.updateMany({
            where: {
              key: trimmedKey,
              // Match only the exact state we inspected — atomic CAS
              ...(isStaleLock
                ? { isLocked: true, lockedAt: existing.lockedAt }
                : { isLocked: false, responseStatus: null }),
            },
            data: {
              isLocked: true,
              lockedAt: new Date(),
              requestHash,
              requestPayload,
            },
          });

          if (reclaimed.count === 0) {
            // Another request already reclaimed this record — treat as in-flight conflict
            throw new ConflictError(
              `A request with Idempotency-Key "${trimmedKey}" is currently being processed. Please retry shortly.`
            );
          }
        } else {
          // Validate payload hash match for active or completed requests
          if (existing.requestHash !== requestHash) {
            throw new ConflictError(
              `Idempotency-Key "${trimmedKey}" was previously used with a different request payload.`
            );
          }

          if (existing.isLocked) {
            throw new ConflictError(
              `A request with Idempotency-Key "${trimmedKey}" is currently being processed. Please retry shortly.`
            );
          }

          if (existing.responseStatus && existing.responseBody !== null) {
            // Replay cached authoritative response
            res.setHeader('X-Idempotent-Replay', 'true');
            res.status(existing.responseStatus).json(existing.responseBody);
            return;
          }
        }
      } else {
        // 2. Create new locked record atomically
        try {
          await prisma.idempotencyRecord.create({
            data: {
              key: trimmedKey,
              operation: operationName,
              userId: currentUserId,
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
      }

      // 3. Intercept response to ensure RELIABLE persistence in PostgreSQL BEFORE sending HTTP response
      let responsePersisted = false;
      const originalJson = res.json.bind(res);

      res.json = (body: any): Response => {
        if (!responsePersisted) {
          responsePersisted = true;
          // Reliably persist the response and release the lock BEFORE returning HTTP response to the client
          (async () => {
            try {
              await prisma.idempotencyRecord.update({
                where: { key: trimmedKey },
                data: {
                  isLocked: false,
                  responseStatus: res.statusCode,
                  responseBody: body,
                },
              });
            } catch (err) {
              console.error(`Failed to reliably persist idempotency response for key ${trimmedKey}:`, err);
            } finally {
              originalJson(body);
            }
          })();
          return res;
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
