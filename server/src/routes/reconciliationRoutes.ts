import { Router } from 'express';
import { ReconciliationController } from '../controllers/reconciliationController.js';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth.js';
import { Role } from '../types/index.js';

export const reconciliationRouter = Router();

// Run reconciliation (Admin only for triggering new runs)
reconciliationRouter.post('/run', authenticate, requireRole([Role.ADMIN]), ReconciliationController.run);

// List past runs
reconciliationRouter.get('/', optionalAuthenticate, ReconciliationController.list);

// Get run details
reconciliationRouter.get('/:id', optionalAuthenticate, ReconciliationController.getById);

// Download CSV report
reconciliationRouter.get('/:id/report', optionalAuthenticate, ReconciliationController.downloadReport);
