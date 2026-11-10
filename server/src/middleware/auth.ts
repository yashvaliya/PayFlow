import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { Role, AuthUser } from '../types/index.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.payflow_token) {
      token = req.cookies.payflow_token;
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Invalid or expired authentication token'));
    } else {
      next(error);
    }
  }
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.payflow_token) {
      token = req.cookies.payflow_token;
    }

    if (token) {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
      req.user = decoded;
    }
    next();
  } catch {
    // Silently continue for public/guest requests
    next();
  }
}

export function requireRole(allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Operation restricted to roles: ${allowedRoles.join(', ')}`)
      );
    }

    next();
  };
}
