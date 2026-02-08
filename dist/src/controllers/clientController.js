"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteClient = exports.updateClient = exports.createClient = exports.getClientById = exports.getClients = void 0;
const Client_1 = __importDefault(require("../models/Client"));
const Vehicle_1 = __importDefault(require("../models/Vehicle"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const WorkOrder_1 = __importDefault(require("../models/WorkOrder"));
const getClients = async (req, res) => {
    const pageSize = Number(req.query.pageSize) || 20;
    const page = Number(req.query.pageNumber) || 1;
    const keyword = req.query.keyword
        ? {
            $or: [
                { firstName: { $regex: req.query.keyword, $options: 'i' } },
                { lastName: { $regex: req.query.keyword, $options: 'i' } },
                { email: { $regex: req.query.keyword, $options: 'i' } },
                { phone: { $regex: req.query.keyword, $options: 'i' } },
            ],
        }
        : {};
    const count = await Client_1.default.countDocuments({ ...keyword });
    const clients = await Client_1.default.find({ ...keyword })
        .limit(pageSize)
        .skip(pageSize * (page - 1));
    res.json({ clients, page, pages: Math.ceil(count / pageSize), totalCount: count });
};
exports.getClients = getClients;
const getClientById = async (req, res) => {
    const client = await Client_1.default.findById(req.params.id);
    if (client) {
        res.json(client);
    }
    else {
        res.status(404);
        throw new Error('Cliente no encontrado');
    }
};
exports.getClientById = getClientById;
const createClient = async (req, res) => {
    const { firstName, lastName, phone, email, notes } = req.body;
    const client = await Client_1.default.create({
        firstName,
        lastName,
        phone,
        email,
        notes,
    });
    res.status(201).json(client);
};
exports.createClient = createClient;
const updateClient = async (req, res) => {
    const { firstName, lastName, phone, email, notes } = req.body;
    const client = await Client_1.default.findById(req.params.id);
    if (client) {
        client.firstName = firstName !== undefined ? firstName : client.firstName;
        client.lastName = lastName !== undefined ? lastName : client.lastName;
        client.phone = phone !== undefined ? phone : client.phone;
        client.email = email !== undefined ? email : client.email;
        client.notes = notes !== undefined ? notes : client.notes;
        const updatedClient = await client.save();
        res.json(updatedClient);
    }
    else {
        res.status(404);
        throw new Error('Cliente no encontrado');
    }
};
exports.updateClient = updateClient;
const deleteClient = async (req, res) => {
    const client = await Client_1.default.findById(req.params.id);
    if (client) {
        const hasVehicles = await Vehicle_1.default.exists({ currentOwner: client._id });
        const hasAppointments = await Appointment_1.default.exists({ clientId: client._id });
        const hasWorkOrders = await WorkOrder_1.default.exists({ clientId: client._id });
        if (hasVehicles || hasAppointments || hasWorkOrders) {
            res.status(400);
            throw new Error('No se puede eliminar: el cliente tiene vehículos, turnos u órdenes asociadas');
        }
        await client.deleteOne();
        res.json({ message: 'Cliente eliminado' });
    }
    else {
        res.status(404);
        throw new Error('Cliente no encontrado');
    }
};
exports.deleteClient = deleteClient;
//# sourceMappingURL=clientController.js.map