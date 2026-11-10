import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController.js';
import { optionalAuthenticate } from '../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', optionalAuthenticate, DashboardController.getSummary);
dashboardRouter.get('/analytics', optionalAuthenticate, DashboardController.getAnalytics);
