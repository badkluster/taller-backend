"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cronProcessor_1 = require("../utils/cronProcessor");
const router = express_1.default.Router();
router.get('/process-reminders', async (req, res) => {
    const secret = req.headers['authorization'];
    if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const results = await (0, cronProcessor_1.processReminders)();
        res.json({ success: true, results });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
router.get('/reschedule-overdue-appointments', async (req, res) => {
    const secret = req.headers['authorization'];
    if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const results = await (0, cronProcessor_1.rescheduleOverdueAppointments)();
        res.json({ success: true, results });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
router.get('/maintenance-reminders', async (req, res) => {
    const secret = req.headers['authorization'];
    if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const results = await (0, cronProcessor_1.processMaintenanceReminders)();
        res.json({ success: true, results });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
router.get('/owner-daily-summary', async (req, res) => {
    const secret = req.headers['authorization'];
    if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const results = await (0, cronProcessor_1.sendOwnerDailySummary)();
        res.json({ success: true, results });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=cronRoutes.js.map