import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const fix = async () => {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(process.env.MONGODB_URI as string);
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }
        console.log('Connected. Dropping workorders collection to clear indexes...');
        const collections = await db.listCollections().toArray();
        if (collections.map(c => c.name).includes('workorders')) {
            await db.dropCollection('workorders');
            console.log('Collection workorders dropped.');
        } else {
            console.log('Collection workorders not found, skipping drop.');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
fix();
