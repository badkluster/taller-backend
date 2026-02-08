"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = __importDefault(require("./models/User"));
const Vehicle_1 = __importDefault(require("./models/Vehicle"));
const Client_1 = __importDefault(require("./models/Client"));
const WorkOrder_1 = __importDefault(require("./models/WorkOrder"));
const Finance_1 = require("./models/Finance");
const Settings_1 = __importDefault(require("./models/Settings"));
const normalizePlate_1 = require("./utils/normalizePlate");
dotenv_1.default.config();
const importData = async () => {
    try {
        await mongoose_1.default.connect(process.env.MONGODB_URI);
        const db = mongoose_1.default.connection.db;
        if (!db) {
            throw new Error('Database connection is not available');
        }
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        if (collectionNames.includes('users'))
            await db.dropCollection('users');
        if (collectionNames.includes('vehicles'))
            await db.dropCollection('vehicles');
        if (collectionNames.includes('clients'))
            await db.dropCollection('clients');
        if (collectionNames.includes('workorders'))
            await db.dropCollection('workorders');
        if (collectionNames.includes('invoices'))
            await db.dropCollection('invoices');
        if (collectionNames.includes('settings'))
            await db.dropCollection('settings');
        if (collectionNames.includes('appointments'))
            await db.dropCollection('appointments');
        if (collectionNames.includes('appointmentrequests'))
            await db.dropCollection('appointmentrequests');
        if (collectionNames.includes('sequences'))
            await db.dropCollection('sequences');
        console.log('Collections dropped (including indexes)');
        await Settings_1.default.create({
            shopName: 'Taller Suarez',
            address: 'Calle Falsa 123, Buenos Aires',
            phone: '1122334455',
            emailFrom: 'contacto@tallersuarez.com',
            workingHours: 'Lunes a Viernes 08:30 a 18:30',
            invoiceSeriesPrefix: 'A-',
        });
        const adminUser = await User_1.default.create({
            name: 'Admin User',
            userName: 'admin',
            email: 'admin@planb.com',
            password: 'adminpassword',
            role: 'admin',
        });
        const mechanicUser = await User_1.default.create({
            name: 'Juan Mecanico',
            userName: 'juan',
            email: 'juan@planb.com',
            password: 'juanpassword',
            role: 'employee',
        });
        const client1 = await Client_1.default.create({
            firstName: 'Carlos',
            lastName: 'Gomez',
            phone: '1155554321',
            email: 'carlos@test.com',
            notes: 'Cliente fiel'
        });
        const vehicle1 = await Vehicle_1.default.create({
            plateRaw: 'AB 123 CD',
            plateNormalized: (0, normalizePlate_1.normalizePlate)('AB 123 CD'),
            make: 'Toyota',
            model: 'Corolla',
            year: 2020,
            currentOwner: client1._id,
            ownerHistory: [{ clientId: client1._id, fromAt: new Date() }]
        });
        const wo1 = await WorkOrder_1.default.create({
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
        await Finance_1.Invoice.create({
            vehicleId: vehicle1._id,
            clientId: client1._id,
            workOrderId: wo1._id,
            number: 'A-0001',
            total: 28000,
            paymentMethod: 'CASH',
            issuedAt: new Date()
        });
        await WorkOrder_1.default.create({
            vehicleId: vehicle1._id,
            clientId: client1._id,
            status: 'EN_PROCESO',
            workDetailsText: 'Revisión de frenos delanteros',
            startAt: new Date(),
            endAt: new Date(new Date().getTime() + 2 * 60 * 60 * 1000),
            createdBy: mechanicUser._id
        });
        console.log('Data Imported Successfully!');
        process.exit();
    }
    catch (error) {
        console.error(`Error: ${error}`);
        process.exit(1);
    }
};
importData();
//# sourceMappingURL=seeder.js.map