import express from 'express';
import {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  getVehicleByPlate,
  changeVehicleOwner,
  deleteVehicle,
} from '../controllers/vehicleController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/').get(protect as any, getVehicles as any).post(protect as any, createVehicle as any);
router.route('/plate/:plate').get(protect as any, getVehicleByPlate as any);
router.route('/:id')
  .get(protect as any, getVehicleById as any)
  .patch(protect as any, updateVehicle as any)
  .delete(protect as any, deleteVehicle as any);
router.route('/:id/change-owner').post(protect as any, changeVehicleOwner as any);

export default router;
