import { Request, Response } from 'express';
import Appointment from '../models/Appointment';
import Vehicle from '../models/Vehicle';
import Client from '../models/Client';
import Settings from '../models/Settings';
import { sendEmail } from '../utils/mailer';
import {
  appointmentCancelledTemplate,
  appointmentClientNotificationTemplate,
} from '../utils/emailTemplates';
import WorkOrder from '../models/WorkOrder';
import { Estimate } from '../models/Finance';

const isCompletedAppointment = (status?: string) =>
  status === 'COMPLETED' || status === 'CLOSED';
const isRepairServiceType = (serviceType?: string) =>
  String(serviceType || '').trim().toUpperCase() === 'REPARACION';

const WORKSHOP_TIME_ZONE =
  process.env.WORKSHOP_TIME_ZONE || 'America/Argentina/Buenos_Aires';
const resolveFrontendBaseUrl = () =>
  String(process.env.FRONTEND_URL || process.env.APP_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
const buildPublicFrontendUrl = (path: string) => {
  const base = resolveFrontendBaseUrl();
  if (!base) return undefined;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

const getClientDisplayName = (client?: any) =>
  `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Cliente';

const getVehicleLabel = (vehicle?: any) => {
  const make = String(vehicle?.make || '').trim();
  const model = String(vehicle?.model || '').trim();
  const plate = String(vehicle?.plateNormalized || vehicle?.plateRaw || '').trim();
  const joined = [make, model].filter(Boolean).join(' ').trim();
  if (joined && plate) return `${joined} (${plate})`;
  if (joined) return joined;
  if (plate) return plate;
  return 'Vehículo';
};

const getServiceTypeLabel = (serviceType?: string) => {
  const normalized = String(serviceType || '').trim().toUpperCase();
  if (normalized === 'REPARACION') return 'Reparación';
  if (normalized === 'PRESUPUESTO') return 'Presupuesto';
  if (normalized === 'DIAGNOSTICO') return 'Diagnóstico';
  if (!normalized) return 'General';
  return normalized;
};

const sendAppointmentClientNotificationEmail = async (params: {
  appointment: any;
  mode: 'CREATED' | 'RESCHEDULED';
  settingsDoc?: any;
}) => {
  const [client, vehicle, settings] = await Promise.all([
    Client.findById(params.appointment.clientId),
    Vehicle.findById(params.appointment.vehicleId),
    params.settingsDoc ? Promise.resolve(params.settingsDoc) : Settings.findOne(),
  ]);

  if (!client?.email) return false;

  const template = appointmentClientNotificationTemplate({
    mode: params.mode,
    startAt: params.appointment.startAt,
    endAt: params.appointment.endAt,
    serviceType: getServiceTypeLabel(params.appointment.serviceType),
    notes: params.appointment.notes ?? undefined,
    clientName: getClientDisplayName(client),
    vehicleLabel: getVehicleLabel(vehicle),
    settings: {
      shopName: settings?.shopName,
      address: settings?.address ?? undefined,
      phone: settings?.phone ?? undefined,
      emailFrom: settings?.emailFrom ?? undefined,
      logoUrl: settings?.logoUrl ?? undefined,
    },
  });

  await sendEmail({
    to: client.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    bcc: settings?.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER,
  });

  return true;
};

const toWorkshopDayKey = (dateValue: Date | string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WORKSHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(dateValue));
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  return `${values.year || '1970'}-${values.month || '01'}-${values.day || '01'}`;
};

// @desc    Get appointments (filtered by date range)
// @route   GET /api/appointments
// @access  Private
export const getAppointments = async (req: Request, res: Response) => {
  const { from, to, assignedTo, vehicleId } = req.query;

  const query: any = {};
  const isEmployee = req.user?.role === 'employee';
  
  if (from && to) {
    query.startAt = { $gte: new Date(from as string), $lte: new Date(to as string) };
  }

  if (assignedTo) {
    query.assignedToUserId = assignedTo;
  }
  if (vehicleId) {
    query.vehicleId = vehicleId;
  }
  if (isEmployee) {
    query.status = { $in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] };
  }

  const appointments = await Appointment.find(query)
    .populate('vehicleId', 'plateNormalized make model color')
    .populate('clientId', 'firstName lastName phone')
    .populate('assignedToUserId', 'name');

  res.json(appointments);
};

// @desc    Create appointment
// @route   POST /api/appointments
// @access  Private
export const createAppointment = async (req: Request, res: Response) => {
  const { vehicleId, clientId, startAt, endAt, serviceType, notes, assignedToUserId } = req.body;

  // Potential overlap check here (deferred for now as per requirements asking for config but we can support simple one)
  
  if (!req.user) throw new Error('No autorizado');

  const startDate = new Date(startAt);
  const endDate = endAt ? new Date(endAt) : new Date(startAt);
  const now = new Date();
  if (startDate < now) {
    res.status(400);
    throw new Error('No se puede crear un turno en una fecha pasada');
  }
  if (endDate < startDate) {
    res.status(400);
    throw new Error('La fecha de fin no puede ser anterior al inicio');
  }

  const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999);
  const duplicateSameDay = await Appointment.exists({
    vehicleId,
    status: { $nin: ['CANCELLED', 'NO_SHOW'] },
    startAt: { $gte: dayStart, $lte: dayEnd },
  });
  if (duplicateSameDay) {
    res.status(400);
    throw new Error('Ya existe un turno para ese vehículo en ese día');
  }

  const settings = await Settings.findOne();
  if (settings?.unavailableRanges?.length) {
    const overlaps = settings.unavailableRanges.some((range: any) => {
      const rangeStart = new Date(range.startAt);
      const rangeEnd = new Date(range.endAt);
      if (
        (typeof range.endAt === 'string' && range.endAt.length === 10) ||
        (rangeEnd.getHours() === 0 && rangeEnd.getMinutes() === 0 && rangeEnd.getSeconds() === 0)
      ) {
        rangeEnd.setHours(23, 59, 59, 999);
      }
      return startDate <= rangeEnd && endDate >= rangeStart;
    });

    if (overlaps) {
      res.status(400);
      throw new Error('El taller no está disponible en esas fechas');
    }
  }

  const appointment = await Appointment.create({
    vehicleId,
    clientId,
    startAt,
    endAt,
    serviceType,
    notes,
    assignedToUserId,
    createdBy: req.user._id
  });

  try {
    await sendAppointmentClientNotificationEmail({
      appointment,
      mode: 'CREATED',
      settingsDoc: settings,
    });
  } catch (error) {
    // Email errors should not block appointment creation
    console.error('Error enviando email de turno:', error);
  }

  res.status(201).json(appointment);
};

// @desc    Update appointment details or rescheduling
// @route   PATCH /api/appointments/:id
// @access  Private
export const updateAppointment = async (req: Request, res: Response) => {
  const appointment = await Appointment.findById(req.params.id);

  if (appointment) {
    if (isCompletedAppointment(appointment.status)) {
      res.status(400);
      throw new Error('El turno ya está completado y no puede editarse');
    }

    const previousStartAtMs = appointment.startAt
      ? new Date(appointment.startAt).getTime()
      : null;
    const previousEndAtMs = appointment.endAt
      ? new Date(appointment.endAt).getTime()
      : null;

    let startAtChanged = false;
    let endAtChanged = false;

    if (req.body.startAt) {
      const startDate = new Date(req.body.startAt);
      const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999);
      const duplicateSameDay = await Appointment.exists({
        _id: { $ne: appointment._id },
        vehicleId: appointment.vehicleId,
        status: { $nin: ['CANCELLED', 'NO_SHOW'] },
        startAt: { $gte: dayStart, $lte: dayEnd },
      });
      if (duplicateSameDay) {
        res.status(400);
        throw new Error('Ya existe un turno para ese vehículo en ese día');
      }
    }

    if (req.body.startAt) {
      const startDate = new Date(req.body.startAt);
      if (startDate < new Date()) {
        res.status(400);
        throw new Error('No se puede reprogramar a una fecha pasada');
      }
      const previousStartIso = appointment.startAt
        ? new Date(appointment.startAt).toISOString()
        : '';
      const nextStartIso = startDate.toISOString();
      if (previousStartIso !== nextStartIso) {
        startAtChanged = true;
      }
      appointment.startAt = startDate;
    }

    if (req.body.endAt) {
      const endDate = new Date(req.body.endAt);
      if (endDate < new Date()) {
        res.status(400);
        throw new Error('La fecha de fin no puede ser pasada');
      }
      const previousEndIso = appointment.endAt
        ? new Date(appointment.endAt).toISOString()
        : '';
      const nextEndIso = endDate.toISOString();
      if (previousEndIso !== nextEndIso) {
        endAtChanged = true;
      }
      appointment.endAt = endDate;
    }

    if (appointment.endAt && appointment.startAt && appointment.endAt < appointment.startAt) {
      res.status(400);
      throw new Error('La fecha de fin no puede ser anterior al inicio');
    }

    // startAt/endAt already handled above when provided
    appointment.serviceType = req.body.serviceType || appointment.serviceType;
    appointment.notes = req.body.notes || appointment.notes;
    appointment.assignedToUserId = req.body.assignedToUserId || appointment.assignedToUserId;
    appointment.status = req.body.status || appointment.status;

    const updatedAppointment = await appointment.save();
    const currentStartAtMs = updatedAppointment.startAt
      ? new Date(updatedAppointment.startAt).getTime()
      : null;
    const currentEndAtMs = updatedAppointment.endAt
      ? new Date(updatedAppointment.endAt).getTime()
      : null;
    const wasRescheduled =
      startAtChanged ||
      endAtChanged ||
      (previousStartAtMs !== null &&
        currentStartAtMs !== null &&
        previousStartAtMs !== currentStartAtMs) ||
      (previousEndAtMs !== null &&
        currentEndAtMs !== null &&
        previousEndAtMs !== currentEndAtMs);

    if (wasRescheduled) {
      try {
        await sendAppointmentClientNotificationEmail({
          appointment: updatedAppointment,
          mode: 'RESCHEDULED',
        });
      } catch (error) {
        console.error('Error enviando email de reprogramación de turno:', error);
      }
    }

    res.json(updatedAppointment);
  } else {
    res.status(404);
    throw new Error('Cita no encontrada');
  }
};

// @desc    Cancel appointment
// @route   POST /api/appointments/:id/cancel
// @access  Private
export const cancelAppointment = async (req: Request, res: Response) => {
  const { reason } = req.body;
  const appointment = await Appointment.findById(req.params.id);

  if (appointment) {
    if (isCompletedAppointment(appointment.status)) {
      res.status(400);
      throw new Error('No se puede cancelar un turno completado');
    }

    appointment.status = 'CANCELLED';
    appointment.cancelReason = String(reason || '').trim() || undefined;
    await appointment.save();

    const requestUrl = buildPublicFrontendUrl('/solicitar-turno');
    let emailSent = false;

    try {
      const [client, vehicle, settings] = await Promise.all([
        Client.findById(appointment.clientId),
        Vehicle.findById(appointment.vehicleId),
        Settings.findOne(),
      ]);

      if (client?.email) {
        const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Cliente';
        const vehicleLabel = vehicle
          ? `${vehicle.make || ''} ${vehicle.model || ''} (${vehicle.plateNormalized || vehicle.plateRaw || '-'})`.trim()
          : 'Vehículo';
        const template = appointmentCancelledTemplate({
          clientName,
          vehicleLabel,
          scheduledAt: appointment.startAt,
          cancelReason: appointment.cancelReason || undefined,
          followUpText: requestUrl
            ? 'Podés solicitar un nuevo turno cuando te quede cómodo desde este enlace.'
            : 'Si querés, respondé este mensaje y coordinamos una nueva fecha.',
          requestUrl,
          requestUrlLabel: 'Solicitar nuevo turno',
          settings: {
            shopName: settings?.shopName,
            address: settings?.address ?? undefined,
            phone: settings?.phone ?? undefined,
            emailFrom: settings?.emailFrom ?? undefined,
            logoUrl: settings?.logoUrl ?? undefined,
          },
        });

        await sendEmail({
          to: client.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        emailSent = true;
      }
    } catch (error) {
      console.error('Error enviando email de cancelación de turno:', error);
    }

    res.json({
      message: 'Cita cancelada',
      notification: {
        emailSent,
        requestUrl,
      },
    });
  } else {
    res.status(404);
    throw new Error('Cita no encontrada');
  }
};

// @desc    Delete appointment
// @route   DELETE /api/appointments/:id
// @access  Private
export const deleteAppointment = async (req: Request, res: Response) => {
  const appointment = await Appointment.findById(req.params.id);

  if (appointment) {
    if (isCompletedAppointment(appointment.status)) {
      res.status(400);
      throw new Error('No se puede eliminar un turno completado');
    }

    await WorkOrder.deleteMany({ appointmentId: appointment._id });
    await appointment.deleteOne();
    res.json({ message: 'Cita eliminada' });
  } else {
    res.status(404);
    throw new Error('Cita no encontrada');
  }
};

// @desc    Convert to Work Order
// @route   POST /api/appointments/:id/convert-to-workorder
// @access  Private
export const convertToWorkOrder = async (req: Request, res: Response) => {
  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    res.status(404);
    throw new Error('Cita no encontrada');
  }

  if (isCompletedAppointment(appointment.status)) {
    res.status(400);
    throw new Error('Un turno completado no permite crear una nueva orden de trabajo');
  }

  if (appointment.startAt) {
    const appointmentDayKey = toWorkshopDayKey(appointment.startAt);
    const todayDayKey = toWorkshopDayKey(new Date());
    if (appointmentDayKey > todayDayKey) {
      res.status(400);
      throw new Error('No se puede crear una orden de trabajo antes de la fecha del turno');
    }
  }

  // Check if WO already exists for this appointment
  const existingWO = await WorkOrder.findOne({ appointmentId: appointment._id });
  if (existingWO) {
    res.status(400);
    throw new Error('Ya existe una Orden de Trabajo para esta cita');
  }

  if (!req.user) throw new Error('No autorizado');

  const isRepairAppointment = isRepairServiceType(appointment.serviceType);
  const initialStatus = isRepairAppointment ? 'EN_PROCESO' : 'PRESUPUESTO';

  const workOrder = await WorkOrder.create({
    appointmentId: appointment._id,
    vehicleId: appointment.vehicleId,
    clientId: appointment.clientId,
    category: isRepairAppointment ? 'REPARACION' : 'PRESUPUESTO',
    status: initialStatus,
    ...(isRepairAppointment ? { workStartedAt: new Date() } : {}),
    workDetailsText: appointment.notes, // Copy notes initially
    createdBy: req.user._id
  });

  // Update appointment status to confirm/in-progress
  appointment.status = 'IN_PROGRESS';
  await appointment.save();

  // Link estimate from same appointment first.
  // For direct repair appointments, fallback to the latest estimate of the same vehicle/client.
  let referenceEstimate =
    await Estimate.findOne({ appointmentId: appointment._id }).sort({
      createdAt: -1,
    });

  if (!referenceEstimate && isRepairAppointment) {
    referenceEstimate = await Estimate.findOne({
      vehicleId: appointment.vehicleId,
      clientId: appointment.clientId,
    }).sort({ createdAt: -1 });
  }

  if (referenceEstimate) {
    if (!referenceEstimate.workOrderId) {
      referenceEstimate.workOrderId = workOrder._id;
      await referenceEstimate.save();
    }

    let shouldSaveWorkOrder = false;
    if (referenceEstimate.pdfUrl && !workOrder.estimatePdfUrl) {
      workOrder.estimatePdfUrl = referenceEstimate.pdfUrl;
      shouldSaveWorkOrder = true;
    }
    if (referenceEstimate.number && !workOrder.estimateNumber) {
      workOrder.estimateNumber = referenceEstimate.number;
      shouldSaveWorkOrder = true;
    }
    if (isRepairAppointment) {
      if (referenceEstimate.pdfUrl && !workOrder.originalEstimatePdfUrl) {
        workOrder.originalEstimatePdfUrl = referenceEstimate.pdfUrl;
        shouldSaveWorkOrder = true;
      }
      if (referenceEstimate.number && !workOrder.originalEstimateNumber) {
        workOrder.originalEstimateNumber = referenceEstimate.number;
        shouldSaveWorkOrder = true;
      }
    }

    if (shouldSaveWorkOrder) {
      await workOrder.save();
    }
  }

  res.status(201).json(workOrder);
};
