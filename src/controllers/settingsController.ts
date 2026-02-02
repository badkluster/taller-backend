import { Request, Response } from "express";
import Settings from "../models/Settings";
import { processMaintenanceReminders } from "../utils/cronProcessor";
import WorkOrder from "../models/WorkOrder";

// @desc    Get settings
// @route   GET /api/settings
// @access  Private
export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      // Create default settings if not exists
      settings = await Settings.create({
        shopName: "Taller Suarez",
        address: "",
        phone: "",
        emailFrom: "",
        workingHours: "Lunes a Viernes 09:00 - 20:00",
        unavailableRanges: [],
      });
    }

    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update settings
// @route   PUT /api/settings
// @access  Private/Admin
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const settings = await Settings.findOne();

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
    } else {
      // Create new settings if somehow it doesn't exist
      const newSettings = await Settings.create(req.body);
      res.status(201).json(newSettings);
    }
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Run maintenance reminders manually
// @route   POST /api/settings/maintenance-reminders/run
// @access  Private/Admin
export const runMaintenanceReminders = async (req: Request, res: Response) => {
  try {
    const results = await processMaintenanceReminders();
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get maintenance reminders status for today
// @route   GET /api/settings/maintenance-reminders/status
// @access  Private/Admin
export const getMaintenanceRemindersStatus = async (req: Request, res: Response) => {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const dueCount = await WorkOrder.countDocuments({
    maintenanceNotice: true,
    maintenanceDate: { $gte: startOfToday, $lte: endOfToday },
    $or: [
      { maintenanceLastNotifiedAt: { $exists: false } },
      { maintenanceLastNotifiedAt: { $lt: startOfToday } },
    ],
  });

  const sentToday = await WorkOrder.countDocuments({
    maintenanceNotice: true,
    maintenanceLastNotifiedAt: { $gte: startOfToday, $lte: endOfToday },
  });

  res.json({ dueCount, sentToday });
};
