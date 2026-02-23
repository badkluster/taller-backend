import assert from 'node:assert/strict';
import Appointment from '../models/Appointment';
import WorkOrder from '../models/WorkOrder';
import Settings from '../models/Settings';
import * as mailer from '../utils/mailer';
import {
  rescheduleOverdueAppointments,
  sendDayBeforeAppointmentReminders,
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
const WorkOrderModel = WorkOrder as any;
const SettingsModel = Settings as any;
const MailerModule = mailer as any;

const originals = {
  appointmentFind: AppointmentModel.find,
  workOrderFindOne: WorkOrderModel.findOne,
  settingsFindOne: SettingsModel.findOne,
  sendEmail: MailerModule.sendEmail,
};

const restoreOriginals = () => {
  AppointmentModel.find = originals.appointmentFind;
  WorkOrderModel.findOne = originals.workOrderFindOne;
  SettingsModel.findOne = originals.settingsFindOne;
  MailerModule.sendEmail = originals.sendEmail;
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
  assert.ok(String(sentEmails[1].text).includes('turno confirmado'));

  const reminderStatuses = reminderQuery?.status?.$in || [];
  assert.ok(reminderStatuses.includes('SCHEDULED'));
  assert.ok(reminderStatuses.includes('CONFIRMED'));
};

const main = async () => {
  try {
    await runNoShowScenario();
    await runDayBeforeReminderScenario();
    console.log('OK: cronProcessor integration checks passed');
  } finally {
    restoreOriginals();
  }
};

void main();
