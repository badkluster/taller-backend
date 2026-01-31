import express from 'express';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
} from '../controllers/clientController';
import { protect, admin } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/').get(protect as any, getClients as any).post(protect as any, createClient as any);
router.route('/:id')
  .get(protect as any, getClientById as any)
  .patch(protect as any, updateClient as any)
  .delete(protect as any, admin as any, deleteClient as any);

export default router;
