import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboardService.js';

export class DashboardController {
  public static async getSummary(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await DashboardService.getSummary();
      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getAnalytics(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const analytics = await DashboardService.getAnalytics();
      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }
}
