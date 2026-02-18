import ReminderJob from '../models/ReminderJob';
import Appointment from '../models/Appointment';
import WorkOrder from '../models/WorkOrder';
import AppointmentRequest from '../models/AppointmentRequest';
import Client from '../models/Client';
import Settings from '../models/Settings';
import { sendEmail } from './mailer';
import {
  prepaidPaymentInstructionsHtml,
  prepaidPaymentInstructionsText,
} from './emailTemplates';

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

const WORKSHOP_TIME_ZONE =
  process.env.WORKSHOP_TIME_ZONE || 'America/Argentina/Buenos_Aires';
const WORKSHOP_UTC_OFFSET = process.env.WORKSHOP_UTC_OFFSET || '-03:00';

const getWorkshopDateTimeParts = (dateValue: Date | string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WORKSHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(dateValue));

  const values: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });

  return {
    year: values.year || '1970',
    month: values.month || '01',
    day: values.day || '01',
    hour: values.hour || '00',
    minute: values.minute || '00',
  };
};

const toWorkshopDayKey = (dateValue: Date | string) => {
  const { year, month, day } = getWorkshopDateTimeParts(dateValue);
  return `${year}-${month}-${day}`;
};

const buildWorkshopDateTime = (dayKey: string, slot: string) =>
  new Date(`${dayKey}T${slot}:00${WORKSHOP_UTC_OFFSET}`);

const formatSlot = (date: Date) => {
  const { hour, minute } = getWorkshopDateTimeParts(date);
  return `${hour}:${minute}`;
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

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Programado',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Ausente',
};

const APPOINTMENT_STATUS_BADGE_STYLES: Record<string, string> = {
  SCHEDULED: 'background-color: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd;',
  CONFIRMED: 'background-color: #dcfce7; color: #166534; border: 1px solid #86efac;',
  IN_PROGRESS: 'background-color: #fef3c7; color: #92400e; border: 1px solid #fcd34d;',
  COMPLETED: 'background-color: #ccfbf1; color: #0f766e; border: 1px solid #99f6e4;',
  CANCELLED: 'background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;',
  NO_SHOW: 'background-color: #e5e7eb; color: #374151; border: 1px solid #d1d5db;',
};

const mapAppointmentStatusToLabel = (status: string) =>
  APPOINTMENT_STATUS_LABELS[status] || status;

const resolveAppointmentStatusBadgeStyle = (status: string) =>
  APPOINTMENT_STATUS_BADGE_STYLES[status] ||
  'background-color: #e2e8f0; color: #334155; border: 1px solid #cbd5e1;';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const toLocalMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const replaceTemplateTokens = (template: string, vars: Record<string, string>) => {
  return Object.entries(vars).reduce((acc, [key, value]) => {
    const token = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    return acc.replace(token, value);
  }, template);
};

const normalizeReminderDay = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > 28) return 5;
  return normalized;
};

export const rescheduleOverdueAppointments = async () => {
  const now = new Date();
  const todayWorkshopDayKey = toWorkshopDayKey(now);
  const startOfToday = new Date(`${todayWorkshopDayKey}T00:00:00.000${WORKSHOP_UTC_OFFSET}`);
  const targetDayKey = todayWorkshopDayKey;

  const overdueAppointments = await Appointment.find({
    status: { $in: ['CONFIRMED', 'IN_PROGRESS'] },
    endAt: { $lt: startOfToday },
  });

  const targetStart = new Date(`${targetDayKey}T00:00:00.000${WORKSHOP_UTC_OFFSET}`);
  const targetEnd = new Date(`${targetDayKey}T23:59:59.999${WORKSHOP_UTC_OFFSET}`);

  const existingAppointments = await Appointment.find({
    startAt: { $gte: targetStart, $lte: targetEnd },
    status: { $nin: ['CANCELLED', 'NO_SHOW'] },
  }).select('startAt');

  const occupiedSlots = new Set(existingAppointments.map((appt) => formatSlot(appt.startAt)));

  const results = { rescheduled: 0, noShow: 0, completedBudget: 0, skipped: 0 };

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

    const normalizedServiceType = String(appointment.serviceType || '').toUpperCase();
    const normalizedWorkOrderStatus = String(workOrder.status || '').toUpperCase();
    const isBudgetStageWorkOrder = ['PRESUPUESTO', 'OPEN'].includes(normalizedWorkOrderStatus);
    const isRepairAppointment = normalizedServiceType === 'REPARACION';

    // Budget appointments should close at end of day unless they became repair appointments.
    if (isBudgetStageWorkOrder && !isRepairAppointment) {
      appointment.status = 'COMPLETED';
      appointment.cancelReason = undefined;
      await appointment.save();
      results.completedBudget += 1;
      continue;
    }

    const durationMs =
      appointment.endAt && appointment.startAt
        ? appointment.endAt.getTime() - appointment.startAt.getTime()
        : 60 * 60 * 1000;

    const preferredSlot = appointment.startAt ? formatSlot(appointment.startAt) : null;
    const validPreferredSlot =
      preferredSlot && DEFAULT_TIME_SLOTS.includes(preferredSlot)
        ? preferredSlot
        : null;
    let chosenSlot =
      validPreferredSlot && !occupiedSlots.has(validPreferredSlot)
        ? validPreferredSlot
        : DEFAULT_TIME_SLOTS.find((slot) => !occupiedSlots.has(slot));
    if (!chosenSlot) {
      chosenSlot = DEFAULT_TIME_SLOTS[0];
    }
    occupiedSlots.add(chosenSlot);

    const newStart = buildWorkshopDateTime(targetDayKey, chosenSlot);
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

  const buildSummaryCard = (params: {
    label: string;
    value: number;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
  }) => `
    <td style="width: 25%; padding: 0;">
      <div style="padding: 12px 10px; border-radius: 12px; border: 1px solid ${params.borderColor}; background: ${params.backgroundColor}; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: ${params.textColor}; opacity: 0.9;">
          ${params.label}
        </div>
        <div style="font-size: 22px; font-weight: 800; color: ${params.textColor}; margin-top: 4px;">
          ${params.value}
        </div>
      </div>
    </td>
  `;

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
        hour12: true,
      });
      const statusLabel = mapAppointmentStatusToLabel(appointment.status);
      const statusStyle = resolveAppointmentStatusBadgeStyle(appointment.status);

      return `
        <li style="margin: 0 0 10px; padding: 0 0 10px; border-bottom: 1px solid #e2e8f0;">
          <div style="margin: 0 0 4px;">
            <span style="display: inline-block; min-width: 74px; font-weight: 700; color: #0f172a;">${escapeHtml(slot)}</span>
            <span style="color: #1e293b;">${escapeHtml(clientName)}${vehicleLabel ? ` (${escapeHtml(vehicleLabel)})` : ''}</span>
          </div>
          <span style="display: inline-block; border-radius: 999px; font-size: 12px; font-weight: 700; padding: 3px 10px; ${statusStyle}">
            ${escapeHtml(statusLabel)}
          </span>
        </li>
      `;
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

      return `
        <li style="margin: 0 0 10px; padding: 0 0 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">
          <strong>${escapeHtml(request.clientName)}</strong>${vehicleLabel ? ` - ${escapeHtml(vehicleLabel)}` : ''}
          <br />
          <span>${escapeHtml(mapRequestTypeToLabel(request.requestType))}</span>
          ${suggested ? `<span style="color: #475569;"> - Fechas sugeridas: ${escapeHtml(suggested)}</span>` : ''}
        </li>
      `;
    })
    .join('');

  const html = `
    <div style="margin: 0; padding: 22px 0; background: #eef2f7;">
      <div style="max-width: 720px; margin: 0 auto; padding: 0 12px;">
        <div style="background: #ffffff; border: 1px solid #dbe3ee; border-radius: 16px; overflow: hidden;">
          <div style="padding: 22px 24px; background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%); color: #ffffff;">
            <h2 style="margin: 0; font-size: 24px; line-height: 1.2;">Resumen diario del taller</h2>
            <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">${escapeHtml(dayLabel)}</p>
          </div>

          <div style="padding: 18px 20px 22px; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.5;">
            <table role="presentation" width="100%" style="border-collapse: separate; border-spacing: 8px; margin: 0 0 16px;">
              <tr>
                ${buildSummaryCard({
                  label: 'Turnos hoy',
                  value: appointments.length,
                  backgroundColor: '#e0f2fe',
                  borderColor: '#7dd3fc',
                  textColor: '#0c4a6e',
                })}
                ${buildSummaryCard({
                  label: 'Confirmados',
                  value: statusTotals.confirmed,
                  backgroundColor: '#dcfce7',
                  borderColor: '#86efac',
                  textColor: '#166534',
                })}
                ${buildSummaryCard({
                  label: 'En proceso',
                  value: statusTotals.inProgress,
                  backgroundColor: '#fef3c7',
                  borderColor: '#fcd34d',
                  textColor: '#92400e',
                })}
                ${buildSummaryCard({
                  label: 'Programados',
                  value: statusTotals.scheduled,
                  backgroundColor: '#dbeafe',
                  borderColor: '#93c5fd',
                  textColor: '#1d4ed8',
                })}
              </tr>
            </table>

            <h3 style="margin: 0 0 8px; font-size: 18px;">Agenda de hoy</h3>
            ${
              appointmentItems
                ? `<ul style="margin: 0; padding: 0 0 0 18px;">${appointmentItems}</ul>`
                : '<p style="margin: 0 0 16px; color: #475569;">Sin turnos para hoy.</p>'
            }

            <h3 style="margin: 16px 0 8px; font-size: 18px;">Solicitudes pendientes (${pendingRequests.length})</h3>
            ${
              pendingRequestItems
                ? `<ul style="margin: 0; padding: 0 0 0 18px;">${pendingRequestItems}</ul>`
                : '<p style="margin: 0; color: #475569;">No hay solicitudes pendientes.</p>'
            }
          </div>
        </div>
      </div>
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
        hour12: true,
      });
      const statusLabel = mapAppointmentStatusToLabel(appointment.status);
      return `- ${slot} ${clientName}${vehicleLabel ? ` (${vehicleLabel})` : ''} [${statusLabel}]`;
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

export const sendMonthlyPrepaidReminders = async () => {
  const settings = await Settings.findOne();
  if (!settings?.prepaidBalanceEnabled) {
    return {
      sent: 0,
      skipped: 0,
      failed: 0,
      reason: 'PREPAID_DISABLED',
    };
  }
  if (!settings?.prepaidReminderEnabled) {
    return {
      sent: 0,
      skipped: 0,
      failed: 0,
      reason: 'PREPAID_REMINDER_DISABLED',
    };
  }

  const now = new Date();
  const reminderDay = normalizeReminderDay(settings.prepaidReminderDay);
  const todayDay = now.getDate();
  const monthKey = toLocalMonthKey(now);
  if (todayDay !== reminderDay) {
    return {
      sent: 0,
      skipped: 0,
      failed: 0,
      reason: 'NOT_SCHEDULED_DAY',
      reminderDay,
      todayDay,
      monthKey,
    };
  }

  const clients = await Client.find({
    prepaidEligible: true,
    email: { $exists: true, $ne: '' },
    $or: [
      { prepaidLastReminderMonth: { $exists: false } },
      { prepaidLastReminderMonth: { $ne: monthKey } },
    ],
  }).select('firstName lastName email prepaidBalance prepaidLastReminderMonth');

  const results = {
    sent: 0,
    skipped: 0,
    failed: 0,
    monthKey,
    reminderDay,
  };

  const shopName = settings.shopName || 'Taller Suarez';
  const baseSubject =
    String(settings.prepaidReminderEmailSubject || '').trim() ||
    'Recordatorio amable: saldo a favor disponible';
  const baseBody =
    String(settings.prepaidReminderEmailBody || '').trim() ||
    'Hola {{nombre}}, te recordamos que tenés disponible nuestro beneficio de saldo a favor. Es totalmente opcional.';

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  for (const client of clients) {
    try {
      if (!client.email) {
        results.skipped += 1;
        continue;
      }
      const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Cliente';
      const vars = {
        nombre: clientName,
        saldo: formatCurrency(Number((client as any).prepaidBalance || 0)),
        taller: shopName,
      };
      const subject = replaceTemplateTokens(baseSubject, vars);
      const reminderBody = replaceTemplateTokens(baseBody, vars);
      const paymentInstructionsText = prepaidPaymentInstructionsText({
        phone: settings.phone ?? undefined,
        bankAlias: settings.bankAlias ?? undefined,
        bankName: settings.bankName ?? undefined,
        bankCbu: settings.bankCbu ?? undefined,
        bankHolderFirstName: settings.bankHolderFirstName ?? undefined,
        bankHolderLastName: settings.bankHolderLastName ?? undefined,
      });
      const paymentInstructionsHtml = prepaidPaymentInstructionsHtml({
        phone: settings.phone ?? undefined,
        bankAlias: settings.bankAlias ?? undefined,
        bankName: settings.bankName ?? undefined,
        bankCbu: settings.bankCbu ?? undefined,
        bankHolderFirstName: settings.bankHolderFirstName ?? undefined,
        bankHolderLastName: settings.bankHolderLastName ?? undefined,
      });
      const text = [reminderBody, paymentInstructionsText]
        .filter(Boolean)
        .join('\n\n');
      const safeReminderBody = escapeHtml(reminderBody).replace(/\n/g, '<br/>');
      const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height:1.5;">
          <div style="margin:0 0 14px;">${safeReminderBody}</div>
          <div style="padding:12px 14px; border-radius:10px; border:1px solid #dbeafe; background:#f8fafc;">
            ${paymentInstructionsHtml}
          </div>
        </div>
      `;
      await sendEmail({
        to: client.email,
        subject,
        text,
        html,
        bcc: settings.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER,
      });
      (client as any).prepaidLastReminderMonth = monthKey;
      await client.save();
      results.sent += 1;
    } catch {
      results.failed += 1;
    }
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
