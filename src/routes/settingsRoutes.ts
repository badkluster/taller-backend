import express from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController';
import { protect, admin } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getSettings)
  .put(protect, admin, updateSettings);

// Public settings for landing page
router.route('/public')
  .get(getSettings);

export default router;
