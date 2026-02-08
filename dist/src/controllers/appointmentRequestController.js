"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectAppointmentRequest = exports.confirmAppointmentRequest = exports.getAppointmentRequests = exports.createAppointmentRequest = exports.getPublicVehicleByPlate = void 0;
const Appointment_1 = __importDefault(require("../models/Appointment"));
const AppointmentRequest_1 = __importDefault(require("../models/AppointmentRequest"));
const Client_1 = __importDefault(require("../models/Client"));
const Settings_1 = __importDefault(require("../models/Settings"));
const Vehicle_1 = __importDefault(require("../models/Vehicle"));
const emailTemplates_1 = require("../utils/emailTemplates");
const mailer_1 = require("../utils/mailer");
const normalizePlate_1 = require("../utils/normalizePlate");
const REQUEST_TYPES = ["diagnosis", "repair"];
const REQUEST_STATUSES = ["PENDING", "CONFIRMED", "REJECTED"];
const DEFAULT_CALENDAR_EVENT_DURATION_MINUTES = (() => {
    const parsed = Number(process.env.APPOINTMENT_EVENT_DURATION_MINUTES || 60);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
})();
const normalizePhone = (phone) => (phone || "").replace(/[^0-9]/g, "");
const trimString = (value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
};
const toIdString = (value) => String(value?._id || value || "");
const resolveOwnerNotificationEmail = (settings) => process.env.OWNER_NOTIFICATION_EMAIL ||
    settings?.emailFrom ||
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER;
const parseSuggestedDate = (rawDate) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return new Date(`${rawDate}T12:00:00`);
    }
    return new Date(rawDate);
};
const parseDateAndTime = (finalDate, entryTime) => new Date(`${finalDate}T${entryTime}:00`);
const mapRequestTypeToServiceType = (requestType) => requestType === "repair" ? "REPARACION" : "PRESUPUESTO";
const mapRequestTypeToLabel = (requestType) => requestType === "repair" ? "Reparación" : "Diagnóstico / Presupuesto";
const splitClientName = (fullName) => {
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
const normalizeOwnerPayload = (body, fallbackOwner) => {
    let firstName = trimString(body.ownerData?.firstName) ||
        trimString(fallbackOwner?.firstName);
    let lastName = trimString(body.ownerData?.lastName) || trimString(fallbackOwner?.lastName);
    const phone = normalizePhone(body.ownerData?.phone || fallbackOwner?.phone || body.phone);
    const email = trimString(body.ownerData?.email) ||
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
    };
};
const parseAndValidateSuggestedDates = (rawSuggestedDates) => {
    if (!Array.isArray(rawSuggestedDates) || rawSuggestedDates.length === 0) {
        throw new Error("Debe sugerir al menos 3 fechas diferentes");
    }
    const parsedSuggestedDates = rawSuggestedDates
        .map((rawDate) => parseSuggestedDate(String(rawDate).trim()))
        .filter((date) => !Number.isNaN(date.getTime()));
    if (parsedSuggestedDates.length === 0) {
        throw new Error("Las fechas sugeridas son inválidas");
    }
    const uniqueByDay = new Map();
    for (const date of parsedSuggestedDates) {
        const key = date.toISOString().slice(0, 10);
        if (!uniqueByDay.has(key)) {
            uniqueByDay.set(key, date);
        }
    }
    const uniqueSuggestedDates = Array.from(uniqueByDay.values()).sort((a, b) => a.getTime() - b.getTime());
    if (uniqueSuggestedDates.length < 3) {
        throw new Error("Debe sugerir al menos 3 fechas diferentes");
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (uniqueSuggestedDates.some((date) => {
        const day = new Date(date);
        day.setHours(0, 0, 0, 0);
        return day < today;
    })) {
        throw new Error("Las fechas sugeridas no pueden ser anteriores a hoy");
    }
    return uniqueSuggestedDates;
};
const findOrCreateClient = async (ownerPayload, forceCreate) => {
    if (forceCreate) {
        return Client_1.default.create(ownerPayload);
    }
    let client = await Client_1.default.findOne({ phone: ownerPayload.phone });
    if (!client && ownerPayload.email) {
        client = await Client_1.default.findOne({ email: ownerPayload.email });
    }
    if (!client) {
        return Client_1.default.create(ownerPayload);
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
const formatVehicleLabel = (vehicleData) => {
    const plate = vehicleData.plateNormalized ||
        (vehicleData.plateRaw ? (0, normalizePlate_1.normalizePlate)(vehicleData.plateRaw) : "");
    return `${vehicleData.make || ""} ${vehicleData.model || ""} (${plate || "-"})`.trim();
};
const buildWhatsAppUrl = (phone, message) => {
    const normalized = normalizePhone(phone);
    if (!normalized)
        return undefined;
    return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
};
const formatGoogleCalendarDate = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const buildGoogleCalendarUrl = (params) => {
    const endAt = params.endAt && params.endAt > params.startAt
        ? params.endAt
        : new Date(params.startAt.getTime() +
            DEFAULT_CALENDAR_EVENT_DURATION_MINUTES * 60 * 1000);
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
const sendConfirmationEmail = async (params) => {
    if (!params.email)
        return false;
    const template = (0, emailTemplates_1.appointmentRequestConfirmedTemplate)({
        clientName: params.clientName,
        confirmedAt: params.confirmedAt,
        vehicleLabel: params.vehicleLabel,
        description: params.description,
        googleCalendarUrl: params.googleCalendarUrl,
        settings: params.settings,
    });
    await (0, mailer_1.sendEmail)({
        to: params.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
    });
    return true;
};
const sendRejectionEmail = async (params) => {
    if (!params.email)
        return false;
    const template = (0, emailTemplates_1.appointmentRequestRejectedTemplate)({
        clientName: params.clientName,
        vehicleLabel: params.vehicleLabel,
        rejectionReason: params.rejectionReason,
        settings: params.settings,
    });
    await (0, mailer_1.sendEmail)({
        to: params.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
    });
    return true;
};
const resolveClientAndVehicle = async (requestDoc) => {
    if (requestDoc.clientId && requestDoc.vehicleId) {
        const [clientById, vehicleById] = await Promise.all([
            Client_1.default.findById(requestDoc.clientId),
            Vehicle_1.default.findById(requestDoc.vehicleId),
        ]);
        if (clientById && vehicleById) {
            return { client: clientById, vehicle: vehicleById };
        }
    }
    const { firstName, lastName } = splitClientName(requestDoc.clientName);
    const normalizedPhone = normalizePhone(requestDoc.phone);
    const requestEmail = requestDoc.email || undefined;
    let client = await Client_1.default.findOne({
        phone: normalizedPhone || requestDoc.phone,
    });
    if (!client && requestEmail) {
        client = await Client_1.default.findOne({ email: requestEmail });
    }
    if (!client) {
        client = await Client_1.default.create({
            firstName,
            lastName,
            phone: normalizedPhone || requestDoc.phone,
            email: requestEmail,
        });
    }
    else {
        if (!client.email && requestEmail)
            client.email = requestEmail;
        if (!client.firstName && firstName)
            client.firstName = firstName;
        if (!client.lastName && lastName)
            client.lastName = lastName;
        await client.save();
    }
    const plateRaw = requestDoc.vehicleData?.plateRaw;
    const plateNormalized = (0, normalizePlate_1.normalizePlate)(plateRaw);
    let vehicle = await Vehicle_1.default.findOne({ plateNormalized });
    const parsedYear = Number(requestDoc.vehicleData?.year);
    const parsedKm = requestDoc.vehicleData?.km !== undefined &&
        requestDoc.vehicleData?.km !== null
        ? Number(requestDoc.vehicleData.km)
        : undefined;
    if (!vehicle) {
        vehicle = await Vehicle_1.default.create({
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
    }
    else if (String(vehicle.currentOwner) !== String(client._id)) {
        if (vehicle.ownerHistory && vehicle.ownerHistory.length > 0) {
            const previous = vehicle.ownerHistory[vehicle.ownerHistory.length - 1];
            if (!previous.toAt) {
                previous.toAt = new Date();
            }
        }
        vehicle.currentOwner = client._id;
        vehicle.ownerHistory.push({
            clientId: client._id,
            fromAt: new Date(),
            note: "Owner updated from appointment request confirmation",
        });
        await vehicle.save();
    }
    return { client, vehicle };
};
const getPublicVehicleByPlate = async (req, res) => {
    console.log(`Received plate search request for: ${req.params.plate}`);
    const rawPlate = Array.isArray(req.params.plate)
        ? req.params.plate[0]
        : req.params.plate;
    const normalizedPlate = (0, normalizePlate_1.normalizePlate)(rawPlate || "");
    if (!normalizedPlate) {
        res.status(400);
        throw new Error("La patente es obligatoria");
    }
    const vehicle = await Vehicle_1.default.findOne({
        plateNormalized: normalizedPlate,
    }).populate("currentOwner", "firstName lastName phone email");
    if (!vehicle) {
        res.json({ exists: false, plateNormalized: normalizedPlate });
        return;
    }
    const owner = vehicle.currentOwner;
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
exports.getPublicVehicleByPlate = getPublicVehicleByPlate;
const createAppointmentRequest = async (req, res) => {
    const body = req.body;
    const { vehicleData, requestType, description, suggestedDates } = body;
    if (!REQUEST_TYPES.includes(requestType)) {
        res.status(400);
        throw new Error("Tipo de solicitud inválido");
    }
    if (!vehicleData?.plateRaw?.trim()) {
        res.status(400);
        throw new Error("La patente del vehículo es obligatoria");
    }
    const normalizedPlate = (0, normalizePlate_1.normalizePlate)(vehicleData.plateRaw);
    if (!normalizedPlate) {
        res.status(400);
        throw new Error("La patente del vehículo es obligatoria");
    }
    const existingVehicle = await Vehicle_1.default.findOne({
        plateNormalized: normalizedPlate,
    }).populate("currentOwner", "firstName lastName phone email");
    const fallbackOwner = existingVehicle && !body.ownerChanged
        ? {
            firstName: existingVehicle.currentOwner?.firstName,
            lastName: existingVehicle.currentOwner?.lastName,
            phone: existingVehicle.currentOwner?.phone,
            email: existingVehicle.currentOwner?.email,
        }
        : undefined;
    let ownerPayload;
    try {
        ownerPayload = normalizeOwnerPayload(body, fallbackOwner);
    }
    catch (error) {
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
    const kmRaw = vehicleData.km !== undefined &&
        vehicleData.km !== null &&
        vehicleData.km !== ""
        ? vehicleData.km
        : existingVehicle?.km;
    const parsedKm = kmRaw !== undefined && kmRaw !== null && kmRaw !== ""
        ? Number(kmRaw)
        : undefined;
    if (parsedKm !== undefined && Number.isNaN(parsedKm)) {
        res.status(400);
        throw new Error("El kilometraje del vehículo es inválido");
    }
    let parsedSuggestedDates;
    try {
        parsedSuggestedDates = parseAndValidateSuggestedDates(suggestedDates);
    }
    catch (error) {
        res.status(400);
        throw new Error(error?.message || "Las fechas sugeridas son inválidas");
    }
    const ownerChanged = Boolean(body.ownerChanged && existingVehicle);
    const client = await findOrCreateClient(ownerPayload, ownerChanged);
    let vehicle = existingVehicle;
    if (!vehicle) {
        vehicle = await Vehicle_1.default.create({
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
    }
    else {
        const currentOwnerId = toIdString(vehicle.currentOwner);
        const nextOwnerId = toIdString(client._id);
        const shouldUpdateOwner = ownerChanged || (nextOwnerId && currentOwnerId !== nextOwnerId);
        if (shouldUpdateOwner) {
            if (vehicle.ownerHistory && vehicle.ownerHistory.length > 0) {
                const previous = vehicle.ownerHistory[vehicle.ownerHistory.length - 1];
                if (!previous.toAt) {
                    previous.toAt = new Date();
                }
            }
            vehicle.currentOwner = client._id;
            vehicle.ownerHistory.push({
                clientId: client._id,
                fromAt: new Date(),
                note: "Owner updated from public appointment request",
            });
            await vehicle.save();
        }
    }
    const snapshotClientName = `${ownerPayload.firstName} ${ownerPayload.lastName}`.trim();
    const newRequest = await AppointmentRequest_1.default.create({
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
    });
    try {
        const settings = await Settings_1.default.findOne();
        const ownerEmail = resolveOwnerNotificationEmail(settings || undefined);
        if (ownerEmail) {
            const shopName = settings?.shopName || "Taller";
            const suggestedDateLabels = parsedSuggestedDates
                .slice(0, 5)
                .map((date) => new Date(date).toLocaleDateString("es-AR"))
                .join(", ");
            const ownerVehicleLabel = formatVehicleLabel({
                make: vehicle.make || resolvedMake,
                model: vehicle.model || resolvedModel,
                plateNormalized: vehicle.plateNormalized || normalizedPlate,
            });
            await (0, mailer_1.sendEmail)({
                to: ownerEmail,
                subject: `Nueva solicitud de turno - ${ownerVehicleLabel}`,
                html: `
          <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
            <h2 style="margin: 0 0 12px;">Nueva solicitud de turno</h2>
            <p style="margin: 0 0 12px;">${shopName} recibio una nueva solicitud desde la landing.</p>
            <p style="margin: 0;"><strong>Cliente:</strong> ${snapshotClientName}</p>
            <p style="margin: 0;"><strong>Telefono:</strong> ${ownerPayload.phone}</p>
            ${ownerPayload.email ? `<p style="margin: 0;"><strong>Email:</strong> ${ownerPayload.email}</p>` : ""}
            <p style="margin: 0;"><strong>Vehiculo:</strong> ${ownerVehicleLabel}</p>
            <p style="margin: 0;"><strong>Tipo:</strong> ${mapRequestTypeToLabel(requestType)}</p>
            ${description?.trim() ? `<p style="margin: 0;"><strong>Detalle:</strong> ${description.trim()}</p>` : ""}
            <p style="margin: 12px 0 0;"><strong>Fechas sugeridas:</strong> ${suggestedDateLabels || "-"}</p>
          </div>
        `,
                text: [
                    `${shopName} recibio una nueva solicitud de turno.`,
                    `Cliente: ${snapshotClientName}`,
                    `Telefono: ${ownerPayload.phone}`,
                    ownerPayload.email ? `Email: ${ownerPayload.email}` : "",
                    `Vehiculo: ${ownerVehicleLabel}`,
                    `Tipo: ${mapRequestTypeToLabel(requestType)}`,
                    description?.trim() ? `Detalle: ${description.trim()}` : "",
                    `Fechas sugeridas: ${suggestedDateLabels || "-"}`,
                ]
                    .filter(Boolean)
                    .join("\n"),
            });
        }
    }
    catch (error) {
        console.error("Error enviando email de nueva solicitud al taller:", error);
    }
    res.status(201).json(newRequest);
};
exports.createAppointmentRequest = createAppointmentRequest;
const getAppointmentRequests = async (req, res) => {
    const status = req.query.status;
    const query = {};
    if (status && REQUEST_STATUSES.includes(status)) {
        query.status = status;
    }
    const requests = await AppointmentRequest_1.default.find(query)
        .populate("confirmedAppointmentId")
        .sort({ createdAt: -1 });
    res.json(requests);
};
exports.getAppointmentRequests = getAppointmentRequests;
const confirmAppointmentRequest = async (req, res) => {
    if (!req.user) {
        res.status(401);
        throw new Error("No autorizado");
    }
    const requestDoc = await AppointmentRequest_1.default.findById(req.params.id);
    if (!requestDoc) {
        res.status(404);
        throw new Error("Solicitud no encontrada");
    }
    if (requestDoc.status !== "PENDING") {
        res.status(400);
        throw new Error("Solo se pueden confirmar solicitudes pendientes");
    }
    const { finalDate, entryTime } = req.body;
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
    const appointment = await Appointment_1.default.create({
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
    const settings = await Settings_1.default.findOne();
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
    }
    catch (error) {
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
exports.confirmAppointmentRequest = confirmAppointmentRequest;
const rejectAppointmentRequest = async (req, res) => {
    const requestDoc = await AppointmentRequest_1.default.findById(req.params.id);
    if (!requestDoc) {
        res.status(404);
        throw new Error("Solicitud no encontrada");
    }
    if (requestDoc.status !== "PENDING") {
        res.status(400);
        throw new Error("Solo se pueden rechazar solicitudes pendientes");
    }
    const { rejectionReason } = req.body;
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
    const settings = await Settings_1.default.findOne();
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
    }
    catch (error) {
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
exports.rejectAppointmentRequest = rejectAppointmentRequest;
//# sourceMappingURL=appointmentRequestController.js.map