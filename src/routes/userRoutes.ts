import express from 'express';
import { protect, admin } from '../middlewares/authMiddleware';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  changeMyPassword,
} from '../controllers/userController';

const router = express.Router();

router.patch('/me/password', protect as any, changeMyPassword as any);
router
  .route('/')
  .get(protect as any, admin as any, getUsers as any)
  .post(protect as any, admin as any, createUser as any);
router
  .route('/:id')
  .patch(protect as any, admin as any, updateUser as any)
  .delete(protect as any, admin as any, deleteUser as any);

export default router;
