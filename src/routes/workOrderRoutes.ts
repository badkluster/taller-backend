import express from 'express';
import {
  getWorkOrders,
  getWorkOrderById,
  updateWorkOrder,
  createWorkOrder,
  addEvidence
} from '../controllers/workOrderController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect as any, getWorkOrders as any)
  .post(protect as any, createWorkOrder as any);
router.route('/:id').get(protect as any, getWorkOrderById as any).patch(protect as any, updateWorkOrder as any);
router.route('/:id/evidence').post(protect as any, addEvidence as any);

export default router;
