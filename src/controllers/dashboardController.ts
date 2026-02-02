import { Request, Response } from 'express';
import Appointment from '../models/Appointment';
import WorkOrder from '../models/WorkOrder';
import { Invoice } from '../models/Finance';

// @desc    Get Dashboard Summary
// @route   GET /api/dashboard/summary
// @access  Private/Admin
export const getDashboardSummary = async (req: Request, res: Response) => {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  const totalAppointments = await Appointment.countDocuments({
    startAt: { $gte: startOfMonth, $lte: endOfMonth }
  });

  const cancelledAppointments = await Appointment.countDocuments({
    startAt: { $gte: startOfMonth, $lte: endOfMonth },
    status: 'CANCELLED'
  });

  const noShowAppointments = await Appointment.countDocuments({
    startAt: { $gte: startOfMonth, $lte: endOfMonth },
    status: 'NO_SHOW'
  });

  const completedAppointments = await Appointment.countDocuments({
    startAt: { $gte: startOfMonth, $lte: endOfMonth },
    status: 'COMPLETED'
  });

  // Calculate monthly revenue from Invoices
  const invoices = await Invoice.find({
    issuedAt: { $gte: startOfMonth, $lte: endOfMonth }
  });
  const revenue = invoices.reduce((acc, inv) => acc + inv.total, 0);

  // Recent recent activity
  const recentWorkOrders = await WorkOrder.find().sort({ createdAt: -1 }).limit(5);

  res.json({
    totalAppointments,
    cancelledAppointments,
    noShowAppointments,
    completedAppointments,
    revenue,
    recentWorkOrders
  });
};

// @desc    Get Time Series Data (Revenue)
// @route   GET /api/dashboard/timeseries
// @access  Private/Admin
export const getDashboardTimeSeries = async (req: Request, res: Response) => {
  // Aggregate revenue by month for last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const revenueByMonth = await Invoice.aggregate([
    { $match: { issuedAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { $month: "$issuedAt" },
        total: { $sum: "$total" },
        year: { $first: { $year: "$issuedAt" } } // Keep year to sort correctly if needed
      }
    },
    { $sort: { "_id": 1 } }
  ]);

  res.json(revenueByMonth);
};
