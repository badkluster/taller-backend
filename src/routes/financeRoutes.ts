import express from 'express';
import {
  createEstimate,
  getEstimates,
  createInvoice,
  getInvoices
} from '../controllers/financeController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/estimates').get(protect as any, getEstimates as any).post(protect as any, createEstimate as any);
router.route('/invoices').get(protect as any, getInvoices as any).post(protect as any, createInvoice as any);

export default router;
