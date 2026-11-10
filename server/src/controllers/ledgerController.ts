import { Request, Response, NextFunction } from 'express';
import { LedgerService } from '../services/ledgerService.js';

export class LedgerController {
  public static async getJournals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const referenceType = req.query.referenceType ? String(req.query.referenceType) : undefined;

      const result = await LedgerService.getJournals({ page, limit, referenceType });

      res.json({
        success: true,
        data: {
          journals: result.journals,
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

  public static async getAccounts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const accounts = await LedgerService.getAccounts();
      res.json({
        success: true,
        data: { accounts },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async verifyInvariants(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await LedgerService.verifyInvariants();
      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
}
