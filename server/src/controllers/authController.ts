import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { BadRequestError, UnauthorizedError } from '../utils/errors.js';
import { registerSchema, loginSchema } from '../validators/index.js';
import { Role } from '../types/index.js';

export class AuthController {
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerSchema.parse(req.body);

      const existing = await prisma.user.findUnique({
        where: { email: parsed.email },
      });

      if (existing) {
        throw new BadRequestError('Email address is already registered');
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(parsed.password, salt);

      const user = await prisma.user.create({
        data: {
          email: parsed.email,
          passwordHash,
          name: parsed.name,
          role: Role.VIEWER, // default new registered users to VIEWER
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('payflow_token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        data: { user, token },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email: parsed.email },
      });

      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const isMatch = await bcrypt.compare(parsed.password, user.passwordHash);
      if (!isMatch) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('payflow_token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public static logout(_req: Request, res: Response): void {
    res.clearCookie('payflow_token');
    res.json({ success: true, message: 'Logged out successfully' });
  }

  public static async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new UnauthorizedError('User session expired');
      }

      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
}
