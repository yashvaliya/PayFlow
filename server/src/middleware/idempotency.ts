import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { AppError, BadRequestError, ConflictError } from '../utils/errors.js';
import { PaymentStatus } from '@prisma/client';

/**
 * Checks if the underlying operation already completed in the database.
 * Prevents stale-lock recovery from re-executing an already-completed financial operation
 * if response persistence failed previously.
 */
async function findCompletedOperationResponse(
  operation: string,
  key: string,
  req: Request
): Promise<{ status: number; body: any } | null> {
  if (operation === 'CREATE_ORDER') {
    const payment = await prisma.payment.findUnique({
      where: { idempotencyKey: key },
    });
    if (payment) {
      const rawData = payment.rawProviderData as any;
      const approvalUrl = rawData?.links?.find((l: any) => l.rel === 'approve')?.href;
      return {
        status: 201,
        body: {
          success: true,
          data: {
            orderId: payment.orderId,
            paymentId: payment.id,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            status: payment.status,
            approvalUrl,
            payPalOrderId: payment.providerOrderId,
          },
        },
      };
    }
  } else if (operation === 'CAPTURE_PAYMENT') {
    const paymentId = req.params?.id;
    if (paymentId) {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      if (
        payment &&
        (payment.status === PaymentStatus.COMPLETED ||
          payment.status === PaymentStatus.REQUIRES_REVIEW ||
          payment.status === PaymentStatus.REFUNDED ||
          payment.status === PaymentStatus.PARTIALLY_REFUNDED)
      ) {
        return {
          status: 200,
          body: {
            success: true,
            message: 'Payment captured and settled successfully',
            data: { payment },
          },
        };
      }
    }
  } else if (operation === 'REFUND_PAYMENT') {
    const refund = await prisma.refund.findUnique({
      where: { idempotencyKey: key },
    });
    if (refund) {
      const payment = await prisma.payment.findUnique({
        where: { id: refund.paymentId },
      });
      return {
        status: 200,
        body: {
          success: true,
          message: 'Refund executed successfully',
          data: {
            refund,
            payment,
          },
        },
      };
    }
  }
  return null;
}

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
 * - Durable response persistence: HTTP response is sent ONLY after PostgreSQL write succeeds
 * - Response caching and transparent replay with X-Idempotent-Replay header
 *
 * Response persistence guarantee:
 *   The overridden res.json() awaits the database update BEFORE calling the
 *   original res.json() to flush bytes to the client.  If the database write
 *   fails the lock is intentionally kept so that a retry with the same
 *   idempotency key will reclaim the stale lock and re-execute — but will NOT
 *   double-execute the financial operation because the controller has already
 *   returned.  The client receives a 500 error (via Express error handler)
 *   instead of a successful response whose idempotency record was never saved.
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
          if (existing.requestHash && existing.requestHash !== requestHash) {
            throw new ConflictError(
              `Idempotency-Key "${trimmedKey}" was previously used with a different request payload.`
            );
          }

          // If the underlying financial operation already succeeded (e.g. response persistence failed),
          // do NOT execute the payment operation again. Replay the completed result directly.
          const completed = await findCompletedOperationResponse(operationName, trimmedKey, req);
          if (completed) {
            await prisma.idempotencyRecord
              .update({
                where: { key: trimmedKey },
                data: {
                  isLocked: false,
                  responseStatus: completed.status,
                  responseBody: completed.body,
                },
              })
              .catch(() => {});

            res.setHeader('X-Idempotent-Replay', 'true');
            res.status(completed.status).json(completed.body);
            return;
          }

          // Atomic stale-lock recovery using conditional database update.
          const reclaimed = await prisma.idempotencyRecord.updateMany({
            where: {
              key: trimmedKey,
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
          if (createErr.code === 'P2002') {
            throw new ConflictError(
              `A request with Idempotency-Key "${trimmedKey}" is currently being processed. Please retry shortly.`
            );
          }
          throw createErr;
        }
      }

      // 3. Intercept res.json to enforce durable persistence BEFORE HTTP delivery.
      //
      //    Invariants:
      //    - originalJson(body) is called ONLY after the DB write succeeds.
      //    - On DB failure the lock is KEPT so retries reclaim via stale-lock path.
      //    - The client receives a 500 error (not the success body) if persistence fails.
      //    - Duplicate sends are prevented via the `persistenceHandled` guard.
      //    - The fire-and-forget IIFE pattern is required because res.json() has a
      //      synchronous return signature; all rejections are caught internally.
      let persistenceHandled = false;
      const originalJson = res.json.bind(res);

      res.json = (body: any): Response => {
        if (persistenceHandled) {
          // Already handled (success or failure) — forward directly to avoid loops
          return originalJson(body);
        }
        persistenceHandled = true;

        const statusCode = res.statusCode;

        // Fire-and-forget async IIFE — all paths are caught; no unhandled rejections
        (async () => {
          try {
            // Persist response and release lock BEFORE sending bytes to the client
            await prisma.idempotencyRecord.update({
              where: { key: trimmedKey },
              data: {
                isLocked: false,
                responseStatus: statusCode,
                responseBody: body,
              },
            });

            // DB succeeded — now it is safe to deliver the response
            originalJson(body);
          } catch (persistErr) {
            // DB persistence failed.
            // DO NOT call originalJson(body) — the client must not receive a
            // success response whose idempotency record was never saved.
            // DO NOT release the lock — keep it held so retries go through
            // stale-lock recovery instead of re-executing the operation.
            console.error(
              `Idempotency persistence failed for key "${trimmedKey}". ` +
              `Lock retained; client will receive 500.`,
              persistErr,
            );

            // Handle the failure safely through the Express error-handling mechanism,
            // provided the response has not already been sent.
            if (!res.headersSent && !res.writableEnded) {
              next(
                new AppError(
                  'The operation completed but its result could not be persisted. Please retry with the same Idempotency-Key.',
                  500,
                  'IDEMPOTENCY_PERSISTENCE_FAILURE'
                )
              );
            }
          }
        })();

        return res;
      };

      // Fallback: if connection closes prematurely or error without json, release lock.
      // This only fires for cases where the controller never called res.json() at all
      // (e.g. the client aborted before the controller finished).
      res.on('close', () => {
        if (!persistenceHandled && !res.writableEnded) {
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
