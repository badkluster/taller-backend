"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = require("../utils/logger");
const connectDB = async () => {
    try {
        const enableMongoDebug = process.env.MONGO_DEBUG === "true" || process.env.MONGO_DEBUG === "1";
        if (enableMongoDebug) {
            mongoose_1.default.set("debug", (collectionName, method, query, doc, options) => {
                logger_1.logger.info({ collection: collectionName, method, query, doc, options }, "MongoDB query");
            });
        }
        const conn = await mongoose_1.default.connect(process.env.MONGODB_URI);
        logger_1.logger.info(`MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        logger_1.logger.error(`Error: ${error.message}`);
        process.exit(1);
    }
};
exports.connectDB = connectDB;
//# sourceMappingURL=db.js.map