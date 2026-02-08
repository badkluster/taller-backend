"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const fix = async () => {
    try {
        console.log('Connecting to DB...');
        await mongoose_1.default.connect(process.env.MONGODB_URI);
        const db = mongoose_1.default.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }
        console.log('Connected. Dropping workorders collection to clear indexes...');
        const collections = await db.listCollections().toArray();
        if (collections.map(c => c.name).includes('workorders')) {
            await db.dropCollection('workorders');
            console.log('Collection workorders dropped.');
        }
        else {
            console.log('Collection workorders not found, skipping drop.');
        }
        process.exit(0);
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
};
fix();
//# sourceMappingURL=fixIndices.js.map