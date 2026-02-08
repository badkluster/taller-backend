import { Request, Response } from "express";
import Appointment from "../models/Appointment";
import AppointmentRequest from "../models/AppointmentRequest";
import Client from "../models/Client";
import Settings from "../models/Settings";
import Vehicle from "../models/Vehicle";
import {
  appointmentRequestConfirmedTemplate,
  appointmentRequestRejectedTemplate,
  ownerNewAppointmentRequestTemplate,
} from "../utils/emailTemplates";
import { sendEmail } from "../utils/mailer";
import { normalizePlate } from "../utils/normalizePlate";

type RequestType = "diagnosis" | "repair";

type OwnerDataPayload = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
};

type VehicleDataPayload = {
  plateRaw: string;
  make?: string;
  model?: string;
  year: number | string;
  km?: number | string;
  color?: string;
};

type CreateAppointmentRequestBody = {
  ownerData?: Partial<OwnerDataPayload>;
  ownerChanged?: boolean;
  updateExistingPending?: boolean;
  clientName?: string;
  phone?: string;
  email?: string;
  vehicleData: VehicleDataPayload;
  requestType: RequestType;
  description?: string;
  suggestedDates: string[];
};

type CancelPublicRequestBody = {
  plate?: string;
  phone?: string;
  reason?: string;
};

type ConfirmBody = {
  finalDate: string;
  entryTime: string;
};

type RejectBody = {
  rejectionReason: string;
};

const REQUEST_TYPES: RequestType[] = ["diagnosis", "repair"];
const REQUEST_STATUSES = ["PENDING", "CONFIRMED", "REJECTED"] as const;
const APPOINTMENT_REQUESTS_DEFAULT_PAGE_SIZE = 12;
const APPOINTMENT_REQUESTS_MIN_PAGE_SIZE = 10;
const APPOINTMENT_REQUESTS_MAX_PAGE_SIZE = 50;
const DEFAULT_CALENDAR_EVENT_DURATION_MINUTES = (() => {
  const parsed = Number(process.env.APPOINTMENT_EVENT_DURATION_MINUTES || 60);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
})();

const normalizePhone = (phone?: string) => (phone || "").replace(/[^0-9]/g, "");
const trimString = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};
const toQueryString = (value: unknown) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
};
const toIdString = (value: any) => String(value?._id || value || "");
const resolveOwnerNotificationEmail = (settings?: { emailFrom?: string | null }) =>
  process.env.OWNER_NOTIFICATION_EMAIL ||
  settings?.emailFrom ||
  process.env.EMAIL_FROM ||
  process.env.SMTP_USER;

const WORKSHOP_UTC_OFFSET = process.env.WORKSHOP_UTC_OFFSET || "-03:00";

const parseSuggestedDate = (rawDate: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return new Date(`${rawDate}T12:00:00${WORKSHOP_UTC_OFFSET}`);
  }
  return new Date(rawDate);
};

const parseDateAndTime = (finalDate: string, entryTime: string) =>
  new Date(`${finalDate}T${entryTime}:00${WORKSHOP_UTC_OFFSET}`);

const mapRequestTypeToServiceType = (requestType: RequestType) =>
  requestType === "repair" ? "REPARACION" : "PRESUPUESTO";
const mapRequestTypeToLabel = (requestType: RequestType) =>
  requestType === "repair" ? "Reparación" : "Diagnóstico / Presupuesto";

const splitClientName = (fullName: string) => {
  const chunks = fullName.trim().split(/\s+/).filter(Boolean);
  if (chunks.length === 0) {
    return { firstName: "Cliente", lastName: "Sin apellido" };
  }
  if (chunks.length === 1) {
    return { firstName: chunks[0], lastName: "Sin apellido" };
  }
  return {
    firstName: chunks[0],
    lastName: chunks.slice(1).join(" "),
  };
};

const normalizeOwnerPayload = (
  body: CreateAppointmentRequestBody,
  fallbackOwner?: Partial<OwnerDataPayload>,
) => {
  let firstName =
    trimString(body.ownerData?.firstName) ||
    trimString(fallbackOwner?.firstName);
  let lastName =
    trimString(body.ownerData?.lastName) || trimString(fallbackOwner?.lastName);
  const phone = normalizePhone(
    body.ownerData?.phone || fallbackOwner?.phone || body.phone,
  );
  const email =
    trimString(body.ownerData?.email) ||
    trimString(fallbackOwner?.email) ||
    trimString(body.email);

  const legacyClientName = trimString(body.clientName);
  if ((!firstName || !lastName) && legacyClientName) {
    const split = splitClientName(legacyClientName);
    firstName = firstName || split.firstName;
    lastName = lastName || split.lastName;
  }

  if (!firstName || !lastName) {
    throw new Error("Nombre y apellido del titular son obligatorios");
  }
  if (!phone) {
    throw new Error("El teléfono del titular es obligatorio");
  }

  return {
    firstName,
    lastName,
    phone,
    email,
  } satisfies OwnerDataPayload;
};

const parseAndValidateSuggestedDates = (rawSuggestedDates: unknown[]) => {
  if (!Array.isArray(rawSuggestedDates) || rawSuggestedDates.length === 0) {
    throw new Error("Debe sugerir al menos 3 fechas diferentes");
  }

  const parsedSuggestedDates = rawSuggestedDates
    .map((rawDate) => parseSuggestedDate(String(rawDate).trim()))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (parsedSuggestedDates.length === 0) {
    throw new Error("Las fechas sugeridas son inválidas");
  }

  const uniqueByDay = new Map<string, Date>();
  for (const date of parsedSuggestedDates) {
    const key = date.toISOString().slice(0, 10);
    if (!uniqueByDay.has(key)) {
      uniqueByDay.set(key, date);
    }
  }

  const uniqueSuggestedDates = Array.from(uniqueByDay.values()).sort(
    (a, b) => a.getTime() - b.getTime(),
  );

  if (uniqueSuggestedDates.length < 3) {
    throw new Error("Debe sugerir al menos 3 fechas diferentes");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (
    uniqueSuggestedDates.some((date) => {
      const day = new Date(date);
      day.setHours(0, 0, 0, 0);
      return day < today;
    })
  ) {
    throw new Error("Las fechas sugeridas no pueden ser anteriores a hoy");
  }

  return uniqueSuggestedDates;
};

const findOrCreateClient = async (
  ownerPayload: OwnerDataPayload,
  forceCreate: boolean,
) => {
  if (forceCreate) {
    return Client.create(ownerPayload);
  }

  let client = await Client.findOne({ phone: ownerPayload.phone });
  if (!client && ownerPayload.email) {
    client = await Client.findOne({ email: ownerPayload.email });
  }

  if (!client) {
    return Client.create(ownerPayload);
  }

  let changed = false;
  if (!client.email && ownerPayload.email) {
    client.email = ownerPayload.email;
    changed = true;
  }
  if (!client.firstName && ownerPayload.firstName) {
    client.firstName = ownerPayload.firstName;
    changed = true;
  }
  if (!client.lastName && ownerPayload.lastName) {
    client.lastName = ownerPayload.lastName;
    changed = true;
  }
  if (!client.phone && ownerPayload.phone) {
    client.phone = ownerPayload.phone;
    changed = true;
  }
  if (changed) {
    await client.save();
  }

  return client;
};

const formatVehicleLabel = (vehicleData: {
  make?: string;
  model?: string;
  plateRaw?: string;
  plateNormalized?: string;
}) => {
  const plate =
    vehicleData.plateNormalized ||
    (vehicleData.plateRaw ? normalizePlate(vehicleData.plateRaw) : "");
  return `${vehicleData.make || ""} ${vehicleData.model || ""} (${plate || "-"})`.trim();
};

const buildWhatsAppUrl = (phone: string, message: string) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return undefined;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
};

const formatGoogleCalendarDate = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const buildGoogleCalendarUrl = (params: {
  title: string;
  startAt: Date;
  endAt?: Date;
  details?: string;
  location?: string;
}) => {
  const endAt =
    params.endAt && params.endAt > params.startAt
      ? params.endAt
      : new Date(
          params.startAt.getTime() +
            DEFAULT_CALENDAR_EVENT_DURATION_MINUTES * 60 * 1000,
        );

  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${formatGoogleCalendarDate(params.startAt)}/${formatGoogleCalendarDate(endAt)}`,
    sf: "true",
    output: "xml",
  });

  if (params.details) {
    query.set("details", params.details);
  }
  if (params.location) {
    query.set("location", params.location);
  }

  return `https://calendar.google.com/calendar/render?${query.toString()}`;
};

const sendConfirmationEmail = async (params: {
  email?: string;
  clientName: string;
  confirmedAt: Date;
  vehicleLabel: string;
  description?: string;
  googleCalendarUrl?: string;
  settings: {
    shopName?: string;
    address?: string;
    phone?: string;
    emailFrom?: string;
    logoUrl?: string;
  };
}) => {
  if (!params.email) return false;
  const template = appointmentRequestConfirmedTemplate({
    clientName: params.clientName,
    confirmedAt: params.confirmedAt,
    vehicleLabel: params.vehicleLabel,
    description: params.description,
    googleCalendarUrl: params.googleCalendarUrl,
    settings: params.settings,
  });

  await sendEmail({
    to: params.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  return true;
};

const sendRejectionEmail = async (params: {
  email?: string;
  clientName: string;
  vehicleLabel: string;
  rejectionReason: string;
  settings: {
    shopName?: string;
    address?: string;
    phone?: string;
    emailFrom?: string;
    logoUrl?: string;
  };
}) => {
  if (!params.email) return false;
  const template = appointmentRequestRejectedTemplate({
    clientName: params.clientName,
    vehicleLabel: params.vehicleLabel,
    rejectionReason: params.rejectionReason,
    settings: params.settings,
  });

  await sendEmail({
    to: params.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  return true;
};

const resolveClientAndVehicle = async (requestDoc: any) => {
  if (requestDoc.clientId && requestDoc.vehicleId) {
    const [clientById, vehicleById] = await Promise.all([
      Client.findById(requestDoc.clientId),
      Vehicle.findById(requestDoc.vehicleId),
    ]);
    if (clientById && vehicleById) {
      return { client: clientById, vehicle: vehicleById };
    }
  }

  const { firstName, lastName } = splitClientName(requestDoc.clientName);
  const normalizedPhone = normalizePhone(requestDoc.phone);
  const requestEmail = requestDoc.email || undefined;

  let client = await Client.findOne({
    phone: normalizedPhone || requestDoc.phone,
  });
  if (!client && requestEmail) {
    client = await Client.findOne({ email: requestEmail });
  }
  if (!client) {
    client = await Client.create({
      firstName,
      lastName,
      phone: normalizedPhone || requestDoc.phone,
      email: requestEmail,
    });
  } else {
    if (!client.email && requestEmail) client.email = requestEmail;
    if (!client.firstName && firstName) client.firstName = firstName;
    if (!client.lastName && lastName) client.lastName = lastName;
    await client.save();
  }

  const plateRaw = requestDoc.vehicleData?.plateRaw;
  const plateNormalized = normalizePlate(plateRaw);
  let vehicle = await Vehicle.findOne({ plateNormalized });

  const parsedYear = Number(requestDoc.vehicleData?.year);
  const parsedKm =
    requestDoc.vehicleData?.km !== undefined &&
    requestDoc.vehicleData?.km !== null
      ? Number(requestDoc.vehicleData.km)
      : undefined;

  if (!vehicle) {
    vehicle = await Vehicle.create({
      plateRaw,
      make: requestDoc.vehicleData?.make,
      model: requestDoc.vehicleData?.model,
      year: parsedYear,
      km: parsedKm,
      color: requestDoc.vehicleData?.color,
      currentOwner: client._id,
      ownerHistory: [
        {
          clientId: client._id,
          fromAt: new Date(),
          note: "Owner created from appointment request",
        },
      ],
    });
  } else if (String(vehicle.currentOwner) !== String(client._id)) {
    if (vehicle.ownerHistory && vehicle.ownerHistory.length > 0) {
      const previous = vehicle.ownerHistory[vehicle.ownerHistory.length - 1];
      if (!previous.toAt) {
        previous.toAt = new Date();
      }
    }
    vehicle.currentOwner = client._id as any;
    vehicle.ownerHistory.push({
      clientId: client._id,
      fromAt: new Date(),
      note: "Owner updated from appointment request confirmation",
    });
    await vehicle.save();
  }

  return { client, vehicle };
};

// @desc    Public vehicle search by plate
// @route   GET /api/appointment-requests/public/plate/:plate
// @access  Public
export const getPublicVehicleByPlate = async (req: Request, res: Response) => {
  console.log(`Received plate search request for: ${req.params.plate}`);
  const rawPlate = Array.isArray(req.params.plate)
    ? req.params.plate[0]
    : req.params.plate;
  const normalizedPlate = normalizePlate(rawPlate || "");
  if (!normalizedPlate) {
    res.status(400);
    throw new Error("La patente es obligatoria");
  }

  const vehicle = await Vehicle.findOne({
    plateNormalized: normalizedPlate,
  }).populate("currentOwner", "firstName lastName phone email");

  if (!vehicle) {
    res.json({ exists: false, plateNormalized: normalizedPlate });
    return;
  }

  const owner = vehicle.currentOwner as any;
  res.json({
    exists: true,
    vehicle: {
      _id: vehicle._id,
      plateRaw: vehicle.plateRaw,
      plateNormalized: vehicle.plateNormalized,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      km: vehicle.km,
      color: vehicle.color,
    },
    owner: owner
      ? {
          _id: owner._id,
          firstName: owner.firstName,
          lastName: owner.lastName,
          phone: owner.phone,
          email: owner.email,
        }
      : null,
  });
};

// @desc    Get pending public appointment request by plate and phone
// @route   GET /api/appointment-requests/public/pending?plate=...&phone=...
// @access  Public
export const getPublicPendingAppointmentRequest = async (
  req: Request,
  res: Response,
) => {
  const rawPlate = toQueryString(req.query.plate);
  const rawPhone = toQueryString(req.query.phone);

  const plateNormalized = normalizePlate(rawPlate);
  const phoneNormalized = normalizePhone(rawPhone);

  if (!plateNormalized || !phoneNormalized) {
    res.status(400);
    throw new Error("Patente y teléfono son obligatorios");
  }

  const pendingRequest = await AppointmentRequest.findOne({
    status: "PENDING",
    "vehicleData.plateNormalized": plateNormalized,
    phone: phoneNormalized,
  }).sort({ createdAt: -1 });

  if (!pendingRequest) {
    res.status(404);
    throw new Error("No se encontró una solicitud pendiente con esos datos");
  }

  const vehicleData = pendingRequest.vehicleData || {};
  const vehicleLabel = formatVehicleLabel(vehicleData);

  res.json({
    request: {
      id: pendingRequest._id,
      clientName: pendingRequest.clientName,
      phone: pendingRequest.phone,
      email: pendingRequest.email,
      status: pendingRequest.status,
      requestType: pendingRequest.requestType,
      requestTypeLabel: mapRequestTypeToLabel(pendingRequest.requestType as RequestType),
      description: pendingRequest.description || "",
      suggestedDates: pendingRequest.suggestedDates || [],
      createdAt: pendingRequest.createdAt,
      vehicle: {
        plateRaw: vehicleData.plateRaw,
        plateNormalized: vehicleData.plateNormalized,
        make: vehicleData.make,
        model: vehicleData.model,
        year: vehicleData.year,
        km: vehicleData.km,
        color: vehicleData.color,
        label: vehicleLabel,
      },
    },
  });
};

// @desc    Cancel pending public appointment request by plate and phone
// @route   POST /api/appointment-requests/public/cancel
// @access  Public
export const cancelPublicPendingAppointmentRequest = async (
  req: Request,
  res: Response,
) => {
  const body = req.body as CancelPublicRequestBody;
  const plateRaw = String(body.plate || "");
  const phoneRaw = String(body.phone || "");
  const plateNormalized = normalizePlate(plateRaw);
  const phoneNormalized = normalizePhone(phoneRaw);

  if (!plateNormalized || !phoneNormalized) {
    res.status(400);
    throw new Error("Patente y teléfono son obligatorios");
  }

  const pendingRequest = await AppointmentRequest.findOne({
    status: "PENDING",
    "vehicleData.plateNormalized": plateNormalized,
    phone: phoneNormalized,
  }).sort({ createdAt: -1 });

  if (!pendingRequest) {
    res.status(404);
    throw new Error("No se encontró una solicitud pendiente para cancelar");
  }

  pendingRequest.status = "REJECTED";
  pendingRequest.rejectionReason =
    trimString(body.reason) || "Cancelada por el cliente desde la landing";
  pendingRequest.rejectedAt = new Date();
  await pendingRequest.save();

  res.json({
    success: true,
    canceledRequest: {
      id: pendingRequest._id,
      status: pendingRequest.status,
      rejectionReason: pendingRequest.rejectionReason,
      rejectedAt: pendingRequest.rejectedAt,
    },
  });
};

// @desc    Create appointment request (public)
// @route   POST /api/appointment-requests/public
// @access  Public
export const createAppointmentRequest = async (req: Request, res: Response) => {
  const body = req.body as CreateAppointmentRequestBody;
  const { vehicleData, requestType, description, suggestedDates } = body;

  if (!REQUEST_TYPES.includes(requestType)) {
    res.status(400);
    throw new Error("Tipo de solicitud inválido");
  }
  if (!vehicleData?.plateRaw?.trim()) {
    res.status(400);
    throw new Error("La patente del vehículo es obligatoria");
  }

  const normalizedPlate = normalizePlate(vehicleData.plateRaw);
  if (!normalizedPlate) {
    res.status(400);
    throw new Error("La patente del vehículo es obligatoria");
  }

  const existingVehicle = await Vehicle.findOne({
    plateNormalized: normalizedPlate,
  }).populate("currentOwner", "firstName lastName phone email");
  const fallbackOwner =
    existingVehicle && !body.ownerChanged
      ? {
          firstName: (existingVehicle.currentOwner as any)?.firstName,
          lastName: (existingVehicle.currentOwner as any)?.lastName,
          phone: (existingVehicle.currentOwner as any)?.phone,
          email: (existingVehicle.currentOwner as any)?.email,
        }
      : undefined;

  let ownerPayload: OwnerDataPayload;
  try {
    ownerPayload = normalizeOwnerPayload(body, fallbackOwner);
  } catch (error: any) {
    res.status(400);
    throw new Error(error?.message || "Datos del titular inválidos");
  }

  const resolvedMake = trimString(vehicleData.make) || existingVehicle?.make;
  const resolvedModel = trimString(vehicleData.model) || existingVehicle?.model;
  if (!resolvedMake || !resolvedModel) {
    res.status(400);
    throw new Error("Marca y modelo del vehículo son obligatorios");
  }

  const parsedYear = Number(vehicleData.year ?? existingVehicle?.year);
  if (Number.isNaN(parsedYear) || parsedYear < 1900) {
    res.status(400);
    throw new Error("El año del vehículo es inválido");
  }

  const kmRaw =
    vehicleData.km !== undefined &&
    vehicleData.km !== null &&
    vehicleData.km !== ""
      ? vehicleData.km
      : existingVehicle?.km;
  const parsedKm =
    kmRaw !== undefined && kmRaw !== null && kmRaw !== ""
      ? Number(kmRaw)
      : undefined;
  if (parsedKm !== undefined && Number.isNaN(parsedKm)) {
    res.status(400);
    throw new Error("El kilometraje del vehículo es inválido");
  }

  let parsedSuggestedDates: Date[];
  try {
    parsedSuggestedDates = parseAndValidateSuggestedDates(
      suggestedDates as unknown[],
    );
  } catch (error: any) {
    res.status(400);
    throw new Error(error?.message || "Las fechas sugeridas son inválidas");
  }

  const ownerChanged = Boolean(body.ownerChanged && existingVehicle);
  const client = await findOrCreateClient(ownerPayload, ownerChanged);

  let vehicle = existingVehicle;
  if (!vehicle) {
    vehicle = await Vehicle.create({
      plateRaw: vehicleData.plateRaw.trim(),
      plateNormalized: normalizedPlate,
      make: resolvedMake,
      model: resolvedModel,
      year: parsedYear,
      km: parsedKm,
      color: trimString(vehicleData.color),
      currentOwner: client._id,
      ownerHistory: [
        {
          clientId: client._id,
          fromAt: new Date(),
          note: "Owner created from public appointment request",
        },
      ],
    });
  } else {
    const currentOwnerId = toIdString(vehicle.currentOwner);
    const nextOwnerId = toIdString(client._id);
    const shouldUpdateOwner =
      ownerChanged || (nextOwnerId && currentOwnerId !== nextOwnerId);

    if (shouldUpdateOwner) {
      if (vehicle.ownerHistory && vehicle.ownerHistory.length > 0) {
        const previous = vehicle.ownerHistory[vehicle.ownerHistory.length - 1];
        if (!previous.toAt) {
          previous.toAt = new Date();
        }
      }
      vehicle.currentOwner = client._id as any;
      vehicle.ownerHistory.push({
        clientId: client._id,
        fromAt: new Date(),
        note: "Owner updated from public appointment request",
      });
      await vehicle.save();
    }
  }

  const snapshotClientName =
    `${ownerPayload.firstName} ${ownerPayload.lastName}`.trim();
  const requestPayload = {
    clientName: snapshotClientName,
    phone: ownerPayload.phone,
    email: ownerPayload.email,
    clientId: client._id,
    vehicleId: vehicle._id,
    vehicleData: {
      plateRaw: vehicle.plateRaw || vehicleData.plateRaw.trim(),
      plateNormalized: vehicle.plateNormalized || normalizedPlate,
      make: vehicle.make || resolvedMake,
      model: vehicle.model || resolvedModel,
      year: vehicle.year || parsedYear,
      km: vehicle.km ?? parsedKm,
      color: vehicle.color || trimString(vehicleData.color),
    },
    requestType,
    description: description?.trim() || "",
    suggestedDates: parsedSuggestedDates,
    status: "PENDING",
  } as const;

  const existingPendingRequest = await AppointmentRequest.findOne({
    status: "PENDING",
    $or: [
      { vehicleId: vehicle._id, clientId: client._id },
      {
        "vehicleData.plateNormalized": normalizedPlate,
        phone: ownerPayload.phone,
      },
    ],
  }).sort({ createdAt: -1 });

  let requestDoc: any;
  let wasUpdatedExisting = false;

  if (existingPendingRequest) {
    if (!body.updateExistingPending) {
      const pendingDateLabel = new Date(
        existingPendingRequest.createdAt || new Date(),
      ).toLocaleDateString("es-AR");

      res.status(409).json({
        code: "PENDING_REQUEST_EXISTS",
        message: `Ya tenés una solicitud pendiente del ${pendingDateLabel}. ¿Querés actualizar fechas?`,
        existingRequest: {
          id: existingPendingRequest._id,
          createdAt: existingPendingRequest.createdAt,
          suggestedDates: (existingPendingRequest.suggestedDates || []).map(
            (date: Date) => new Date(date).toISOString(),
          ),
        },
      });
      return;
    }

    existingPendingRequest.clientName = requestPayload.clientName;
    existingPendingRequest.phone = requestPayload.phone;
    existingPendingRequest.email = requestPayload.email;
    existingPendingRequest.clientId = requestPayload.clientId;
    existingPendingRequest.vehicleId = requestPayload.vehicleId;
    existingPendingRequest.vehicleData = requestPayload.vehicleData;
    existingPendingRequest.requestType = requestPayload.requestType;
    existingPendingRequest.description = requestPayload.description;
    existingPendingRequest.suggestedDates = requestPayload.suggestedDates;
    requestDoc = await existingPendingRequest.save();
    wasUpdatedExisting = true;
  } else {
    requestDoc = await AppointmentRequest.create(requestPayload);
  }

  try {
    const settings = await Settings.findOne();
    const ownerEmail = resolveOwnerNotificationEmail(settings || undefined);

    if (ownerEmail) {
      const ownerVehicleLabel = formatVehicleLabel({
        make: vehicle.make || resolvedMake,
        model: vehicle.model || resolvedModel,
        plateNormalized: vehicle.plateNormalized || normalizedPlate,
      });
      const frontendBaseUrl = (
        process.env.FRONTEND_URL ||
        process.env.APP_BASE_URL ||
        ""
      )
        .trim()
        .replace(/\/+$/, "");
      const manageRequestsUrl = frontendBaseUrl
        ? `${frontendBaseUrl}/app/appointment-requests`
        : undefined;

      const ownerTemplate = ownerNewAppointmentRequestTemplate({
        clientName: snapshotClientName,
        phone: ownerPayload.phone,
        email: ownerPayload.email,
        vehicleLabel: ownerVehicleLabel,
        requestTypeLabel: mapRequestTypeToLabel(requestType),
        description: description?.trim() || undefined,
        suggestedDates: parsedSuggestedDates,
        manageRequestsUrl,
        notificationType: wasUpdatedExisting ? "UPDATED" : "NEW",
        settings: {
          shopName: settings?.shopName,
          address: settings?.address ?? undefined,
          phone: settings?.phone ?? undefined,
          emailFrom: settings?.emailFrom ?? undefined,
          logoUrl: settings?.logoUrl ?? undefined,
        },
      });

      await sendEmail({
        to: ownerEmail,
        subject: ownerTemplate.subject,
        html: ownerTemplate.html,
        text: ownerTemplate.text,
      });
    }
  } catch (error) {
    console.error("Error enviando email de nueva solicitud al taller:", error);
  }

  res.status(wasUpdatedExisting ? 200 : 201).json({
    ...(requestDoc?.toObject ? requestDoc.toObject() : requestDoc),
    wasUpdatedExisting,
  });
};

// @desc    List appointment requests
// @route   GET /api/appointment-requests
// @access  Private
export const getAppointmentRequests = async (req: Request, res: Response) => {
  const requestedPageSize = Number(req.query.pageSize);
  const requestedPage = Number(req.query.pageNumber);

  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(
        APPOINTMENT_REQUESTS_MAX_PAGE_SIZE,
        Math.max(APPOINTMENT_REQUESTS_MIN_PAGE_SIZE, Math.floor(requestedPageSize)),
      )
    : APPOINTMENT_REQUESTS_DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;

  const status = req.query.status as string | undefined;
  const suggestedFromRaw = toQueryString(req.query.suggestedFrom);
  const suggestedToRaw = toQueryString(req.query.suggestedTo);
  const query: Record<string, any> = {};

  if (status && (REQUEST_STATUSES as readonly string[]).includes(status)) {
    query.status = status;
  }

  const suggestedRange: Record<string, Date> = {};
  if (suggestedFromRaw) {
    const fromDate = new Date(suggestedFromRaw);
    if (!Number.isNaN(fromDate.getTime())) {
      suggestedRange.$gte = fromDate;
    }
  }
  if (suggestedToRaw) {
    const toDate = new Date(suggestedToRaw);
    if (!Number.isNaN(toDate.getTime())) {
      suggestedRange.$lte = toDate;
    }
  }
  if (Object.keys(suggestedRange).length > 0) {
    query.suggestedDates = { $elemMatch: suggestedRange };
  }

  const count = await AppointmentRequest.countDocuments(query);
  const requests = await AppointmentRequest.find(query)
    .populate("confirmedAppointmentId")
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({
    requests,
    page,
    pages: Math.ceil(count / pageSize),
    totalCount: count,
  });
};

// @desc    Confirm appointment request
// @route   POST /api/appointment-requests/:id/confirm
// @access  Private
export const confirmAppointmentRequest = async (
  req: Request,
  res: Response,
) => {
  if (!req.user) {
    res.status(401);
    throw new Error("No autorizado");
  }

  const requestDoc = await AppointmentRequest.findById(req.params.id);
  if (!requestDoc) {
    res.status(404);
    throw new Error("Solicitud no encontrada");
  }
  if (requestDoc.status !== "PENDING") {
    res.status(400);
    throw new Error("Solo se pueden confirmar solicitudes pendientes");
  }

  const { finalDate, entryTime } = req.body as ConfirmBody;
  if (!finalDate || !entryTime) {
    res.status(400);
    throw new Error("Debe indicar fecha y hora de ingreso");
  }

  const confirmedStartAt = parseDateAndTime(finalDate, entryTime);
  if (Number.isNaN(confirmedStartAt.getTime())) {
    res.status(400);
    throw new Error("Fecha u hora inválidas");
  }
  if (confirmedStartAt < new Date()) {
    res.status(400);
    throw new Error("No se puede confirmar un turno en una fecha pasada");
  }

  const { client, vehicle } = await resolveClientAndVehicle(requestDoc);

  const appointment = await Appointment.create({
    vehicleId: vehicle._id,
    clientId: client._id,
    startAt: confirmedStartAt,
    endAt: confirmedStartAt,
    status: "CONFIRMED",
    serviceType: mapRequestTypeToServiceType(requestDoc.requestType),
    notes: requestDoc.description || "",
    createdBy: req.user._id,
  });

  requestDoc.status = "CONFIRMED";
  if (!requestDoc.email && client.email) {
    requestDoc.email = client.email;
  }
  requestDoc.confirmedAppointmentId = appointment._id;
  requestDoc.confirmedAt = confirmedStartAt;
  requestDoc.rejectionReason = undefined;
  requestDoc.rejectedAt = undefined;
  await requestDoc.save();

  const settings = await Settings.findOne();
  const settingsPayload = {
    shopName: settings?.shopName,
    address: settings?.address ?? undefined,
    phone: settings?.phone ?? undefined,
    emailFrom: settings?.emailFrom ?? undefined,
    logoUrl: settings?.logoUrl ?? undefined,
  };
  const vehicleLabel = formatVehicleLabel(requestDoc.vehicleData || {});
  const shopName = settings?.shopName || "Taller";
  const calendarDetails = [
    `Turno confirmado en ${shopName}.`,
    `Vehículo: ${vehicleLabel}`,
    `Servicio: ${mapRequestTypeToLabel(requestDoc.requestType)}`,
    requestDoc.description?.trim()
      ? `Detalle: ${requestDoc.description.trim()}`
      : "",
    settings?.phone ? `Teléfono: ${settings.phone}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const googleCalendarUrl = buildGoogleCalendarUrl({
    title: `Turno confirmado - ${shopName}`,
    startAt: confirmedStartAt,
    details: calendarDetails,
    location: settings?.address ?? undefined,
  });

  let emailSent = false;
  try {
    emailSent = await sendConfirmationEmail({
      email: requestDoc.email || client.email || undefined,
      clientName: requestDoc.clientName,
      confirmedAt: confirmedStartAt,
      vehicleLabel,
      description: requestDoc.description || "",
      googleCalendarUrl,
      settings: settingsPayload,
    });
  } catch (error) {
    console.error("Error enviando email de confirmación de solicitud:", error);
  }

  const shopAddress = settings?.address
    ? `\nDirección: ${settings.address}`
    : "";
  const whatsappMessage = `Hola ${requestDoc.clientName}, tu solicitud fue confirmada.\nFecha: ${confirmedStartAt.toLocaleDateString()}\nHora: ${confirmedStartAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${shopAddress}\n${shopName}`;
  const whatsAppUrl = buildWhatsAppUrl(requestDoc.phone, whatsappMessage);

  res.json({
    request: requestDoc,
    appointment,
    notification: {
      emailSent,
      whatsAppUrl,
      googleCalendarUrl,
    },
  });
};

// @desc    Reject appointment request
// @route   POST /api/appointment-requests/:id/reject
// @access  Private
export const rejectAppointmentRequest = async (req: Request, res: Response) => {
  const requestDoc = await AppointmentRequest.findById(req.params.id);
  if (!requestDoc) {
    res.status(404);
    throw new Error("Solicitud no encontrada");
  }
  if (requestDoc.status !== "PENDING") {
    res.status(400);
    throw new Error("Solo se pueden rechazar solicitudes pendientes");
  }

  const { rejectionReason } = req.body as RejectBody;
  if (!rejectionReason?.trim()) {
    res.status(400);
    throw new Error("Debe indicar el motivo de rechazo");
  }

  requestDoc.status = "REJECTED";
  requestDoc.rejectionReason = rejectionReason.trim();
  requestDoc.rejectedAt = new Date();
  requestDoc.confirmedAppointmentId = undefined;
  requestDoc.confirmedAt = undefined;
  await requestDoc.save();

  const settings = await Settings.findOne();
  const settingsPayload = {
    shopName: settings?.shopName,
    address: settings?.address ?? undefined,
    phone: settings?.phone ?? undefined,
    emailFrom: settings?.emailFrom ?? undefined,
    logoUrl: settings?.logoUrl ?? undefined,
  };
  const vehicleLabel = formatVehicleLabel(requestDoc.vehicleData || {});

  let emailSent = false;
  try {
    emailSent = await sendRejectionEmail({
      email: requestDoc.email || undefined,
      clientName: requestDoc.clientName,
      vehicleLabel,
      rejectionReason: requestDoc.rejectionReason || rejectionReason.trim(),
      settings: settingsPayload,
    });
  } catch (error) {
    console.error("Error enviando email de rechazo de solicitud:", error);
  }

  const shopName = settings?.shopName || "Taller";
  const whatsappMessage = `Hola ${requestDoc.clientName}, tu solicitud fue rechazada.\nMotivo: ${requestDoc.rejectionReason}\n${shopName}`;
  const whatsAppUrl = buildWhatsAppUrl(requestDoc.phone, whatsappMessage);

  res.json({
    request: requestDoc,
    notification: {
      emailSent,
      whatsAppUrl,
    },
  });
};
