"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("../src/app"));
const db_1 = require("../src/config/db");
const agenda_1 = require("../src/utils/agenda");
const logger_1 = require("../src/utils/logger");
let isConnected = false;
let isAgendaStarted = false;
const ensureDatabase = async () => {
    if (isConnected)
        return;
    await (0, db_1.connectDB)();
    isConnected = true;
};
const ensureAgenda = async () => {
    if (isAgendaStarted)
        return;
    try {
        await (0, agenda_1.startAgenda)();
        isAgendaStarted = true;
    }
    catch (error) {
        logger_1.logger.error({ err: error }, 'Failed to start Agenda in serverless handler');
    }
};
const handler = async (req, res) => {
    await ensureDatabase();
    await ensureAgenda();
    return (0, app_1.default)(req, res);
};
exports.default = handler;
//# sourceMappingURL=%5B...path%5D.js.map