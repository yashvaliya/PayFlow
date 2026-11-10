import { Request, Response, NextFunction } from 'express';
import { ReconciliationService } from '../services/reconciliationService.js';

export class ReconciliationController {
  public static async run(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const notes = req.body?.notes;
      const userId = req.user?.id;

      const result = await ReconciliationService.runReconciliation(userId, notes);

      res.status(201).json({
        success: true,
        message: 'Reconciliation run completed successfully',
        data: { run: result },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

      const result = await ReconciliationService.listRuns({ page, limit });

      res.json({
        success: true,
        data: {
          runs: result.runs,
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

  public static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.params.id;
      const run = await ReconciliationService.getRunById(runId);

      res.json({
        success: true,
        data: { run },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async downloadReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.params.id;
      const csv = await ReconciliationService.generateCsvReport(runId);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="reconciliation-report-${runId}.csv"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
}
