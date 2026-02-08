import Agenda from 'agenda';
import { logger } from './logger';
import {
  processMaintenanceReminders,
  processReminders,
  rescheduleOverdueAppointments,
  sendDayBeforeAppointmentReminders,
  sendOwnerDailySummary,
} from './cronProcessor';

let agenda: Agenda | null = null;

const getAgenda = () => {
  if (agenda) return agenda;

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI no está configurado para Agenda');
  }

  agenda = new Agenda({
    db: { address: mongoUri, collection: 'agendaJobs' },
  });

  agenda.define('maintenance-reminders', async () => {
    const results = await processMaintenanceReminders();
    logger.info({ results }, 'Maintenance reminders job completed');
  });

  agenda.define('reschedule-overdue-appointments', async () => {
    const results = await rescheduleOverdueAppointments();
    logger.info({ results }, 'Reschedule overdue appointments job completed');
  });

  agenda.define('owner-daily-summary', async () => {
    const results = await sendOwnerDailySummary();
    logger.info({ results }, 'Owner daily summary job completed');
  });

  agenda.define('appointment-reminders', async () => {
    const results = await processReminders();
    logger.info({ results }, 'Appointment reminders job completed');
  });

  agenda.define('day-before-appointment-reminders', async () => {
    const results = await sendDayBeforeAppointmentReminders();
    logger.info({ results }, 'Day-before appointment reminders job completed');
  });

  return agenda;
};

export const startAgenda = async () => {
  if (process.env.AGENDA_ENABLED === 'false') {
    logger.info('Agenda disabled by AGENDA_ENABLED=false');
    return;
  }

  const instance = getAgenda();
  await instance.start();

  const cron = process.env.AGENDA_MAINTENANCE_CRON || '0 9 * * *';
  const remindersCron = process.env.AGENDA_PROCESS_REMINDERS_CRON || '*/15 * * * *';
  const dayBeforeRemindersCron =
    process.env.AGENDA_DAY_BEFORE_REMINDERS_CRON || '0 22 * * *';
  const overdueCron = process.env.AGENDA_OVERDUE_CRON || '15 0 * * *';
  const ownerSummaryCron = process.env.AGENDA_OWNER_SUMMARY_CRON || '5 6 * * *';
  const tz = process.env.AGENDA_TZ || 'America/Argentina/Buenos_Aires';
  const runningOnVercel = process.env.VERCEL === '1';

  await instance.every(cron, 'maintenance-reminders', {}, { timezone: tz, skipImmediate: true });
  if (!runningOnVercel) {
    await instance.every(remindersCron, 'appointment-reminders', {}, { timezone: tz, skipImmediate: true });
    await instance.every(dayBeforeRemindersCron, 'day-before-appointment-reminders', {}, { timezone: tz, skipImmediate: true });
    await instance.every(overdueCron, 'reschedule-overdue-appointments', {}, { timezone: tz, skipImmediate: true });
    await instance.every(ownerSummaryCron, 'owner-daily-summary', {}, { timezone: tz, skipImmediate: true });
  }
  logger.info(
    { cron, remindersCron, dayBeforeRemindersCron, overdueCron, ownerSummaryCron, tz, runningOnVercel },
    'Agenda scheduled recurring jobs',
  );
};

export const stopAgenda = async () => {
  if (agenda) {
    await agenda.stop();
    agenda = null;
  }
};
