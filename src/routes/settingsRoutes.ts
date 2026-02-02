import express from 'express';
import { getSettings, updateSettings, runMaintenanceReminders, getMaintenanceRemindersStatus } from '../controllers/settingsController';
import { protect, admin } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getSettings)
  .put(protect, admin, updateSettings);

router.route('/maintenance-reminders/run')
  .post(protect, admin, runMaintenanceReminders);

router.route('/maintenance-reminders/status')
  .get(protect, admin, getMaintenanceRemindersStatus);

// Public settings for landing page
router.route('/public')
  .get(getSettings);

export default router;
