import Agenda from 'agenda';
import { logger } from './logger';
import { processMaintenanceReminders } from './cronProcessor';

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
  const tz = process.env.AGENDA_TZ || 'America/Argentina/Buenos_Aires';

  await instance.every(cron, 'maintenance-reminders', {}, { timezone: tz, skipImmediate: true });
  logger.info({ cron, tz }, 'Agenda scheduled maintenance reminders');
};

export const stopAgenda = async () => {
  if (agenda) {
    await agenda.stop();
    agenda = null;
  }
};
