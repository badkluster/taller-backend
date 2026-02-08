"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToWorkOrder = exports.deleteAppointment = exports.cancelAppointment = exports.updateAppointment = exports.createAppointment = exports.getAppointments = void 0;
const Appointment_1 = __importDefault(require("../models/Appointment"));
const Vehicle_1 = __importDefault(require("../models/Vehicle"));
const Client_1 = __importDefault(require("../models/Client"));
const Settings_1 = __importDefault(require("../models/Settings"));
const mailer_1 = require("../utils/mailer");
const emailTemplates_1 = require("../utils/emailTemplates");
const WorkOrder_1 = __importDefault(require("../models/WorkOrder"));
const Finance_1 = require("../models/Finance");
const getAppointments = async (req, res) => {
    const { from, to, assignedTo, vehicleId } = req.query;
    const query = {};
    if (from && to) {
        query.startAt = { $gte: new Date(from), $lte: new Date(to) };
    }
    if (assignedTo) {
        query.assignedToUserId = assignedTo;
    }
    if (vehicleId) {
        query.vehicleId = vehicleId;
    }
    const appointments = await Appointment_1.default.find(query)
        .populate('vehicleId', 'plateNormalized make model color')
        .populate('clientId', 'firstName lastName phone')
        .populate('assignedToUserId', 'name');
    res.json(appointments);
};
exports.getAppointments = getAppointments;
const createAppointment = async (req, res) => {
    const { vehicleId, clientId, startAt, endAt, serviceType, notes, assignedToUserId } = req.body;
    if (!req.user)
        throw new Error('No autorizado');
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
    const duplicateSameDay = await Appointment_1.default.exists({
        vehicleId,
        status: { $nin: ['CANCELLED', 'NO_SHOW'] },
        startAt: { $gte: dayStart, $lte: dayEnd },
    });
    if (duplicateSameDay) {
        res.status(400);
        throw new Error('Ya existe un turno para ese vehículo en ese día');
    }
    const settings = await Settings_1.default.findOne();
    if (settings?.unavailableRanges?.length) {
        const overlaps = settings.unavailableRanges.some((range) => {
            const rangeStart = new Date(range.startAt);
            const rangeEnd = new Date(range.endAt);
            if ((typeof range.endAt === 'string' && range.endAt.length === 10) ||
                (rangeEnd.getHours() === 0 && rangeEnd.getMinutes() === 0 && rangeEnd.getSeconds() === 0)) {
                rangeEnd.setHours(23, 59, 59, 999);
            }
            return startDate <= rangeEnd && endDate >= rangeStart;
        });
        if (overlaps) {
            res.status(400);
            throw new Error('El taller no está disponible en esas fechas');
        }
    }
    const appointment = await Appointment_1.default.create({
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
            Client_1.default.findById(clientId),
            Vehicle_1.default.findById(vehicleId),
        ]);
        const emailFrom = settings?.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER;
        if (emailFrom) {
            const template = (0, emailTemplates_1.appointmentCreatedTemplate)({
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
            await (0, mailer_1.sendEmail)({
                to: emailFrom,
                subject: template.subject,
                html: template.html,
                text: template.text,
            });
        }
    }
    catch (error) {
        console.error('Error enviando email de turno:', error);
    }
    res.status(201).json(appointment);
};
exports.createAppointment = createAppointment;
const updateAppointment = async (req, res) => {
    const appointment = await Appointment_1.default.findById(req.params.id);
    if (appointment) {
        if (req.body.startAt) {
            const startDate = new Date(req.body.startAt);
            const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
            const dayEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999);
            const duplicateSameDay = await Appointment_1.default.exists({
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
        appointment.serviceType = req.body.serviceType || appointment.serviceType;
        appointment.notes = req.body.notes || appointment.notes;
        appointment.assignedToUserId = req.body.assignedToUserId || appointment.assignedToUserId;
        appointment.status = req.body.status || appointment.status;
        const updatedAppointment = await appointment.save();
        res.json(updatedAppointment);
    }
    else {
        res.status(404);
        throw new Error('Cita no encontrada');
    }
};
exports.updateAppointment = updateAppointment;
const cancelAppointment = async (req, res) => {
    const { reason } = req.body;
    const appointment = await Appointment_1.default.findById(req.params.id);
    if (appointment) {
        appointment.status = 'CANCELLED';
        appointment.cancelReason = reason;
        await appointment.save();
        res.json({ message: 'Cita cancelada' });
    }
    else {
        res.status(404);
        throw new Error('Cita no encontrada');
    }
};
exports.cancelAppointment = cancelAppointment;
const deleteAppointment = async (req, res) => {
    const appointment = await Appointment_1.default.findById(req.params.id);
    if (appointment) {
        await WorkOrder_1.default.deleteMany({ appointmentId: appointment._id });
        await appointment.deleteOne();
        res.json({ message: 'Cita eliminada' });
    }
    else {
        res.status(404);
        throw new Error('Cita no encontrada');
    }
};
exports.deleteAppointment = deleteAppointment;
const convertToWorkOrder = async (req, res) => {
    const appointment = await Appointment_1.default.findById(req.params.id);
    if (!appointment) {
        res.status(404);
        throw new Error('Cita no encontrada');
    }
    const existingWO = await WorkOrder_1.default.findOne({ appointmentId: appointment._id });
    if (existingWO) {
        res.status(400);
        throw new Error('Ya existe una Orden de Trabajo para esta cita');
    }
    if (!req.user)
        throw new Error('No autorizado');
    const workOrder = await WorkOrder_1.default.create({
        appointmentId: appointment._id,
        vehicleId: appointment.vehicleId,
        clientId: appointment.clientId,
        category: appointment.serviceType === 'REPARACION' ? 'REPARACION' : 'PRESUPUESTO',
        status: 'PRESUPUESTO',
        workDetailsText: appointment.notes,
        createdBy: req.user._id
    });
    appointment.status = 'IN_PROGRESS';
    await appointment.save();
    const latestEstimate = await Finance_1.Estimate.findOne({ appointmentId: appointment._id }).sort({ createdAt: -1 });
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
exports.convertToWorkOrder = convertToWorkOrder;
//# sourceMappingURL=appointmentController.js.map