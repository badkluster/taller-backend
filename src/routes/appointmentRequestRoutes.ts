import express from 'express';
import {
  confirmAppointmentRequest,
  createAppointmentRequest,
  getPublicVehicleByPlate,
  getAppointmentRequests,
  rejectAppointmentRequest,
} from '../controllers/appointmentRequestController';
import { admin, protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/public/plate/:plate').get(getPublicVehicleByPlate as any);
router.route('/public').post(createAppointmentRequest as any);
router.route('/').get(protect as any, admin as any, getAppointmentRequests as any);
router.route('/:id/confirm').post(protect as any, admin as any, confirmAppointmentRequest as any);
router.route('/:id/reject').post(protect as any, admin as any, rejectAppointmentRequest as any);

export default router;
