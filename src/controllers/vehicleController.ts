import { Request, Response } from 'express';
import Vehicle from '../models/Vehicle';
import Client from '../models/Client';
import Appointment from '../models/Appointment';
import WorkOrder from '../models/WorkOrder';
import { normalizePlate } from '../utils/normalizePlate';

// @desc    Get all vehicles with pagination and search
// @route   GET /api/vehicles
// @access  Private
export const getVehicles = async (req: Request, res: Response) => {
  const pageSize = Number(req.query.pageSize) || 10;
  const page = Number(req.query.pageNumber) || 1;
  const clientId = req.query.clientId as string | undefined;
  const keyword = req.query.keyword
    ? {
        $or: [
          { plateNormalized: { $regex: normalizePlate(req.query.keyword as string), $options: 'i' } },
          { make: { $regex: req.query.keyword as string, $options: 'i' } },
          { model: { $regex: req.query.keyword as string, $options: 'i' } },
        ],
      }
    : {};

  const query: any = { ...keyword };
  if (clientId) query.currentOwner = clientId;

  const count = await Vehicle.countDocuments(query);
  const vehicles = await Vehicle.find(query)
    .populate('currentOwner', 'firstName lastName')
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ vehicles, page, pages: Math.ceil(count / pageSize), totalCount: count });
};

// @desc    Get vehicle by ID
// @route   GET /api/vehicles/:id
// @access  Private
export const getVehicleById = async (req: Request, res: Response) => {
  const vehicle = await Vehicle.findById(req.params.id)
    .populate('currentOwner')
    .populate('ownerHistory.clientId');

  if (vehicle) {
    res.json(vehicle);
  } else {
    res.status(404);
    throw new Error('Vehículo no encontrado');
  }
};

// @desc    Get vehicle by Plate
// @route   GET /api/vehicles/plate/:plate
// @access  Private
export const getVehicleByPlate = async (req: Request, res: Response) => {
  const plate = normalizePlate(req.params.plate as string);
  const vehicle = await Vehicle.findOne({ plateNormalized: plate })
    .populate('currentOwner')
    .populate('ownerHistory.clientId');

  if (vehicle) {
    res.json(vehicle);
  } else {
    res.status(404);
    throw new Error('Vehículo no encontrado');
  }
};

// @desc    Create a vehicle
// @route   POST /api/vehicles
// @access  Private
export const createVehicle = async (req: Request, res: Response) => {
  const { plateRaw, make, model, year, color, km, clientId, currentOwner } = req.body;
  const ownerId = clientId || currentOwner;

  const plateNormalized = normalizePlate(plateRaw);
  const vehicleExists = await Vehicle.findOne({ plateNormalized });

  if (vehicleExists) {
    res.status(400);
    throw new Error('Ya existe un vehículo con esta patente');
  }

  const vehicle = await Vehicle.create({
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

// @desc    Update a vehicle
// @route   PATCH /api/vehicles/:id
// @access  Private
export const updateVehicle = async (req: Request, res: Response) => {
  const { make, model, year, color, km, plateRaw } = req.body;

  const vehicle = await Vehicle.findById(req.params.id);

  if (vehicle) {
    if (make !== undefined) vehicle.make = make;
    if (model !== undefined) vehicle.model = model;
    if (year !== undefined) vehicle.year = year;
    if (color !== undefined) vehicle.color = color;
    if (km !== undefined) vehicle.km = km;
    if (plateRaw !== undefined && plateRaw !== '') {
      vehicle.plateRaw = plateRaw;
      vehicle.plateNormalized = normalizePlate(plateRaw as string);
    } // Creating a new plate is risky if conflict, but mongo index will catch it

    const updatedVehicle = await vehicle.save();
    res.json(updatedVehicle);
  } else {
    res.status(404);
    throw new Error('Vehículo no encontrado');
  }
};

// @desc    Change vehicle owner
// @route   POST /api/vehicles/:id/change-owner
// @access  Private
export const changeVehicleOwner = async (req: Request, res: Response) => {
  const { newClientId, note } = req.body;
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    res.status(404);
    throw new Error('Vehículo no encontrado');
  }

  // Close previous owner history
  if (vehicle.ownerHistory && vehicle.ownerHistory.length > 0) {
     const lastHistory = vehicle.ownerHistory[vehicle.ownerHistory.length - 1];
     lastHistory.toAt = new Date();
  }

  // Update current owner
  vehicle.currentOwner = newClientId;
  
  // Add new history
  vehicle.ownerHistory.push({
    clientId: newClientId,
    fromAt: new Date(),
    note
  });

  await vehicle.save();
  res.json(vehicle);
};

// @desc    Delete a vehicle
// @route   DELETE /api/vehicles/:id
// @access  Private
export const deleteVehicle = async (req: Request, res: Response) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (vehicle) {
    const hasAppointments = await Appointment.exists({ vehicleId: vehicle._id });
    const hasWorkOrders = await WorkOrder.exists({ vehicleId: vehicle._id });
    if (hasAppointments || hasWorkOrders) {
      res.status(400);
      throw new Error('No se puede eliminar: el vehículo tiene turnos u órdenes asociadas');
    }
    await vehicle.deleteOne();
    res.json({ message: 'Vehículo eliminado' });
  } else {
    res.status(404);
    throw new Error('Vehículo no encontrado');
  }
};
