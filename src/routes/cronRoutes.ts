import express from 'express';
import { processMaintenanceReminders, processReminders, rescheduleOverdueAppointments } from '../utils/cronProcessor';

const router = express.Router();

// Protected by CRON_SECRET header
router.get('/process-reminders', async (req, res) => {
  const secret = req.headers['authorization'];
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) { 
    // Usually Vercel uses just 'Bearer <secret>' or custom header
    // Let's assume Bearer for consistency
     res.status(401).json({ message: 'Unauthorized' });
     return;
  }

  try {
    const results = await processReminders();
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/reschedule-overdue-appointments', async (req, res) => {
  const secret = req.headers['authorization'];
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const results = await rescheduleOverdueAppointments();
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/maintenance-reminders', async (req, res) => {
  const secret = req.headers['authorization'];
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const results = await processMaintenanceReminders();
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
