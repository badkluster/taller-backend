import express from 'express';
import {
  createEstimate,
  getEstimates,
  createInvoice,
  getInvoices,
  deleteInvoice,
  sendEstimateEmail,
  markEstimateSentByChannel,
  sendInvoiceEmail,
  updateClientPrepaidConfig,
  getClientPrepaidSummary,
  getClientPrepaidMovements,
  sendClientPrepaidOffer,
  sendClientPrepaidSummary,
  createClientPrepaidDeposit,
} from '../controllers/financeController';
import { admin, protect } from '../middlewares/authMiddleware';

const router = express.Router();

router
  .route('/estimates')
  .get(protect as any, admin as any, getEstimates as any)
  .post(protect as any, admin as any, createEstimate as any);
router.route('/estimates/:id/send').post(protect as any, admin as any, sendEstimateEmail as any);
router.route('/estimates/:id/mark-sent').post(protect as any, admin as any, markEstimateSentByChannel as any);
router
  .route('/invoices')
  .get(protect as any, admin as any, getInvoices as any)
  .post(protect as any, admin as any, createInvoice as any);
router.route('/invoices/:id').delete(protect as any, admin as any, deleteInvoice as any);
router.route('/invoices/:id/send').post(protect as any, admin as any, sendInvoiceEmail as any);
router.route('/prepaid/clients/:clientId/config').patch(protect as any, admin as any, updateClientPrepaidConfig as any);
router.route('/prepaid/clients/:clientId/summary').get(protect as any, admin as any, getClientPrepaidSummary as any);
router.route('/prepaid/clients/:clientId/movements').get(protect as any, admin as any, getClientPrepaidMovements as any);
router.route('/prepaid/clients/:clientId/send-offer').post(protect as any, admin as any, sendClientPrepaidOffer as any);
router.route('/prepaid/clients/:clientId/send-summary').post(protect as any, admin as any, sendClientPrepaidSummary as any);
router.route('/prepaid/clients/:clientId/deposit').post(protect as any, admin as any, createClientPrepaidDeposit as any);

export default router;
