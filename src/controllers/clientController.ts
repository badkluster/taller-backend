import { Request, Response } from 'express';
import Client from '../models/Client';
import Vehicle from '../models/Vehicle';
import Appointment from '../models/Appointment';
import WorkOrder from '../models/WorkOrder';
import {
  buildClientIdentityFilter,
  normalizeClientEmail,
  normalizeClientPhone,
} from '../utils/clientIdentity';

const getDuplicateClientMessage = (existingClient: any, phone: string, email?: string) => {
  const duplicatedByPhone = !!phone && existingClient?.phone === phone;
  const duplicatedByEmail = !!email && existingClient?.email === email;

  if (duplicatedByPhone && duplicatedByEmail) {
    return 'Ya existe un cliente con este teléfono y email';
  }
  if (duplicatedByPhone) {
    return 'Ya existe un cliente con este teléfono';
  }
  if (duplicatedByEmail) {
    return 'Ya existe un cliente con este email';
  }
  return 'Ya existe un cliente con estos datos';
};

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private
export const getClients = async (req: Request, res: Response) => {
  const DEFAULT_PAGE_SIZE = 20;
  const MIN_PAGE_SIZE = 10;

  const requestedPageSize = Number(req.query.pageSize);
  const requestedPage = Number(req.query.pageNumber);

  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.max(MIN_PAGE_SIZE, Math.floor(requestedPageSize))
    : DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
  const keyword = req.query.keyword
    ? {
        $or: [
          { firstName: { $regex: req.query.keyword as string, $options: 'i' } },
          { lastName: { $regex: req.query.keyword as string, $options: 'i' } },
          { email: { $regex: req.query.keyword as string, $options: 'i' } },
          { phone: { $regex: req.query.keyword as string, $options: 'i' } },
        ],
      }
    : {};

  const count = await Client.countDocuments({ ...keyword });
  const clients = await Client.find({ ...keyword })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ clients, page, pages: Math.ceil(count / pageSize), totalCount: count });
};

// @desc    Get client by ID
// @route   GET /api/clients/:id
// @access  Private
export const getClientById = async (req: Request, res: Response) => {
  const client = await Client.findById(req.params.id);
  if (client) {
    res.json(client);
  } else {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }
};

// @desc    Create a client
// @route   POST /api/clients
// @access  Private
export const createClient = async (req: Request, res: Response) => {
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const phone = normalizeClientPhone(req.body.phone);
  const email = normalizeClientEmail(req.body.email);
  const notes = req.body.notes !== undefined ? String(req.body.notes || '').trim() : undefined;

  if (!firstName || !lastName || !phone) {
    res.status(400);
    throw new Error('Nombre, apellido y teléfono son obligatorios');
  }

  const duplicateFilter = buildClientIdentityFilter({ phone, email });
  const existingClient = duplicateFilter
    ? await Client.findOne(duplicateFilter)
    : null;

  if (existingClient) {
    let changed = false;

    if (!existingClient.email && email) {
      existingClient.email = email;
      changed = true;
    }
    if (!existingClient.firstName && firstName) {
      existingClient.firstName = firstName;
      changed = true;
    }
    if (!existingClient.lastName && lastName) {
      existingClient.lastName = lastName;
      changed = true;
    }
    if (!existingClient.notes && notes) {
      existingClient.notes = notes;
      changed = true;
    }
    if (changed) {
      await existingClient.save();
    }

    res.status(200).json({
      client: existingClient,
      created: false,
      message: getDuplicateClientMessage(existingClient, phone, email),
    });
    return;
  }

  const client = await Client.create({ firstName, lastName, phone, email, notes });

  res.status(201).json({ client, created: true });
};

// @desc    Update a client
// @route   PATCH /api/clients/:id
// @access  Private
export const updateClient = async (req: Request, res: Response) => {
  const client = await Client.findById(req.params.id);

  if (client) {
    const nextFirstName =
      req.body.firstName !== undefined
        ? String(req.body.firstName || '').trim()
        : String(client.firstName || '').trim();
    const nextLastName =
      req.body.lastName !== undefined
        ? String(req.body.lastName || '').trim()
        : String(client.lastName || '').trim();
    const nextPhone =
      req.body.phone !== undefined
        ? normalizeClientPhone(req.body.phone)
        : normalizeClientPhone(client.phone);
    const nextEmail =
      req.body.email !== undefined
        ? normalizeClientEmail(req.body.email)
        : normalizeClientEmail(client.email);
    const nextNotes =
      req.body.notes !== undefined
        ? String(req.body.notes || '').trim()
        : client.notes;

    if (!nextFirstName || !nextLastName || !nextPhone) {
      res.status(400);
      throw new Error('Nombre, apellido y teléfono son obligatorios');
    }

    const duplicateFilter = buildClientIdentityFilter({
      phone: nextPhone,
      email: nextEmail,
      excludeId: req.params.id,
    });
    const duplicatedClient = duplicateFilter
      ? await Client.findOne(duplicateFilter)
      : null;

    if (duplicatedClient) {
      res.status(409);
      throw new Error(getDuplicateClientMessage(duplicatedClient, nextPhone, nextEmail));
    }

    client.firstName = nextFirstName;
    client.lastName = nextLastName;
    client.phone = nextPhone;
    client.email = nextEmail;
    client.notes = nextNotes;

    const updatedClient = await client.save();
    res.json(updatedClient);
  } else {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }
};

// @desc    Delete a client
// @route   DELETE /api/clients/:id
// @access  Private/Admin
export const deleteClient = async (req: Request, res: Response) => {
  const client = await Client.findById(req.params.id);

  if (client) {
    const hasVehicles = await Vehicle.exists({ currentOwner: client._id });
    const hasAppointments = await Appointment.exists({ clientId: client._id });
    const hasWorkOrders = await WorkOrder.exists({ clientId: client._id });
    if (hasVehicles || hasAppointments || hasWorkOrders) {
      res.status(400);
      throw new Error('No se puede eliminar: el cliente tiene vehículos, turnos u órdenes asociadas');
    }
    await client.deleteOne();
    res.json({ message: 'Cliente eliminado' });
  } else {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }
};
