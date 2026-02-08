"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./config/db");
const app_1 = __importDefault(require("./app"));
const agenda_1 = require("./utils/agenda");
const logger_1 = require("./utils/logger");
dotenv_1.default.config();
const startServer = async () => {
    try {
        await (0, db_1.connectDB)();
        await (0, agenda_1.startAgenda)();
    }
    catch (error) {
        logger_1.logger.error({ err: error }, 'Startup failure');
    }
    const PORT = process.env.PORT || 5000;
    app_1.default.listen(PORT, () => {
        console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
};
startServer();
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error({ reason }, 'Unhandled Promise Rejection');
});
process.on('uncaughtException', (err) => {
    logger_1.logger.error({ err }, 'Uncaught Exception');
});
//# sourceMappingURL=server.js.map