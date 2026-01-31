import ReminderJob from '../models/ReminderJob';
import Appointment from '../models/Appointment';
import Client from '../models/Client';
// import { sendWhatsApp, sendEmail } from '../utils/communications'; // TODO

export const processReminders = async () => {
  const now = new Date();
  
  // Find pending jobs due now or in past
  const jobs = await ReminderJob.find({
    status: 'PENDING',
    runAt: { $lte: now }
  }).populate('appointmentId');

  const results = { sent: 0, failed: 0 };

  for (const job of jobs) {
    try {
      const appointment = await Appointment.findById(job.appointmentId).populate('clientId');
      if (!appointment || appointment.status === 'CANCELLED') {
        job.status = 'FAILED';
        job.lastError = 'Appointment invalid or cancelled';
        await job.save();
        results.failed++;
        continue;
      }

      // Mock Send
      // if (job.channel === 'EMAIL') await sendEmail(...)
      // if (job.channel === 'WHATSAPP') await sendWhatsApp(...)
      
      console.log(`Sending ${job.channel} reminder for Appointment ${appointment._id}`);

      job.status = 'SENT';
      await job.save();
      results.sent++;
    } catch (error: any) {
      job.status = 'FAILED';
      job.lastError = error.message;
      job.tries += 1;
      await job.save();
      results.failed++;
    }
  }

  return results;
};
