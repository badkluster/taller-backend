"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVehicle = exports.changeVehicleOwner = exports.updateVehicle = exports.createVehicle = exports.getVehicleByPlate = exports.getVehicleById = exports.getVehicles = void 0;
const Vehicle_1 = __importDefault(require("../models/Vehicle"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const WorkOrder_1 = __importDefault(require("../models/WorkOrder"));
const normalizePlate_1 = require("../utils/normalizePlate");
const getVehicles = async (req, res) => {
    const pageSize = Number(req.query.pageSize) || 10;
    const page = Number(req.query.pageNumber) || 1;
    const clientId = req.query.clientId;
    const keyword = req.query.keyword
        ? {
            $or: [
                { plateNormalized: { $regex: (0, normalizePlate_1.normalizePlate)(req.query.keyword), $options: 'i' } },
                { make: { $regex: req.query.keyword, $options: 'i' } },
                { model: { $regex: req.query.keyword, $options: 'i' } },
            ],
        }
        : {};
    const query = { ...keyword };
    if (clientId)
        query.currentOwner = clientId;
    const count = await Vehicle_1.default.countDocuments(query);
    const vehicles = await Vehicle_1.default.find(query)
        .populate('currentOwner', 'firstName lastName')
        .limit(pageSize)
        .skip(pageSize * (page - 1));
    res.json({ vehicles, page, pages: Math.ceil(count / pageSize), totalCount: count });
};
exports.getVehicles = getVehicles;
const getVehicleById = async (req, res) => {
    const vehicle = await Vehicle_1.default.findById(req.params.id)
        .populate('currentOwner')
        .populate('ownerHistory.clientId');
    if (vehicle) {
        res.json(vehicle);
    }
    else {
        res.status(404);
        throw new Error('Vehículo no encontrado');
    }
};
exports.getVehicleById = getVehicleById;
const getVehicleByPlate = async (req, res) => {
    const plate = (0, normalizePlate_1.normalizePlate)(req.params.plate);
    const vehicle = await Vehicle_1.default.findOne({ plateNormalized: plate })
        .populate('currentOwner')
        .populate('ownerHistory.clientId');
    if (vehicle) {
        res.json(vehicle);
    }
    else {
        res.status(404);
        throw new Error('Vehículo no encontrado');
    }
};
exports.getVehicleByPlate = getVehicleByPlate;
const createVehicle = async (req, res) => {
    const { plateRaw, make, model, year, color, km, clientId, currentOwner } = req.body;
    const ownerId = clientId || currentOwner;
    const plateNormalized = (0, normalizePlate_1.normalizePlate)(plateRaw);
    const vehicleExists = await Vehicle_1.default.findOne({ plateNormalized });
    if (vehicleExists) {
        res.status(400);
        throw new Error('Ya existe un vehículo con esta patente');
    }
    const vehicle = await Vehicle_1.default.create({
        plateRaw,
        plateNormalized,
        make,
        model,
        year,
        color,
        km,
        currentOwner: ownerId,
        ownerHistory: [{ clientId: ownerId, fromAt: new Date(), note: 'Initial Owner' }]
    });
    res.status(201).json(vehicle);
};
exports.createVehicle = createVehicle;
const updateVehicle = async (req, res) => {
    const { make, model, year, color, km, plateRaw } = req.body;
    const vehicle = await Vehicle_1.default.findById(req.params.id);
    if (vehicle) {
        if (make !== undefined)
            vehicle.make = make;
        if (model !== undefined)
            vehicle.model = model;
        if (year !== undefined)
            vehicle.year = year;
        if (color !== undefined)
            vehicle.color = color;
        if (km !== undefined)
            vehicle.km = km;
        if (plateRaw !== undefined && plateRaw !== '') {
            vehicle.plateRaw = plateRaw;
            vehicle.plateNormalized = (0, normalizePlate_1.normalizePlate)(plateRaw);
        }
        const updatedVehicle = await vehicle.save();
        res.json(updatedVehicle);
    }
    else {
        res.status(404);
        throw new Error('Vehículo no encontrado');
    }
};
exports.updateVehicle = updateVehicle;
const changeVehicleOwner = async (req, res) => {
    const { newClientId, note } = req.body;
    const vehicle = await Vehicle_1.default.findById(req.params.id);
    if (!vehicle) {
        res.status(404);
        throw new Error('Vehículo no encontrado');
    }
    if (vehicle.ownerHistory && vehicle.ownerHistory.length > 0) {
        const lastHistory = vehicle.ownerHistory[vehicle.ownerHistory.length - 1];
        lastHistory.toAt = new Date();
    }
    vehicle.currentOwner = newClientId;
    vehicle.ownerHistory.push({
        clientId: newClientId,
        fromAt: new Date(),
        note
    });
    await vehicle.save();
    res.json(vehicle);
};
exports.changeVehicleOwner = changeVehicleOwner;
const deleteVehicle = async (req, res) => {
    const vehicle = await Vehicle_1.default.findById(req.params.id);
    if (vehicle) {
        const hasAppointments = await Appointment_1.default.exists({ vehicleId: vehicle._id });
        const hasWorkOrders = await WorkOrder_1.default.exists({ vehicleId: vehicle._id });
        if (hasAppointments || hasWorkOrders) {
            res.status(400);
            throw new Error('No se puede eliminar: el vehículo tiene turnos u órdenes asociadas');
        }
        await vehicle.deleteOne();
        res.json({ message: 'Vehículo eliminado' });
    }
    else {
        res.status(404);
        throw new Error('Vehículo no encontrado');
    }
};
exports.deleteVehicle = deleteVehicle;
//# sourceMappingURL=vehicleController.js.map