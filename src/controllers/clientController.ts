import { Request, Response } from 'express';
import Client from '../models/Client';

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private
export const getClients = async (req: Request, res: Response) => {
  const pageSize = 20;
  const page = Number(req.query.pageNumber) || 1;
  const keyword = req.query.keyword
    ? {
        $or: [
          { firstName: { $regex: req.query.keyword as string, $options: 'i' } },
          { lastName: { $regex: req.query.keyword as string, $options: 'i' } },
          { email: { $regex: req.query.keyword as string, $options: 'i' } },
        ],
      }
    : {};

  const count = await Client.countDocuments({ ...keyword });
  const clients = await Client.find({ ...keyword })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ clients, page, pages: Math.ceil(count / pageSize) });
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
  const { firstName, lastName, phone, email, notes } = req.body;

  const client = await Client.create({
    firstName,
    lastName,
    phone,
    email,
    notes,
  });

  res.status(201).json(client);
};

// @desc    Update a client
// @route   PATCH /api/clients/:id
// @access  Private
export const updateClient = async (req: Request, res: Response) => {
  const { firstName, lastName, phone, email, notes } = req.body;

  const client = await Client.findById(req.params.id);

  if (client) {
    client.firstName = firstName || client.firstName;
    client.lastName = lastName || client.lastName;
    client.phone = phone || client.phone;
    client.email = email || client.email;
    client.notes = notes || client.notes;

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
    await client.deleteOne();
    res.json({ message: 'Cliente eliminado' });
  } else {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }
};
