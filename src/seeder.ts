import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User';
import Vehicle from './models/Vehicle';
import Client from './models/Client';
import WorkOrder from './models/WorkOrder';
import { Invoice } from './models/Finance';
import Settings from './models/Settings';
import Appointment from './models/Appointment';
import { normalizePlate } from './utils/normalizePlate';

dotenv.config();

const importData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);

    // Drop collections to clear old indexes
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (collectionNames.includes('users')) await mongoose.connection.db.dropCollection('users');
    if (collectionNames.includes('vehicles')) await mongoose.connection.db.dropCollection('vehicles');
    if (collectionNames.includes('clients')) await mongoose.connection.db.dropCollection('clients');
    if (collectionNames.includes('workorders')) await mongoose.connection.db.dropCollection('workorders');
    if (collectionNames.includes('invoices')) await mongoose.connection.db.dropCollection('invoices');
    if (collectionNames.includes('settings')) await mongoose.connection.db.dropCollection('settings');
    if (collectionNames.includes('appointments')) await mongoose.connection.db.dropCollection('appointments');

    console.log('Collections dropped (including indexes)');

    // Create Settings
    await Settings.create({
      shopName: 'Taller Suarez',
      address: 'Calle Falsa 123, Buenos Aires',
      phone: '1122334455',
      emailFrom: 'contacto@tallersuarez.com',
      workingHours: 'Lunes a Viernes 08:30 a 18:30',
      invoiceSeriesPrefix: 'A-',
    });

    const adminUser = await User.create({
      name: 'Admin User',
      userName: 'admin',
      email: 'admin@planb.com',
      password: 'adminpassword',
      role: 'admin',
    });

    const mechanicUser = await User.create({
      name: 'Juan Mecanico',
      userName: 'juan',
      email: 'juan@planb.com',
      password: 'juanpassword',
      role: 'employee',
    });

    const client1 = await Client.create({
      firstName: 'Carlos',
      lastName: 'Gomez',
      phone: '1155554321',
      email: 'carlos@test.com',
      notes: 'Cliente fiel'
    });

    const vehicle1 = await Vehicle.create({
      plateRaw: 'AB 123 CD',
      plateNormalized: normalizePlate('AB 123 CD'),
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      currentOwner: client1._id,
      ownerHistory: [{ clientId: client1._id, fromAt: new Date() }]
    });

    // Create some Work Orders
    const wo1 = await WorkOrder.create({
        vehicleId: vehicle1._id,
        clientId: client1._id,
        status: 'COMPLETADA',
        workDetailsText: 'Cambio de aceite y filtros',
        items: [
            { description: 'Aceite Sintético', qty: 1, unitPrice: 15000 },
            { description: 'Filtro de Aceite', qty: 1, unitPrice: 5000 }
        ],
        laborCost: 10000,
        discount: 2000,
        total: 28000,
        paymentMethod: 'CASH',
        createdBy: adminUser._id
    });

    // Create Invoice for the completed WO
    await Invoice.create({
        vehicleId: vehicle1._id,
        clientId: client1._id,
        workOrderId: wo1._id,
        number: 'A-0001',
        total: 28000,
        paymentMethod: 'CASH',
        issuedAt: new Date()
    });

    // Create an active WO
    await WorkOrder.create({
        vehicleId: vehicle1._id,
        clientId: client1._id,
        status: 'EN_PROCESO',
        workDetailsText: 'Revisión de frenos delanteros',
        startAt: new Date(),
        endAt: new Date(new Date().getTime() + 2 * 60 * 60 * 1000), // +2 hours
        createdBy: mechanicUser._id
    });

    console.log('Data Imported Successfully!');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
};

importData();
