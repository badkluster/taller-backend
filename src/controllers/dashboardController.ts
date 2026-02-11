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
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [
    totalAppointments,
    cancelledAppointments,
    noShowAppointments,
    completedAppointments,
    totalClients,
    totalVehicles,
    sentCampaigns,
    monthlyFinance,
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
    Invoice.aggregate([
      { $match: { issuedAt: { $gte: startOfMonth, $lte: endOfMonth } } },
      {
        $group: {
          _id: null,
          totalBilled: { $sum: { $ifNull: ['$total', 0] } },
          realIncome: { $sum: { $ifNull: ['$laborCost', 0] } },
        },
      },
    ]),
  ]);

  const totalBilled = Number(monthlyFinance?.[0]?.totalBilled || 0);
  const realIncome = Number(monthlyFinance?.[0]?.realIncome || 0);

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
    totalBilled,
    realIncome,
    revenue: totalBilled,
    recentWorkOrders
  });
};

// @desc    Get Time Series Data (Revenue)
// @route   GET /api/dashboard/timeseries
// @access  Private/Admin
export const getDashboardTimeSeries = async (req: Request, res: Response) => {
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const now = new Date();
  const monthsWindow = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1, 0, 0, 0, 0);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: monthNames[date.getMonth()],
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      startAt: date,
    };
  });

  const firstMonthStart = monthsWindow[0].startAt;
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

  const financeByMonth = await Invoice.aggregate([
    { $match: { issuedAt: { $gte: firstMonthStart, $lt: nextMonthStart } } },
    {
      $group: {
        _id: {
          year: { $year: '$issuedAt' },
          month: { $month: '$issuedAt' },
        },
        totalBilled: { $sum: { $ifNull: ['$total', 0] } },
        realIncome: { $sum: { $ifNull: ['$laborCost', 0] } },
      },
    },
  ]);

  const financeMap = new Map<string, { totalBilled: number; realIncome: number }>();
  financeByMonth.forEach((row: any) => {
    const year = Number(row?._id?.year);
    const month = Number(row?._id?.month);
    if (!year || !month) return;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    financeMap.set(key, {
      totalBilled: Number(row.totalBilled || 0),
      realIncome: Number(row.realIncome || 0),
    });
  });

  const response = monthsWindow.map((month) => {
    const values = financeMap.get(month.key) || { totalBilled: 0, realIncome: 0 };
    return {
      _id: month.label,
      year: month.year,
      month: month.month,
      totalBilled: values.totalBilled,
      realIncome: values.realIncome,
      total: values.totalBilled,
    };
  });

  res.json(response);
};
