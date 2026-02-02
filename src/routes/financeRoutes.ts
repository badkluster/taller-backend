import express from 'express';
import {
  createEstimate,
  getEstimates,
  createInvoice,
  getInvoices,
  deleteInvoice,
  sendEstimateEmail,
  sendInvoiceEmail
} from '../controllers/financeController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/estimates').get(protect as any, getEstimates as any).post(protect as any, createEstimate as any);
router.route('/estimates/:id/send').post(protect as any, sendEstimateEmail as any);
router.route('/invoices').get(protect as any, getInvoices as any).post(protect as any, createInvoice as any);
router.route('/invoices/:id').delete(protect as any, deleteInvoice as any);
router.route('/invoices/:id/send').post(protect as any, sendInvoiceEmail as any);

export default router;
