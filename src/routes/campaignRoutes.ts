import express from 'express';
import { getCampaigns, createCampaign, sendCampaign, trackOpen } from '../controllers/campaignController';
import { protect, admin } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/').get(protect as any, admin as any, getCampaigns as any).post(protect as any, admin as any, createCampaign as any);
router.route('/:id/send').post(protect as any, admin as any, sendCampaign as any);
router.route('/track/open').get(trackOpen as any);

export default router;
