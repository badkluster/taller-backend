import assert from 'node:assert/strict';
import Appointment from '../models/Appointment';
import AppointmentRequest from '../models/AppointmentRequest';
import Client from '../models/Client';
import CronExecution from '../models/CronExecution';
import ReminderJob from '../models/ReminderJob';
import WorkOrder from '../models/WorkOrder';
import Settings from '../models/Settings';
import * as mailer from '../utils/mailer';
import {
  processMaintenanceReminders,
  processReminders,
  rescheduleOverdueAppointments,
  sendDayBeforeAppointmentReminders,
  sendMonthlyPrepaidReminders,
  sendOwnerDailySummary,
} from '../utils/cronProcessor';

type AnyDoc = Record<string, any>;

const makeDoc = (seed: AnyDoc): AnyDoc => ({
  ...seed,
  saveCalls: 0,
  async save() {
    this.saveCalls += 1;
    return this;
  },
});

const makeQuery = <T>(rows: T[]) => {
  const query: any = {
    populate() {
      return query;
    },
    select() {
      return Promise.resolve(rows);
    },
    sort() {
      return query;
    },
    limit() {
      return query;
    },
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve(rows).then(onFulfilled, onRejected);
    },
    catch(onRejected: any) {
      return Promise.resolve(rows).catch(onRejected);
    },
    finally(onFinally: any) {
      return Promise.resolve(rows).finally(onFinally);
    },
  };
  return query;
};

const AppointmentModel = Appointment as any;
const AppointmentRequestModel = AppointmentRequest as any;
const ClientModel = Client as any;
const CronExecutionModel = CronExecution as any;
const ReminderJobModel = ReminderJob as any;
const WorkOrderModel = WorkOrder as any;
const SettingsModel = Settings as any;
const MailerModule = mailer as any;

const originals = {
  appointmentFind: AppointmentModel.find,
  appointmentFindById: AppointmentModel.findById,
  appointmentRequestFind: AppointmentRequestModel.find,
  clientFind: ClientModel.find,
  cronExecutionCreate: CronExecutionModel.create,
  cronExecutionDeleteOne: CronExecutionModel.deleteOne,
  reminderJobFind: ReminderJobModel.find,
  workOrderFindOne: WorkOrderModel.findOne,
  workOrderFind: WorkOrderModel.find,
  settingsFindOne: SettingsModel.findOne,
  sendEmail: MailerModule.sendEmail,
};

const restoreOriginals = () => {
  AppointmentModel.find = originals.appointmentFind;
  AppointmentModel.findById = originals.appointmentFindById;
  AppointmentRequestModel.find = originals.appointmentRequestFind;
  ClientModel.find = originals.clientFind;
  CronExecutionModel.create = originals.cronExecutionCreate;
  CronExecutionModel.deleteOne = originals.cronExecutionDeleteOne;
  ReminderJobModel.find = originals.reminderJobFind;
  WorkOrderModel.findOne = originals.workOrderFindOne;
  WorkOrderModel.find = originals.workOrderFind;
  SettingsModel.findOne = originals.settingsFindOne;
  MailerModule.sendEmail = originals.sendEmail;
};

const runProcessRemindersScenario = async () => {
  const emailJob = makeDoc({
    _id: 'job-email',
    appointmentId: 'appt-email',
    status: 'PENDING',
    channel: 'EMAIL',
    tries: 0,
    lastError: undefined,
  });
  const noEmailJob = makeDoc({
    _id: 'job-no-email',
    appointmentId: 'appt-no-email',
    status: 'PENDING',
    channel: 'EMAIL',
    tries: 0,
    lastError: undefined,
  });
  const disabledChannelJob = makeDoc({
    _id: 'job-wa',
    appointmentId: 'appt-wa',
    status: 'PENDING',
    channel: 'WHATSAPP',
    tries: 0,
    lastError: undefined,
  });

  const appointmentById: Record<string, AnyDoc> = {
    'appt-email': makeDoc({
      _id: 'appt-email',
      status: 'SCHEDULED',
      startAt: new Date('2026-02-24T13:00:00.000Z'),
      clientId: { firstName: 'Julia', lastName: 'Ramos', email: 'julia@example.com' },
    }),
    'appt-no-email': makeDoc({
      _id: 'appt-no-email',
      status: 'SCHEDULED',
      startAt: new Date('2026-02-24T14:00:00.000Z'),
      clientId: { firstName: 'Sin', lastName: 'Email', email: '' },
    }),
    'appt-wa': makeDoc({
      _id: 'appt-wa',
      status: 'SCHEDULED',
      startAt: new Date('2026-02-24T15:00:00.000Z'),
      clientId: { firstName: 'Canal', lastName: 'Alterno', email: 'canal@example.com' },
    }),
  };

  const sentEmails: AnyDoc[] = [];

  ReminderJobModel.find = async () => [emailJob, noEmailJob, disabledChannelJob];
  AppointmentModel.findById = (id: string) => ({
    populate: async () => appointmentById[id] || null,
  });
  MailerModule.sendEmail = async (payload: AnyDoc) => {
    sentEmails.push(payload);
    return { messageId: `msg-${sentEmails.length}` };
  };

  const results = await processReminders();
  assert.equal(results.sent, 1);
  assert.equal(results.failed, 2);
  assert.equal(sentEmails.length, 1);
  assert.equal(emailJob.status, 'SENT');
  assert.equal(noEmailJob.status, 'FAILED');
  assert.equal(disabledChannelJob.status, 'FAILED');
  assert.equal(emailJob.tries, 1);
  assert.equal(noEmailJob.tries, 1);
  assert.equal(disabledChannelJob.tries, 1);
};

const runNoShowScenario = async () => {
  const overdueScheduled = makeDoc({
    _id: 'appt-scheduled',
    status: 'SCHEDULED',
    startAt: new Date('2025-01-01T09:00:00.000Z'),
    endAt: new Date('2025-01-01T10:00:00.000Z'),
    serviceType: 'PRESUPUESTO',
  });
  const overdueConfirmed = makeDoc({
    _id: 'appt-confirmed',
    status: 'CONFIRMED',
    startAt: new Date('2025-01-01T10:00:00.000Z'),
    endAt: new Date('2025-01-01T11:00:00.000Z'),
    serviceType: 'PRESUPUESTO',
  });
  const overdueInProgressWithoutWO = makeDoc({
    _id: 'appt-in-progress',
    status: 'IN_PROGRESS',
    startAt: new Date('2025-01-01T11:00:00.000Z'),
    endAt: new Date('2025-01-01T12:00:00.000Z'),
    serviceType: 'REPARACION',
  });

  const capturedQueries: any[] = [];
  AppointmentModel.find = (query: AnyDoc) => {
    capturedQueries.push(query);
    if (query?.endAt) {
      return makeQuery([overdueScheduled, overdueConfirmed, overdueInProgressWithoutWO]);
    }
    return makeQuery([]);
  };
  WorkOrderModel.findOne = async () => null;

  const results = await rescheduleOverdueAppointments();
  assert.equal(results.noShow, 3);
  assert.equal(results.rescheduled, 0);
  assert.equal(results.completedBudget, 0);
  assert.equal(results.skipped, 0);

  [overdueScheduled, overdueConfirmed, overdueInProgressWithoutWO].forEach((doc) => {
    assert.equal(doc.status, 'NO_SHOW');
    assert.equal(doc.saveCalls, 1);
  });

  const overdueStatuses = capturedQueries[0]?.status?.$in || [];
  assert.ok(overdueStatuses.includes('SCHEDULED'));
  assert.ok(overdueStatuses.includes('CONFIRMED'));
  assert.ok(overdueStatuses.includes('IN_PROGRESS'));
};

const runDayBeforeReminderScenario = async () => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const scheduled = makeDoc({
    _id: 'rem-scheduled',
    status: 'SCHEDULED',
    startAt: tomorrow,
    clientId: { firstName: 'Ana', lastName: 'Gomez', email: 'ana@example.com' },
    vehicleId: { make: 'Ford', model: 'Fiesta', plateNormalized: 'AB123CD' },
  });
  const confirmed = makeDoc({
    _id: 'rem-confirmed',
    status: 'CONFIRMED',
    startAt: tomorrow,
    clientId: { firstName: 'Luis', lastName: 'Perez', email: 'luis@example.com' },
    vehicleId: { make: 'VW', model: 'Gol', plateNormalized: 'AA111BB' },
  });
  const missingEmail = makeDoc({
    _id: 'rem-no-email',
    status: 'SCHEDULED',
    startAt: tomorrow,
    clientId: { firstName: 'No', lastName: 'Mail', email: '' },
    vehicleId: { make: 'Peugeot', model: '208', plateNormalized: 'AC222DD' },
  });

  const sentEmails: AnyDoc[] = [];
  let reminderQuery: AnyDoc = {};

  SettingsModel.findOne = async () => ({
    shopName: 'Taller Test',
    address: 'Calle Falsa 123',
    reminderRules: { h24: true },
  });
  AppointmentModel.find = (query: AnyDoc) => {
    reminderQuery = query;
    return makeQuery([scheduled, confirmed, missingEmail]);
  };
  MailerModule.sendEmail = async (payload: AnyDoc) => {
    sentEmails.push(payload);
    return { messageId: `msg-${sentEmails.length}` };
  };

  const results = await sendDayBeforeAppointmentReminders();
  assert.equal(results.sent, 2);
  assert.equal(results.skipped, 1);
  assert.equal(results.failed, 0);
  assert.ok(typeof results.targetDate === 'string' && results.targetDate.length > 0);

  assert.equal(scheduled.saveCalls, 1);
  assert.equal(confirmed.saveCalls, 1);
  assert.equal(missingEmail.saveCalls, 0);
  assert.equal(scheduled.dayBeforeReminderForDate, results.targetDate);
  assert.equal(confirmed.dayBeforeReminderForDate, results.targetDate);

  assert.equal(sentEmails.length, 2);
  assert.ok(String(sentEmails[0].text).includes('turno programado'));
  assert.ok(String(sentEmails[1].text).includes('turno programado'));

  const reminderStatuses = reminderQuery?.status?.$in || [];
  assert.ok(reminderStatuses.includes('SCHEDULED'));
  assert.ok(reminderStatuses.includes('CONFIRMED'));
};

const runOwnerDailySummaryScenario = async () => {
  const sentEmails: AnyDoc[] = [];
  let createdExecution = false;

  SettingsModel.findOne = async () => ({
    shopName: 'Taller Test',
    emailFrom: 'owner@example.com',
    address: 'Calle 1',
  });
  CronExecutionModel.create = async () => {
    createdExecution = true;
    return { _id: 'exec-1' };
  };
  CronExecutionModel.deleteOne = async () => ({ acknowledged: true, deletedCount: 1 });
  AppointmentModel.find = () =>
    makeQuery([
      makeDoc({
        _id: 'appt-1',
        status: 'SCHEDULED',
        startAt: new Date('2026-02-23T10:00:00.000Z'),
        clientId: { firstName: 'Ana', lastName: 'Lopez' },
        vehicleId: { make: 'Ford', model: 'Fiesta', plateNormalized: 'AA111AA' },
      }),
      makeDoc({
        _id: 'appt-2',
        status: 'IN_PROGRESS',
        startAt: new Date('2026-02-23T11:00:00.000Z'),
        clientId: { firstName: 'Luis', lastName: 'Diaz' },
        vehicleId: { make: 'VW', model: 'Gol', plateNormalized: 'BB222BB' },
      }),
      makeDoc({
        _id: 'appt-3',
        status: 'CONFIRMED',
        startAt: new Date('2026-02-23T12:00:00.000Z'),
        clientId: { firstName: 'Legacy', lastName: 'Status' },
        vehicleId: { make: 'Renault', model: 'Clio', plateNormalized: 'CC333CC' },
      }),
    ]);
  AppointmentRequestModel.find = () =>
    makeQuery([
      {
        clientName: 'Pendiente Uno',
        requestType: 'repair',
        vehicleData: { make: 'Peugeot', model: '208', plateNormalized: 'DD444DD' },
        suggestedDates: [new Date('2026-02-24T12:00:00.000Z')],
      },
    ]);
  MailerModule.sendEmail = async (payload: AnyDoc) => {
    sentEmails.push(payload);
    return { messageId: 'owner-summary' };
  };

  const result = await sendOwnerDailySummary();
  assert.equal(createdExecution, true);
  assert.equal(result.sent, true);
  assert.equal(result.appointments, 3);
  assert.equal(result.pendingRequests, 1);
  assert.equal(sentEmails.length, 1);
  assert.ok(String(sentEmails[0].text).includes('Programados: 2'));
  assert.ok(String(sentEmails[0].text).includes('En proceso: 1'));

  CronExecutionModel.create = async () => {
    const err: any = new Error('duplicate');
    err.code = 11000;
    throw err;
  };
  const duplicate = await sendOwnerDailySummary();
  assert.equal(duplicate.sent, false);
  assert.equal(duplicate.reason, 'ALREADY_SENT_FOR_DAY');
};

const runMonthlyPrepaidScenario = async () => {
  const now = new Date();
  const reminderDay = now.getDate();
  const clientOk = makeDoc({
    _id: 'client-ok',
    firstName: 'Cliente',
    lastName: 'Uno',
    email: 'cliente1@example.com',
    prepaidBalance: 25000,
    prepaidLastReminderMonth: '',
  });
  const clientFail = makeDoc({
    _id: 'client-fail',
    firstName: 'Cliente',
    lastName: 'Dos',
    email: 'cliente2@example.com',
    prepaidBalance: 10000,
    prepaidLastReminderMonth: '',
  });

  const sentEmails: AnyDoc[] = [];

  SettingsModel.findOne = async () => ({
    prepaidBalanceEnabled: true,
    prepaidReminderEnabled: true,
    prepaidReminderDay: reminderDay,
    prepaidReminderEmailSubject: 'Recordatorio {{nombre}}',
    prepaidReminderEmailBody: 'Hola {{nombre}}, saldo {{saldo}} en {{taller}}.',
    shopName: 'Taller Test',
    emailFrom: 'owner@example.com',
    phone: '111',
  });
  ClientModel.find = () => makeQuery([clientOk, clientFail]);
  MailerModule.sendEmail = async (payload: AnyDoc) => {
    if (payload.to === 'cliente2@example.com') {
      throw new Error('smtp error');
    }
    sentEmails.push(payload);
    return { messageId: 'prepaid-ok' };
  };

  const result = await sendMonthlyPrepaidReminders();
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 0);
  assert.equal(sentEmails.length, 1);
  assert.equal(clientOk.saveCalls, 1);
  assert.ok(clientOk.prepaidLastReminderMonth);
};

const runMaintenanceScenario = async () => {
  const maintenanceWithEmail = makeDoc({
    _id: 'wo-email',
    clientId: { firstName: 'Marta', lastName: 'Suarez', email: 'marta@example.com' },
    vehicleId: { make: 'Fiat', model: 'Uno', plateNormalized: 'EE555EE' },
    maintenanceDate: new Date(),
    maintenanceDetail: 'Cambio de aceite',
  });
  const maintenanceNoEmail = makeDoc({
    _id: 'wo-no-email',
    clientId: { firstName: 'Sin', lastName: 'Correo', email: '' },
    vehicleId: { make: 'Chevrolet', model: 'Onix', plateNormalized: 'FF666FF' },
    maintenanceDate: new Date(),
    maintenanceDetail: 'Revisión',
  });

  const sentEmails: AnyDoc[] = [];

  WorkOrderModel.find = () => makeQuery([maintenanceWithEmail, maintenanceNoEmail]);
  MailerModule.sendEmail = async (payload: AnyDoc) => {
    sentEmails.push(payload);
    return { messageId: 'maintenance-ok' };
  };

  const result = await processMaintenanceReminders();
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(sentEmails.length, 1);
  assert.equal(maintenanceWithEmail.saveCalls, 1);
  assert.equal(maintenanceNoEmail.saveCalls, 0);
};

const main = async () => {
  try {
    await runProcessRemindersScenario();
    await runNoShowScenario();
    await runDayBeforeReminderScenario();
    await runOwnerDailySummaryScenario();
    await runMonthlyPrepaidScenario();
    await runMaintenanceScenario();
    console.log('OK: cronProcessor integration checks passed');
  } finally {
    restoreOriginals();
  }
};

void main();
