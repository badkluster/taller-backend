import { Request, Response } from 'express';
import Appointment from '../models/Appointment';
import Vehicle from '../models/Vehicle';
import Client from '../models/Client';
import Settings from '../models/Settings';
import { sendEmail } from '../utils/mailer';
import { appointmentCreatedTemplate } from '../utils/emailTemplates';
import WorkOrder from '../models/WorkOrder';
import { Estimate } from '../models/Finance';

const isCompletedAppointment = (status?: string) =>
  status === 'COMPLETED' || status === 'CLOSED';

// @desc    Get appointments (filtered by date range)
// @route   GET /api/appointments
// @access  Private
export const getAppointments = async (req: Request, res: Response) => {
  const { from, to, assignedTo, vehicleId } = req.query;

  const query: any = {};
  
  if (from && to) {
    query.startAt = { $gte: new Date(from as string), $lte: new Date(to as string) };
  }

  if (assignedTo) {
    query.assignedToUserId = assignedTo;
  }
  if (vehicleId) {
    query.vehicleId = vehicleId;
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
    const [client, vehicle] = await Promise.all([
      Client.findById(clientId),
      Vehicle.findById(vehicleId),
    ]);

    const emailFrom = settings?.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER;
    if (emailFrom) {
      const template = appointmentCreatedTemplate({
        appointmentId: appointment._id.toString(),
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        serviceType: appointment.serviceType,
        notes: appointment.notes ?? undefined,
        clientName: client ? `${client.firstName} ${client.lastName}` : 'Cliente',
        clientPhone: client?.phone,
        clientEmail: client?.email ?? undefined,
        vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNormalized})` : 'Vehículo',
        settings: {
          shopName: settings?.shopName,
          address: settings?.address ?? undefined,
          phone: settings?.phone ?? undefined,
          emailFrom: settings?.emailFrom ?? undefined,
          logoUrl: settings?.logoUrl ?? undefined,
        },
      });

      await sendEmail({
        to: emailFrom,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
    }
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
      appointment.startAt = req.body.startAt;
    }

    if (req.body.endAt) {
      const endDate = new Date(req.body.endAt);
      if (endDate < new Date()) {
        res.status(400);
        throw new Error('La fecha de fin no puede ser pasada');
      }
      appointment.endAt = req.body.endAt;
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
    appointment.cancelReason = reason;
    await appointment.save();
    res.json({ message: 'Cita cancelada' });
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

  // Check if WO already exists for this appointment
  const existingWO = await WorkOrder.findOne({ appointmentId: appointment._id });
  if (existingWO) {
    res.status(400);
    throw new Error('Ya existe una Orden de Trabajo para esta cita');
  }

  if (!req.user) throw new Error('No autorizado');

  const workOrder = await WorkOrder.create({
    appointmentId: appointment._id,
    vehicleId: appointment.vehicleId,
    clientId: appointment.clientId,
    category: appointment.serviceType === 'REPARACION' ? 'REPARACION' : 'PRESUPUESTO',
    status: 'PRESUPUESTO',
    workDetailsText: appointment.notes, // Copy notes initially
    createdBy: req.user._id
  });

  // Update appointment status to confirm/in-progress
  appointment.status = 'IN_PROGRESS';
  await appointment.save();

  // Link latest estimate from this appointment (if any) to the new work order
  const latestEstimate = await Estimate.findOne({ appointmentId: appointment._id }).sort({ createdAt: -1 });
  if (latestEstimate) {
    if (!latestEstimate.workOrderId) {
      latestEstimate.workOrderId = workOrder._id;
      await latestEstimate.save();
    }
    if (!workOrder.estimatePdfUrl && latestEstimate.pdfUrl) {
      workOrder.estimatePdfUrl = latestEstimate.pdfUrl;
      workOrder.estimateNumber = latestEstimate.number;
      await workOrder.save();
    }
  }

  res.status(201).json(workOrder);
};
