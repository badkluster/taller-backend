import express from 'express';
import { getDashboardSummary, getDashboardTimeSeries } from '../controllers/dashboardController';
import { protect, admin } from '../middlewares/authMiddleware';

const router = express.Router();

router.get('/summary', protect as any, admin as any, getDashboardSummary as any);
router.get('/timeseries', protect as any, admin as any, getDashboardTimeSeries as any);

export default router;
