import { Router } from 'express';
import { LedgerController } from '../controllers/ledgerController.js';
import { optionalAuthenticate } from '../middleware/auth.js';

export const ledgerRouter = Router();

ledgerRouter.get('/', optionalAuthenticate, LedgerController.getJournals);
ledgerRouter.get('/accounts', optionalAuthenticate, LedgerController.getAccounts);
ledgerRouter.get('/verify-invariants', optionalAuthenticate, LedgerController.verifyInvariants);
