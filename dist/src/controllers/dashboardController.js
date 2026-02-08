"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardTimeSeries = exports.getDashboardSummary = void 0;
const Appointment_1 = __importDefault(require("../models/Appointment"));
const WorkOrder_1 = __importDefault(require("../models/WorkOrder"));
const Finance_1 = require("../models/Finance");
const getDashboardSummary = async (req, res) => {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    const totalAppointments = await Appointment_1.default.countDocuments({
        startAt: { $gte: startOfMonth, $lte: endOfMonth }
    });
    const cancelledAppointments = await Appointment_1.default.countDocuments({
        startAt: { $gte: startOfMonth, $lte: endOfMonth },
        status: 'CANCELLED'
    });
    const noShowAppointments = await Appointment_1.default.countDocuments({
        startAt: { $gte: startOfMonth, $lte: endOfMonth },
        status: 'NO_SHOW'
    });
    const completedAppointments = await Appointment_1.default.countDocuments({
        startAt: { $gte: startOfMonth, $lte: endOfMonth },
        status: 'COMPLETED'
    });
    const invoices = await Finance_1.Invoice.find({
        issuedAt: { $gte: startOfMonth, $lte: endOfMonth }
    });
    const revenue = invoices.reduce((acc, inv) => acc + inv.total, 0);
    const recentWorkOrders = await WorkOrder_1.default.find().sort({ createdAt: -1 }).limit(5);
    res.json({
        totalAppointments,
        cancelledAppointments,
        noShowAppointments,
        completedAppointments,
        revenue,
        recentWorkOrders
    });
};
exports.getDashboardSummary = getDashboardSummary;
const getDashboardTimeSeries = async (req, res) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const revenueByMonth = await Finance_1.Invoice.aggregate([
        { $match: { issuedAt: { $gte: sixMonthsAgo } } },
        {
            $group: {
                _id: { $month: "$issuedAt" },
                total: { $sum: "$total" },
                year: { $first: { $year: "$issuedAt" } }
            }
        },
        { $sort: { "_id": 1 } }
    ]);
    res.json(revenueByMonth);
};
exports.getDashboardTimeSeries = getDashboardTimeSeries;
//# sourceMappingURL=dashboardController.js.map