import { Request, Response } from 'express';
import Appointment from '../models/Appointment';
import WorkOrder from '../models/WorkOrder';
import { Invoice } from '../models/Finance';
import Client from '../models/Client';
import Vehicle from '../models/Vehicle';
import { EmailCampaign } from '../models/Campaign';

// @desc    Get Dashboard Summary
// @route   GET /api/dashboard/summary
// @access  Private/Admin
export const getDashboardSummary = async (req: Request, res: Response) => {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  const [
    totalAppointments,
    cancelledAppointments,
    noShowAppointments,
    completedAppointments,
    totalClients,
    totalVehicles,
    sentCampaigns,
    invoices,
  ] = await Promise.all([
    Appointment.countDocuments({
      startAt: { $gte: startOfMonth, $lte: endOfMonth }
    }),
    Appointment.countDocuments({
      startAt: { $gte: startOfMonth, $lte: endOfMonth },
      status: 'CANCELLED'
    }),
    Appointment.countDocuments({
      startAt: { $gte: startOfMonth, $lte: endOfMonth },
      status: 'NO_SHOW'
    }),
    Appointment.countDocuments({
      startAt: { $gte: startOfMonth, $lte: endOfMonth },
      status: 'COMPLETED'
    }),
    Client.countDocuments({}),
    Vehicle.countDocuments({}),
    EmailCampaign.countDocuments({ status: 'SENT' }),
    Invoice.find({
      issuedAt: { $gte: startOfMonth, $lte: endOfMonth }
    }),
  ]);

  // Calculate monthly revenue from Invoices
  const revenue = invoices.reduce((acc, inv) => acc + inv.total, 0);

  // Recent recent activity
  const recentWorkOrders = await WorkOrder.find().sort({ createdAt: -1 }).limit(5);

  res.json({
    totalAppointments,
    cancelledAppointments,
    noShowAppointments,
    completedAppointments,
    totalClients,
    totalVehicles,
    sentCampaigns,
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
