import express from 'express';
import { getCampaigns, createCampaign } from '../controllers/campaignController';
import { protect, admin } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/').get(protect as any, admin as any, getCampaigns as any).post(protect as any, admin as any, createCampaign as any);

export default router;
