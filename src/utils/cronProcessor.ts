import ReminderJob from '../models/ReminderJob';
import Appointment from '../models/Appointment';
import WorkOrder from '../models/WorkOrder';
import AppointmentRequest from '../models/AppointmentRequest';
import Settings from '../models/Settings';
import { sendEmail } from './mailer';

const buildReminderMessage = (params: {
  clientName: string;
  appointmentDate: Date;
}) => {
  const dateLabel = params.appointmentDate.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeLabel = params.appointmentDate.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `Hola ${params.clientName}, te recordamos tu turno en Taller Suarez para el ${dateLabel} a las ${timeLabel}. Si necesitás reprogramar, respondé este mensaje.`;
};

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
  });

  const results = { sent: 0, failed: 0 };

  for (const job of jobs) {
    try {
      const appointment = await Appointment.findById(job.appointmentId).populate('clientId');
      if (!appointment) {
        throw new Error('Appointment no encontrado');
      }
      if (['CANCELLED', 'NO_SHOW'].includes(appointment.status)) {
        throw new Error('Appointment cancelado o marcado como no show');
      }

      const client = appointment.clientId as any;
      if (!client) {
        throw new Error('Cliente asociado no encontrado');
      }

      const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Cliente';
      const reminderMessage = buildReminderMessage({
        clientName,
        appointmentDate: new Date(appointment.startAt),
      });

      if (job.channel !== 'EMAIL') {
        job.status = 'FAILED';
        job.lastError = `Canal ${job.channel} deshabilitado temporalmente`;
        job.tries = (job.tries || 0) + 1;
        await job.save();
        results.failed++;
        continue;
      }

      if (!client.email) {
        throw new Error('El cliente no tiene email');
      }

      const dateLabel = new Date(appointment.startAt).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      await sendEmail({
        to: client.email,
        subject: 'Recordatorio de turno - Taller Suarez',
        text: reminderMessage,
        html: `
          <div style="font-family: Arial, sans-serif; color: #0f172a;">
            <h2 style="margin: 0 0 12px;">Recordatorio de turno</h2>
            <p>Hola ${clientName},</p>
            <p>Te recordamos tu turno para el <strong>${dateLabel}</strong>.</p>
            <p>Si necesitás reprogramar, respondé este correo.</p>
          </div>
        `,
      });

      job.status = 'SENT';
      job.lastError = undefined;
      job.tries = (job.tries || 0) + 1;
      await job.save();
      results.sent++;
    } catch (error: any) {
      job.status = 'FAILED';
      job.lastError = error?.message || 'Error desconocido';
      job.tries = (job.tries || 0) + 1;
      await job.save();
      results.failed++;
    }
  }

  return results;
};

const resolveOwnerNotificationEmail = (settings?: { emailFrom?: string | null }) =>
  process.env.OWNER_NOTIFICATION_EMAIL ||
  settings?.emailFrom ||
  process.env.EMAIL_FROM ||
  process.env.SMTP_USER;

const mapRequestTypeToLabel = (requestType: string) =>
  requestType === 'repair' ? 'Reparacion' : 'Diagnostico / Presupuesto';

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const rescheduleOverdueAppointments = async () => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(startOfToday);
  targetDate.setDate(targetDate.getDate() + 1);

  const overdueAppointments = await Appointment.find({
    status: { $in: ['CONFIRMED', 'IN_PROGRESS'] },
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
    if (appointment.status === 'CONFIRMED') {
      appointment.status = 'NO_SHOW';
      appointment.cancelReason = appointment.cancelReason || 'No visito el taller';
      await appointment.save();
      results.noShow += 1;
      continue;
    }

    if (appointment.status !== 'IN_PROGRESS') {
      results.skipped += 1;
      continue;
    }

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
    appointment.status = 'IN_PROGRESS';
    await appointment.save();

    results.rescheduled += 1;
  }

  return results;
};

export const sendDayBeforeAppointmentReminders = async () => {
  const now = new Date();
  const settings = await Settings.findOne();
  if (settings?.reminderRules?.h24 === false) {
    return {
      sent: 0,
      skipped: 0,
      failed: 0,
      targetDate: null,
      reason: 'H24_REMINDERS_DISABLED',
    };
  }

  const lookaheadDaysRaw = Number(process.env.APPOINTMENT_REMINDER_LOOKAHEAD_DAYS || 1);
  const lookaheadDays = Number.isFinite(lookaheadDaysRaw) && lookaheadDaysRaw > 0 ? lookaheadDaysRaw : 1;

  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  targetDate.setDate(targetDate.getDate() + lookaheadDays);
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
  const targetDateKey = toLocalDateKey(targetStart);

  const appointments = await Appointment.find({
    status: 'CONFIRMED',
    startAt: { $gte: targetStart, $lte: targetEnd },
    $or: [
      { dayBeforeReminderForDate: { $exists: false } },
      { dayBeforeReminderForDate: { $ne: targetDateKey } },
    ],
  })
    .populate('clientId', 'firstName lastName email')
    .populate('vehicleId', 'make model plateNormalized');

  const results = {
    sent: 0,
    skipped: 0,
    failed: 0,
    targetDate: targetDateKey,
  };

  const shopName = settings?.shopName || 'Taller Suarez';

  for (const appointment of appointments) {
    try {
      const client = appointment.clientId as any;
      const vehicle = appointment.vehicleId as any;
      const email = client?.email;
      if (!email) {
        results.skipped += 1;
        continue;
      }

      const clientName =
        `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Cliente';
      const vehicleLabel = [vehicle?.make, vehicle?.model, vehicle?.plateNormalized]
        .filter(Boolean)
        .join(' ');
      const dateLabel = new Date(appointment.startAt).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const timeLabel = new Date(appointment.startAt).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const subject = `Recordatorio de turno - ${shopName}`;
      const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <h2 style="margin: 0 0 12px;">Recordatorio de turno</h2>
          <p>Hola ${clientName},</p>
          <p>Te recordamos que mañana tenés un turno confirmado en <strong>${shopName}</strong>.</p>
          <p><strong>Fecha:</strong> ${dateLabel}</p>
          <p><strong>Hora:</strong> ${timeLabel}</p>
          ${vehicleLabel ? `<p><strong>Vehículo:</strong> ${vehicleLabel}</p>` : ''}
          ${settings?.address ? `<p><strong>Dirección:</strong> ${settings.address}</p>` : ''}
          <p>Si necesitás reprogramar, respondé este correo o comunicate con el taller.</p>
        </div>
      `;
      const text = [
        `Hola ${clientName},`,
        `Recordatorio: mañana tenés un turno confirmado en ${shopName}.`,
        `Fecha: ${dateLabel}`,
        `Hora: ${timeLabel}`,
        vehicleLabel ? `Vehículo: ${vehicleLabel}` : '',
        settings?.address ? `Dirección: ${settings.address}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await sendEmail({
        to: email,
        subject,
        html,
        text,
      });

      appointment.dayBeforeReminderSentAt = now;
      appointment.dayBeforeReminderForDate = targetDateKey;
      await appointment.save();
      results.sent += 1;
    } catch (error) {
      results.failed += 1;
    }
  }

  return results;
};

export const sendOwnerDailySummary = async () => {
  const settings = await Settings.findOne();
  const ownerEmail = resolveOwnerNotificationEmail(settings || undefined);

  if (!ownerEmail) {
    return {
      sent: false,
      reason: 'OWNER_EMAIL_NOT_CONFIGURED',
      appointments: 0,
      pendingRequests: 0,
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const [appointments, pendingRequests] = await Promise.all([
    Appointment.find({
      startAt: { $gte: startOfToday, $lte: endOfToday },
    })
      .populate('clientId', 'firstName lastName')
      .populate('vehicleId', 'make model plateNormalized')
      .sort({ startAt: 1 }),
    AppointmentRequest.find({ status: 'PENDING' }).sort({ createdAt: -1 }).limit(30),
  ]);

  const statusTotals = appointments.reduce(
    (acc, appointment) => {
      if (appointment.status === 'CONFIRMED') acc.confirmed += 1;
      if (appointment.status === 'IN_PROGRESS') acc.inProgress += 1;
      if (appointment.status === 'SCHEDULED') acc.scheduled += 1;
      return acc;
    },
    { confirmed: 0, inProgress: 0, scheduled: 0 },
  );

  const dayLabel = startOfToday.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const appointmentItems = appointments
    .map((appointment) => {
      const client = appointment.clientId as any;
      const vehicle = appointment.vehicleId as any;
      const clientName =
        `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Cliente';
      const vehicleLabel = [vehicle?.make, vehicle?.model, vehicle?.plateNormalized]
        .filter(Boolean)
        .join(' ');
      const slot = new Date(appointment.startAt).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `<li><strong>${slot}</strong> - ${clientName}${vehicleLabel ? ` (${vehicleLabel})` : ''} - ${appointment.status}</li>`;
    })
    .join('');

  const pendingRequestItems = pendingRequests
    .map((request) => {
      const vehicleLabel = [
        request.vehicleData?.make,
        request.vehicleData?.model,
        request.vehicleData?.plateNormalized,
      ]
        .filter(Boolean)
        .join(' ');
      const suggested = (request.suggestedDates || [])
        .slice(0, 3)
        .map((date: Date) => new Date(date).toLocaleDateString('es-AR'))
        .join(', ');

      return `<li><strong>${request.clientName}</strong>${vehicleLabel ? ` - ${vehicleLabel}` : ''} - ${mapRequestTypeToLabel(request.requestType)}${suggested ? ` - Sugiere: ${suggested}` : ''}</li>`;
    })
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h2 style="margin: 0 0 10px;">Resumen diario del taller</h2>
      <p style="margin: 0 0 16px;">${dayLabel}</p>
      <p style="margin: 0 0 12px;">
        Turnos de hoy: <strong>${appointments.length}</strong> |
        Confirmados: <strong>${statusTotals.confirmed}</strong> |
        En proceso: <strong>${statusTotals.inProgress}</strong> |
        Programados: <strong>${statusTotals.scheduled}</strong>
      </p>
      <h3 style="margin: 18px 0 8px;">Agenda de hoy</h3>
      ${appointmentItems ? `<ul style="margin: 0; padding-left: 18px;">${appointmentItems}</ul>` : '<p style="margin: 0;">Sin turnos para hoy.</p>'}
      <h3 style="margin: 18px 0 8px;">Solicitudes pendientes (${pendingRequests.length})</h3>
      ${pendingRequestItems ? `<ul style="margin: 0; padding-left: 18px;">${pendingRequestItems}</ul>` : '<p style="margin: 0;">No hay solicitudes pendientes.</p>'}
    </div>
  `;

  const textAppointments = appointments
    .map((appointment) => {
      const client = appointment.clientId as any;
      const vehicle = appointment.vehicleId as any;
      const clientName =
        `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Cliente';
      const vehicleLabel = [vehicle?.make, vehicle?.model, vehicle?.plateNormalized]
        .filter(Boolean)
        .join(' ');
      const slot = new Date(appointment.startAt).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `- ${slot} ${clientName}${vehicleLabel ? ` (${vehicleLabel})` : ''} [${appointment.status}]`;
    })
    .join('\n');

  const textPending = pendingRequests
    .map((request) => {
      const vehicleLabel = [
        request.vehicleData?.make,
        request.vehicleData?.model,
        request.vehicleData?.plateNormalized,
      ]
        .filter(Boolean)
        .join(' ');
      const suggested = (request.suggestedDates || [])
        .slice(0, 3)
        .map((date: Date) => new Date(date).toLocaleDateString('es-AR'))
        .join(', ');
      return `- ${request.clientName}${vehicleLabel ? ` (${vehicleLabel})` : ''} - ${mapRequestTypeToLabel(request.requestType)}${suggested ? ` - Sugiere: ${suggested}` : ''}`;
    })
    .join('\n');

  const text = [
    `Resumen diario - ${dayLabel}`,
    `Turnos de hoy: ${appointments.length}`,
    `Confirmados: ${statusTotals.confirmed} | En proceso: ${statusTotals.inProgress} | Programados: ${statusTotals.scheduled}`,
    '',
    'Agenda de hoy:',
    textAppointments || '- Sin turnos para hoy',
    '',
    `Solicitudes pendientes (${pendingRequests.length}):`,
    textPending || '- No hay solicitudes pendientes',
  ].join('\n');

  await sendEmail({
    to: ownerEmail,
    subject: `Resumen diario del taller - ${dayLabel}`,
    html,
    text,
  });

  return {
    sent: true,
    ownerEmail,
    appointments: appointments.length,
    pendingRequests: pendingRequests.length,
  };
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
