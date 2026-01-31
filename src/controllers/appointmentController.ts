import { Request, Response } from 'express';
import Appointment from '../models/Appointment';
import Vehicle from '../models/Vehicle';
import Client from '../models/Client';
import WorkOrder from '../models/WorkOrder';

// @desc    Get appointments (filtered by date range)
// @route   GET /api/appointments
// @access  Private
export const getAppointments = async (req: Request, res: Response) => {
  const { from, to, assignedTo } = req.query;

  const query: any = {};
  
  if (from && to) {
    query.startAt = { $gte: new Date(from as string), $lte: new Date(to as string) };
  }

  if (assignedTo) {
    query.assignedToUserId = assignedTo;
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

  res.status(201).json(appointment);
};

// @desc    Update appointment details or rescheduling
// @route   PATCH /api/appointments/:id
// @access  Private
export const updateAppointment = async (req: Request, res: Response) => {
  const appointment = await Appointment.findById(req.params.id);

  if (appointment) {
    appointment.startAt = req.body.startAt || appointment.startAt;
    appointment.endAt = req.body.endAt || appointment.endAt;
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
    appointment.status = 'CANCELLED';
    appointment.cancelReason = reason;
    await appointment.save();
    res.json({ message: 'Cita cancelada' });
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
    status: 'PRESUPUESTO',
    workDetailsText: appointment.notes, // Copy notes initially
    createdBy: req.user._id
  });

  // Update appointment status to confirm/in-progress
  appointment.status = 'IN_PROGRESS';
  await appointment.save();

  res.status(201).json(workOrder);
};
