"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopAgenda = exports.startAgenda = void 0;
const agenda_1 = __importDefault(require("agenda"));
const logger_1 = require("./logger");
const cronProcessor_1 = require("./cronProcessor");
let agenda = null;
const getAgenda = () => {
    if (agenda)
        return agenda;
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI no está configurado para Agenda');
    }
    agenda = new agenda_1.default({
        db: { address: mongoUri, collection: 'agendaJobs' },
    });
    agenda.define('maintenance-reminders', async () => {
        const results = await (0, cronProcessor_1.processMaintenanceReminders)();
        logger_1.logger.info({ results }, 'Maintenance reminders job completed');
    });
    agenda.define('reschedule-overdue-appointments', async () => {
        const results = await (0, cronProcessor_1.rescheduleOverdueAppointments)();
        logger_1.logger.info({ results }, 'Reschedule overdue appointments job completed');
    });
    agenda.define('owner-daily-summary', async () => {
        const results = await (0, cronProcessor_1.sendOwnerDailySummary)();
        logger_1.logger.info({ results }, 'Owner daily summary job completed');
    });
    return agenda;
};
const startAgenda = async () => {
    if (process.env.AGENDA_ENABLED === 'false') {
        logger_1.logger.info('Agenda disabled by AGENDA_ENABLED=false');
        return;
    }
    const instance = getAgenda();
    await instance.start();
    const cron = process.env.AGENDA_MAINTENANCE_CRON || '0 9 * * *';
    const overdueCron = process.env.AGENDA_OVERDUE_CRON || '15 0 * * *';
    const ownerSummaryCron = process.env.AGENDA_OWNER_SUMMARY_CRON || '0 7 * * *';
    const tz = process.env.AGENDA_TZ || 'America/Argentina/Buenos_Aires';
    await instance.every(cron, 'maintenance-reminders', {}, { timezone: tz, skipImmediate: true });
    await instance.every(overdueCron, 'reschedule-overdue-appointments', {}, { timezone: tz, skipImmediate: true });
    await instance.every(ownerSummaryCron, 'owner-daily-summary', {}, { timezone: tz, skipImmediate: true });
    logger_1.logger.info({ cron, overdueCron, ownerSummaryCron, tz }, 'Agenda scheduled recurring jobs');
};
exports.startAgenda = startAgenda;
const stopAgenda = async () => {
    if (agenda) {
        await agenda.stop();
        agenda = null;
    }
};
exports.stopAgenda = stopAgenda;
//# sourceMappingURL=agenda.js.map