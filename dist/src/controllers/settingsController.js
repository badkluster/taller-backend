"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMaintenanceRemindersStatus = exports.runMaintenanceReminders = exports.updateSettings = exports.getSettings = void 0;
const Settings_1 = __importDefault(require("../models/Settings"));
const cronProcessor_1 = require("../utils/cronProcessor");
const WorkOrder_1 = __importDefault(require("../models/WorkOrder"));
const getSettings = async (req, res) => {
    try {
        let settings = await Settings_1.default.findOne();
        if (!settings) {
            settings = await Settings_1.default.create({
                shopName: "Taller Suarez",
                address: "",
                phone: "",
                emailFrom: "",
                workingHours: "Lunes a Viernes 09:00 - 20:00",
                unavailableRanges: [],
            });
        }
        res.json(settings);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getSettings = getSettings;
const updateSettings = async (req, res) => {
    try {
        const settings = await Settings_1.default.findOne();
        if (settings) {
            settings.shopName = req.body.shopName || settings.shopName;
            settings.address = req.body.address || settings.address;
            settings.phone = req.body.phone || settings.phone;
            settings.emailFrom = req.body.emailFrom || settings.emailFrom;
            settings.workingHours = req.body.workingHours || settings.workingHours;
            settings.invoiceSeriesPrefix =
                req.body.invoiceSeriesPrefix || settings.invoiceSeriesPrefix;
            settings.logoUrl = req.body.logoUrl || settings.logoUrl;
            if (req.body.unavailableRanges !== undefined) {
                settings.unavailableRanges = req.body.unavailableRanges;
            }
            const updatedSettings = await settings.save();
            res.json(updatedSettings);
        }
        else {
            const newSettings = await Settings_1.default.create(req.body);
            res.status(201).json(newSettings);
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updateSettings = updateSettings;
const runMaintenanceReminders = async (req, res) => {
    try {
        const results = await (0, cronProcessor_1.processMaintenanceReminders)();
        res.json({ success: true, results });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.runMaintenanceReminders = runMaintenanceReminders;
const getMaintenanceRemindersStatus = async (req, res) => {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const dueCount = await WorkOrder_1.default.countDocuments({
        maintenanceNotice: true,
        maintenanceDate: { $gte: startOfToday, $lte: endOfToday },
        $or: [
            { maintenanceLastNotifiedAt: { $exists: false } },
            { maintenanceLastNotifiedAt: { $lt: startOfToday } },
        ],
    });
    const sentToday = await WorkOrder_1.default.countDocuments({
        maintenanceNotice: true,
        maintenanceLastNotifiedAt: { $gte: startOfToday, $lte: endOfToday },
    });
    res.json({ dueCount, sentToday });
};
exports.getMaintenanceRemindersStatus = getMaintenanceRemindersStatus;
//# sourceMappingURL=settingsController.js.map