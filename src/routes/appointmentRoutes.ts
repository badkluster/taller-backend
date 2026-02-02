import express from 'express';
import {
  getAppointments,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  convertToWorkOrder,
  deleteAppointment,
} from '../controllers/appointmentController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/').get(protect as any, getAppointments as any).post(protect as any, createAppointment as any);
router.route('/:id')
  .patch(protect as any, updateAppointment as any)
  .delete(protect as any, deleteAppointment as any);
router.route('/:id/cancel').post(protect as any, cancelAppointment as any);
router.route('/:id/convert-to-workorder').post(protect as any, convertToWorkOrder as any);

export default router;
