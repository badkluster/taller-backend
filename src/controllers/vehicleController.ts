import { Request, Response } from 'express';
import Vehicle from '../models/Vehicle';
import Appointment from '../models/Appointment';
import WorkOrder from '../models/WorkOrder';
import { normalizePlate } from '../utils/normalizePlate';

const isMongoDuplicateKeyError = (error: any) =>
  !!error && error.name === 'MongoServerError' && error.code === 11000;

// @desc    Get all vehicles with pagination and search
// @route   GET /api/vehicles
// @access  Private
export const getVehicles = async (req: Request, res: Response) => {
  const DEFAULT_PAGE_SIZE = 10;
  const MIN_PAGE_SIZE = 10;

  const requestedPageSize = Number(req.query.pageSize);
  const requestedPage = Number(req.query.pageNumber);

  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.max(MIN_PAGE_SIZE, Math.floor(requestedPageSize))
    : DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
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
  if (!plateNormalized) {
    res.status(400);
    throw new Error('La patente es obligatoria');
  }

  const vehicleExists = await Vehicle.findOne({ plateNormalized });

  if (vehicleExists) {
    res.status(409);
    throw new Error('Ya existe un vehículo con esta patente');
  }

  try {
    const vehicle = await Vehicle.create({
      plateRaw,
      plateNormalized,
      make,
      model,
      year,
      color,
      km,
      currentOwner: ownerId,
      ownerHistory: [{ clientId: ownerId, fromAt: new Date(), note: 'Initial Owner' }],
    });

    res.status(201).json(vehicle);
  } catch (error: any) {
    if (isMongoDuplicateKeyError(error)) {
      res.status(409);
      throw new Error('Ya existe un vehículo con esta patente');
    }
    throw error;
  }
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
      const nextPlateNormalized = normalizePlate(plateRaw as string);
      if (!nextPlateNormalized) {
        res.status(400);
        throw new Error('La patente es obligatoria');
      }

      const duplicatedVehicle = await Vehicle.findOne({
        plateNormalized: nextPlateNormalized,
        _id: { $ne: vehicle._id },
      });

      if (duplicatedVehicle) {
        res.status(409);
        throw new Error('Ya existe un vehículo con esta patente');
      }

      vehicle.plateRaw = plateRaw;
      vehicle.plateNormalized = nextPlateNormalized;
    }

    try {
      const updatedVehicle = await vehicle.save();
      res.json(updatedVehicle);
    } catch (error: any) {
      if (isMongoDuplicateKeyError(error)) {
        res.status(409);
        throw new Error('Ya existe un vehículo con esta patente');
      }
      throw error;
    }
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
