import express from 'express';
import { protect, admin } from '../middlewares/authMiddleware';
import {
  getCampaignTemplates,
  createCampaignTemplate,
  deleteCampaignTemplate,
} from '../controllers/campaignTemplateController';

const router = express.Router();

router.route('/').get(protect as any, admin as any, getCampaignTemplates as any).post(protect as any, admin as any, createCampaignTemplate as any);
router.route('/:id').delete(protect as any, admin as any, deleteCampaignTemplate as any);

export default router;
