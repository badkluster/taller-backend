import ReminderJob from '../models/ReminderJob';
import Appointment from '../models/Appointment';
import Client from '../models/Client';
import WorkOrder from '../models/WorkOrder';
import { sendEmail } from './mailer';
// import { sendWhatsApp, sendEmail } from '../utils/communications'; // TODO

const DEFAULT_TIME_SLOTS = [
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
];

const formatSlot = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const buildDateTime = (baseDate: Date, slot: string) => {
  const [hours, minutes] = slot.split(':').map((val) => Number(val));
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
    0,
    0,
  );
};

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

export const rescheduleOverdueAppointments = async () => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(startOfToday);
  targetDate.setDate(targetDate.getDate() + 1);

  const overdueAppointments = await Appointment.find({
    status: { $in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
    endAt: { $lt: startOfToday },
  });

  const targetStart = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    0,
    0,
    0,
    0,
  );
  const targetEnd = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    23,
    59,
    59,
    999,
  );

  const existingAppointments = await Appointment.find({
    startAt: { $gte: targetStart, $lte: targetEnd },
    status: { $nin: ['CANCELLED', 'NO_SHOW'] },
  }).select('startAt');

  const occupiedSlots = new Set(existingAppointments.map((appt) => formatSlot(appt.startAt)));
  const earliestExisting = existingAppointments
    .map((appt) => appt.startAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const results = { rescheduled: 0, noShow: 0, skipped: 0 };

  for (const appointment of overdueAppointments) {
    const workOrder = await WorkOrder.findOne({ appointmentId: appointment._id });
    const inactiveStatuses = new Set(['COMPLETADA', 'CANCELADA', 'CLOSED']);
    const hasActiveWorkOrder = !!workOrder && !inactiveStatuses.has(workOrder.status);

    if (!hasActiveWorkOrder) {
      appointment.status = 'NO_SHOW';
      appointment.cancelReason = appointment.cancelReason || 'No asistió';
      await appointment.save();
      results.noShow += 1;
      continue;
    }

    const durationMs =
      appointment.endAt && appointment.startAt
        ? appointment.endAt.getTime() - appointment.startAt.getTime()
        : 60 * 60 * 1000;

    let chosenSlot = DEFAULT_TIME_SLOTS.find((slot) => !occupiedSlots.has(slot));
    if (!chosenSlot) {
      chosenSlot = earliestExisting ? formatSlot(earliestExisting) : DEFAULT_TIME_SLOTS[0];
    } else {
      occupiedSlots.add(chosenSlot);
    }

    const newStart = buildDateTime(targetDate, chosenSlot);
    const newEnd = new Date(newStart.getTime() + Math.max(durationMs, 30 * 60 * 1000));

    appointment.startAt = newStart;
    appointment.endAt = newEnd;
    appointment.status = 'SCHEDULED';
    await appointment.save();

    results.rescheduled += 1;
  }

  return results;
};

export const processMaintenanceReminders = async () => {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const workOrders = await WorkOrder.find({
    maintenanceNotice: true,
    maintenanceDate: { $gte: startOfToday, $lte: endOfToday },
    $or: [
      { maintenanceLastNotifiedAt: { $exists: false } },
      { maintenanceLastNotifiedAt: { $lt: startOfToday } },
    ],
  })
    .populate('clientId')
    .populate('vehicleId');

  const results = { sent: 0, skipped: 0, failed: 0 };

  for (const wo of workOrders) {
    try {
      const client = wo.clientId as any;
      const vehicle = wo.vehicleId as any;
      const email = client?.email;
      if (!email) {
        results.skipped += 1;
        continue;
      }

      const vehicleLabel = [vehicle?.make, vehicle?.model, vehicle?.plateNormalized]
        .filter(Boolean)
        .join(' ');
      const dateLabel = wo.maintenanceDate
        ? new Date(wo.maintenanceDate).toLocaleDateString()
        : 'próximamente';

      const subject = `Aviso de mantenimiento${vehicleLabel ? ` - ${vehicleLabel}` : ''}`;
      const html = `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
          <h2 style="margin: 0 0 12px;">Aviso de mantenimiento</h2>
          <p>Hola ${client?.firstName || ''} ${client?.lastName || ''},</p>
          <p>Te recordamos el mantenimiento programado para el <strong>${dateLabel}</strong>.</p>
          ${vehicleLabel ? `<p><strong>Vehículo:</strong> ${vehicleLabel}</p>` : ''}
          ${wo.maintenanceDetail ? `<p><strong>Detalle:</strong> ${wo.maintenanceDetail}</p>` : ''}
          <p>Si querés reprogramar, escribinos y te ayudamos.</p>
        </div>
      `;

      await sendEmail({ to: email, subject, html });
      wo.maintenanceLastNotifiedAt = now;
      await wo.save();
      results.sent += 1;
    } catch (error) {
      results.failed += 1;
    }
  }

  return results;
};
