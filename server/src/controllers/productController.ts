import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';

export class ProductController {
  public static async getProducts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: { unitAmountMinor: 'asc' },
      });

      res.json({
        success: true,
        data: { products },
      });
    } catch (error) {
      next(error);
    }
  }
}
