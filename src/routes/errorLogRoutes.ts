import express from 'express';
import { protect, admin } from '../middlewares/authMiddleware';
import { getErrorLogs, deleteErrorLog } from '../controllers/errorLogController';

const router = express.Router();

const superUserOnly = (req: any, res: any, next: any) => {
  if (req.user?.userName === 'admin') return next();
  res.status(403);
  throw new Error('No autorizado');
};

router.route('/').get(protect as any, admin as any, superUserOnly as any, getErrorLogs as any);
router.route('/:id').delete(protect as any, admin as any, superUserOnly as any, deleteErrorLog as any);

export default router;
