import { Request, Response } from "express";
import Settings from "../models/Settings";
import { processMaintenanceReminders } from "../utils/cronProcessor";
import WorkOrder from "../models/WorkOrder";
import { sanitizeLogoUrlInput } from "../utils/branding";

const DEFAULT_ESTIMATE_VALIDITY_DAYS = 15;
const MAX_ESTIMATE_VALIDITY_DAYS = 365;
const MIN_PREPAID_REMINDER_DAY = 1;
const MAX_PREPAID_REMINDER_DAY = 28;

const normalizeEstimateValidityDays = (
  value: unknown,
): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  if (
    normalized < 1 ||
    normalized > MAX_ESTIMATE_VALIDITY_DAYS
  ) {
    return null;
  }
  return normalized;
};

const normalizePrepaidReminderDay = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  if (
    normalized < MIN_PREPAID_REMINDER_DAY ||
    normalized > MAX_PREPAID_REMINDER_DAY
  ) {
    return null;
  }
  return normalized;
};

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
        bankAlias: "",
        bankName: "",
        bankCbu: "",
        bankHolderFirstName: "",
        bankHolderLastName: "",
        estimateValidityDays: DEFAULT_ESTIMATE_VALIDITY_DAYS,
        prepaidBalanceEnabled: false,
        prepaidReminderEnabled: false,
        prepaidReminderDay: 5,
        unavailableRanges: [],
      });
    } else {
      const normalizedDays = normalizeEstimateValidityDays(
        (settings as any).estimateValidityDays,
      );
      const normalizedReminderDay = normalizePrepaidReminderDay(
        (settings as any).prepaidReminderDay,
      );
      let shouldSave = false;
      if (!normalizedDays) {
        (settings as any).estimateValidityDays =
          DEFAULT_ESTIMATE_VALIDITY_DAYS;
        shouldSave = true;
      }
      if (!normalizedReminderDay) {
        (settings as any).prepaidReminderDay = 5;
        shouldSave = true;
      }
      if (typeof (settings as any).prepaidBalanceEnabled !== "boolean") {
        (settings as any).prepaidBalanceEnabled = false;
        shouldSave = true;
      }
      if (typeof (settings as any).prepaidReminderEnabled !== "boolean") {
        (settings as any).prepaidReminderEnabled = false;
        shouldSave = true;
      }
      const normalizedLogoUrl = sanitizeLogoUrlInput(
        (settings as any).logoUrl,
      );
      const logoValueToPersist = normalizedLogoUrl || "";
      if (String((settings as any).logoUrl || "") !== logoValueToPersist) {
        settings.logoUrl = logoValueToPersist;
        shouldSave = true;
      }
      if (shouldSave) {
        await settings.save();
      }
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
      if (req.body.shopName !== undefined) settings.shopName = req.body.shopName;
      if (req.body.address !== undefined) settings.address = req.body.address;
      if (req.body.phone !== undefined) settings.phone = req.body.phone;
      if (req.body.emailFrom !== undefined) settings.emailFrom = req.body.emailFrom;
      if (req.body.workingHours !== undefined) settings.workingHours = req.body.workingHours;
      if (req.body.invoiceSeriesPrefix !== undefined) {
        settings.invoiceSeriesPrefix = req.body.invoiceSeriesPrefix;
      }
      if (req.body.logoUrl !== undefined) {
        settings.logoUrl = sanitizeLogoUrlInput(req.body.logoUrl) || "";
      }
      if (req.body.bankAlias !== undefined) settings.bankAlias = req.body.bankAlias;
      if (req.body.bankName !== undefined) settings.bankName = req.body.bankName;
      if (req.body.bankCbu !== undefined) settings.bankCbu = req.body.bankCbu;
      if (req.body.bankHolderFirstName !== undefined) {
        settings.bankHolderFirstName = req.body.bankHolderFirstName;
      }
      if (req.body.bankHolderLastName !== undefined) {
        settings.bankHolderLastName = req.body.bankHolderLastName;
      }
      if (req.body.estimateValidityDays !== undefined) {
        const normalizedDays = normalizeEstimateValidityDays(
          req.body.estimateValidityDays,
        );
        if (!normalizedDays) {
          res.status(400);
          throw new Error(
            `La vigencia de presupuestos debe ser un número entre 1 y ${MAX_ESTIMATE_VALIDITY_DAYS} días`,
          );
        }
        (settings as any).estimateValidityDays = normalizedDays;
      }
      if (req.body.prepaidBalanceEnabled !== undefined) {
        (settings as any).prepaidBalanceEnabled = Boolean(
          req.body.prepaidBalanceEnabled,
        );
      }
      if (req.body.prepaidReminderEnabled !== undefined) {
        (settings as any).prepaidReminderEnabled = Boolean(
          req.body.prepaidReminderEnabled,
        );
      }
      if (req.body.prepaidReminderDay !== undefined) {
        const normalizedReminderDay = normalizePrepaidReminderDay(
          req.body.prepaidReminderDay,
        );
        if (!normalizedReminderDay) {
          res.status(400);
          throw new Error(
            `El día de recordatorio debe ser un número entre ${MIN_PREPAID_REMINDER_DAY} y ${MAX_PREPAID_REMINDER_DAY}`,
          );
        }
        (settings as any).prepaidReminderDay = normalizedReminderDay;
      }
      if (req.body.prepaidOfferWhatsAppTemplate !== undefined) {
        (settings as any).prepaidOfferWhatsAppTemplate = String(
          req.body.prepaidOfferWhatsAppTemplate || "",
        ).trim();
      }
      if (req.body.prepaidOfferEmailSubject !== undefined) {
        (settings as any).prepaidOfferEmailSubject = String(
          req.body.prepaidOfferEmailSubject || "",
        ).trim();
      }
      if (req.body.prepaidOfferEmailBody !== undefined) {
        (settings as any).prepaidOfferEmailBody = String(
          req.body.prepaidOfferEmailBody || "",
        ).trim();
      }
      if (req.body.prepaidReminderEmailSubject !== undefined) {
        (settings as any).prepaidReminderEmailSubject = String(
          req.body.prepaidReminderEmailSubject || "",
        ).trim();
      }
      if (req.body.prepaidReminderEmailBody !== undefined) {
        (settings as any).prepaidReminderEmailBody = String(
          req.body.prepaidReminderEmailBody || "",
        ).trim();
      }
      if (req.body.unavailableRanges !== undefined) {
        settings.unavailableRanges = req.body.unavailableRanges;
      }

      const updatedSettings = await settings.save();
      res.json(updatedSettings);
    } else {
      // Create new settings if somehow it doesn't exist
      const normalizedDays =
        req.body.estimateValidityDays !== undefined
          ? normalizeEstimateValidityDays(req.body.estimateValidityDays)
          : DEFAULT_ESTIMATE_VALIDITY_DAYS;
      if (!normalizedDays) {
        res.status(400);
        throw new Error(
          `La vigencia de presupuestos debe ser un número entre 1 y ${MAX_ESTIMATE_VALIDITY_DAYS} días`,
        );
      }
      const normalizedReminderDay =
        req.body.prepaidReminderDay !== undefined
          ? normalizePrepaidReminderDay(req.body.prepaidReminderDay)
          : 5;
      if (!normalizedReminderDay) {
        res.status(400);
        throw new Error(
          `El día de recordatorio debe ser un número entre ${MIN_PREPAID_REMINDER_DAY} y ${MAX_PREPAID_REMINDER_DAY}`,
        );
      }
      const newSettings = await Settings.create({
        ...req.body,
        estimateValidityDays: normalizedDays,
        prepaidReminderDay: normalizedReminderDay,
        logoUrl: sanitizeLogoUrlInput(req.body.logoUrl) || "",
      });
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
