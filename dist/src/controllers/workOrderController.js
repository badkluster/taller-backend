"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWorkOrder = exports.addEvidence = exports.updateWorkOrder = exports.getWorkOrderById = exports.createWorkOrder = exports.getWorkOrders = void 0;
const WorkOrder_1 = __importDefault(require("../models/WorkOrder"));
const Finance_1 = require("../models/Finance");
const Vehicle_1 = __importDefault(require("../models/Vehicle"));
const Client_1 = __importDefault(require("../models/Client"));
const normalizePlate_1 = require("../utils/normalizePlate");
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const logger_1 = require("../utils/logger");
const calcItemsTotal = (items = []) => items.reduce((acc, item) => acc + (Number(item.qty || 0) * Number(item.unitPrice || 0)), 0);
const calcGrandTotal = (items = [], laborCost = 0, discount = 0) => {
    const itemsTotal = calcItemsTotal(items);
    return itemsTotal + Number(laborCost || 0) - Number(discount || 0);
};
const normalizeItems = (items = []) => items.map((item) => ({
    description: item?.description || '',
    qty: Number(item?.qty || 0),
    unitPrice: Number(item?.unitPrice || 0),
}));
const parseDateBoundary = (rawDate, boundary) => {
    if (!rawDate)
        return null;
    const raw = String(rawDate).trim();
    if (!raw)
        return null;
    const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let date;
    if (ymdMatch) {
        const year = Number(ymdMatch[1]);
        const month = Number(ymdMatch[2]) - 1;
        const day = Number(ymdMatch[3]);
        date =
            boundary === 'start'
                ? new Date(year, month, day, 0, 0, 0, 0)
                : new Date(year, month, day, 23, 59, 59, 999);
    }
    else {
        date = new Date(raw);
        if (Number.isNaN(date.getTime()))
            return null;
        if (boundary === 'start') {
            date.setHours(0, 0, 0, 0);
        }
        else {
            date.setHours(23, 59, 59, 999);
        }
    }
    return Number.isNaN(date.getTime()) ? null : date;
};
const extractCloudinaryPublicId = (url) => {
    if (!url)
        return null;
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
    return match?.[1] || null;
};
const deleteCloudinaryAsset = async (url) => {
    const publicId = extractCloudinaryPublicId(url);
    if (!publicId)
        return;
    try {
        await cloudinary_1.default.uploader.destroy(publicId, { resource_type: 'image' });
    }
    catch (error) {
        try {
            await cloudinary_1.default.uploader.destroy(publicId, { resource_type: 'raw' });
        }
        catch (rawError) {
            try {
                await cloudinary_1.default.uploader.destroy(publicId, { resource_type: 'video' });
            }
            catch {
            }
        }
    }
};
const getWorkOrders = async (req, res) => {
    const pageSize = Number(req.query.pageSize) || 10;
    const page = Number(req.query.pageNumber) || 1;
    const { vehicleId, status, appointmentId, keyword, startDate, endDate } = req.query;
    const query = {};
    if (vehicleId)
        query.vehicleId = vehicleId;
    if (status)
        query.status = status;
    if (appointmentId)
        query.appointmentId = appointmentId;
    if (startDate || endDate) {
        const start = parseDateBoundary(startDate, 'start');
        const end = parseDateBoundary(endDate, 'end');
        if (start || end) {
            query.createdAt = {};
            if (start)
                query.createdAt.$gte = start;
            if (end)
                query.createdAt.$lte = end;
        }
    }
    if (keyword) {
        const term = String(keyword);
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        const [vehicles, clients] = await Promise.all([
            Vehicle_1.default.find({
                $or: [
                    { plateNormalized: { $regex: (0, normalizePlate_1.normalizePlate)(term), $options: 'i' } },
                    { make: regex },
                    { model: regex },
                ],
            }).select('_id'),
            Client_1.default.find({
                $or: [
                    { firstName: regex },
                    { lastName: regex },
                    { email: regex },
                    { phone: { $regex: regex, $options: 'i' } },
                ],
            }).select('_id'),
        ]);
        const vehicleIds = vehicles.map((v) => v._id);
        const clientIds = clients.map((c) => c._id);
        query.$or = [
            { workDetailsText: { $regex: regex, $options: 'i' } },
            ...(vehicleIds.length ? [{ vehicleId: { $in: vehicleIds } }] : []),
            ...(clientIds.length ? [{ clientId: { $in: clientIds } }] : []),
        ];
    }
    const count = await WorkOrder_1.default.countDocuments(query);
    const workOrders = await WorkOrder_1.default.find(query)
        .populate('vehicleId', 'plateNormalized make model')
        .populate('clientId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(pageSize)
        .skip(pageSize * (page - 1));
    res.json({ workOrders, page, pages: Math.ceil(count / pageSize), totalCount: count });
};
exports.getWorkOrders = getWorkOrders;
const createWorkOrder = async (req, res) => {
    const { vehicleId, clientId, appointmentId, category, status, workDetailsText, startAt, endAt, laborCost, discount, total, items } = req.body;
    if (!req.user)
        throw new Error('No autorizado');
    const workOrder = await WorkOrder_1.default.create({
        vehicleId,
        clientId,
        appointmentId,
        category: category || 'GENERAL',
        status: status || 'PRESUPUESTO',
        workDetailsText,
        startAt,
        endAt,
        laborCost,
        discount,
        total: total !== undefined ? total : calcGrandTotal(items || [], laborCost, discount),
        items: items || [],
        createdBy: req.user._id
    });
    res.status(201).json(workOrder);
};
exports.createWorkOrder = createWorkOrder;
const getWorkOrderById = async (req, res) => {
    const workOrder = await WorkOrder_1.default.findById(req.params.id)
        .populate('vehicleId')
        .populate('clientId')
        .populate('appointmentId');
    if (workOrder) {
        res.json(workOrder);
    }
    else {
        res.status(404);
        throw new Error('Orden de Trabajo no encontrada');
    }
};
exports.getWorkOrderById = getWorkOrderById;
const updateWorkOrder = async (req, res) => {
    const workOrder = await WorkOrder_1.default.findById(req.params.id);
    if (workOrder) {
        logger_1.logger.info({
            id: workOrder._id.toString(),
            status: workOrder.status,
            estimatePdfUrl: workOrder.estimatePdfUrl,
            estimateNumber: workOrder.estimateNumber,
            originalEstimatePdfUrl: workOrder.originalEstimatePdfUrl,
            originalEstimateNumber: workOrder.originalEstimateNumber,
            itemsCount: workOrder.items?.length || 0,
            laborCost: workOrder.laborCost,
            discount: workOrder.discount,
            total: workOrder.total,
            incomingKeys: Object.keys(req.body || {}),
        }, 'WO update start');
        console.log('[WO update start]', workOrder._id.toString(), Object.keys(req.body || {}));
        if (workOrder.status === 'COMPLETADA') {
            const allowedKeys = new Set(['status', 'evidence']);
            const incomingKeys = Object.keys(req.body || {});
            const hasForbiddenUpdate = incomingKeys.some((key) => !allowedKeys.has(key));
            const statusChangeRequested = req.body.status && req.body.status !== 'COMPLETADA';
            if (hasForbiddenUpdate && !statusChangeRequested) {
                res.status(400);
                throw new Error('Orden cerrada. Solo se permite agregar evidencia.');
            }
        }
        const itemsChanged = req.body.items &&
            JSON.stringify(normalizeItems(req.body.items)) !==
                JSON.stringify(normalizeItems(workOrder.items || []));
        const laborChanged = req.body.laborCost !== undefined &&
            Number(req.body.laborCost) !== Number(workOrder.laborCost || 0);
        const discountChanged = req.body.discount !== undefined &&
            Number(req.body.discount) !== Number(workOrder.discount || 0);
        const budgetChanged = itemsChanged || laborChanged || discountChanged;
        if (budgetChanged) {
            const nextStatus = (req.body.status || workOrder.status);
            const hasWorkStarted = !!workOrder.workStartedAt ||
                ['EN_PROCESO', 'COMPLETADA'].includes(workOrder.status) ||
                ['EN_PROCESO', 'COMPLETADA'].includes(nextStatus);
            logger_1.logger.info({
                id: workOrder._id.toString(),
                nextStatus,
                hasWorkStarted,
                itemsChanged,
                laborChanged,
                discountChanged,
            }, 'WO budget change detected');
            console.log('[WO budget change]', workOrder._id.toString(), { nextStatus, hasWorkStarted, itemsChanged, laborChanged, discountChanged });
            if (workOrder.invoicePdfUrl) {
                await deleteCloudinaryAsset(workOrder.invoicePdfUrl);
            }
            workOrder.invoicePdfUrl = undefined;
            workOrder.invoiceNumber = undefined;
        }
        const nextStatus = req.body.status || workOrder.status;
        workOrder.status = nextStatus;
        if (!workOrder.workStartedAt && ['EN_PROCESO', 'COMPLETADA'].includes(nextStatus)) {
            workOrder.workStartedAt = new Date();
        }
        workOrder.category = req.body.category || workOrder.category;
        workOrder.workDetailsText = req.body.workDetailsText || workOrder.workDetailsText;
        workOrder.maintenanceDetail = req.body.maintenanceDetail !== undefined ? req.body.maintenanceDetail : workOrder.maintenanceDetail;
        workOrder.maintenanceNotice = req.body.maintenanceNotice !== undefined ? req.body.maintenanceNotice : workOrder.maintenanceNotice;
        workOrder.maintenanceDate = req.body.maintenanceDate !== undefined ? req.body.maintenanceDate : workOrder.maintenanceDate;
        if (req.body.items) {
            workOrder.items = req.body.items;
        }
        if (req.body.evidence) {
            workOrder.evidence = req.body.evidence;
        }
        workOrder.laborCost = req.body.laborCost !== undefined ? req.body.laborCost : workOrder.laborCost;
        workOrder.discount = req.body.discount !== undefined ? req.body.discount : workOrder.discount;
        if (req.body.total !== undefined) {
            workOrder.total = req.body.total;
        }
        else if (req.body.items || req.body.laborCost !== undefined || req.body.discount !== undefined) {
            workOrder.total = calcGrandTotal(workOrder.items, workOrder.laborCost, workOrder.discount);
        }
        workOrder.paymentMethod = req.body.paymentMethod || workOrder.paymentMethod;
        workOrder.startAt = req.body.startAt || workOrder.startAt;
        workOrder.endAt = req.body.endAt || workOrder.endAt;
        let updatedWO = await workOrder.save();
        logger_1.logger.info({
            id: updatedWO._id.toString(),
            status: updatedWO.status,
            estimatePdfUrl: updatedWO.estimatePdfUrl,
            estimateNumber: updatedWO.estimateNumber,
            originalEstimatePdfUrl: updatedWO.originalEstimatePdfUrl,
            originalEstimateNumber: updatedWO.originalEstimateNumber,
            itemsCount: updatedWO.items?.length || 0,
            laborCost: updatedWO.laborCost,
            discount: updatedWO.discount,
            total: updatedWO.total,
        }, 'WO update saved');
        console.log('[WO update saved]', updatedWO._id.toString(), {
            estimatePdfUrl: updatedWO.estimatePdfUrl,
            estimateNumber: updatedWO.estimateNumber,
            originalEstimatePdfUrl: updatedWO.originalEstimatePdfUrl,
            originalEstimateNumber: updatedWO.originalEstimateNumber,
        });
        if (['EN_PROCESO', 'COMPLETADA'].includes(updatedWO.status) &&
            (!updatedWO.originalEstimatePdfUrl || !updatedWO.originalEstimateNumber)) {
            const latestEstimate = await Finance_1.Estimate.findOne({
                $or: [
                    { workOrderId: updatedWO._id },
                    ...(updatedWO.appointmentId ? [{ appointmentId: updatedWO.appointmentId }] : []),
                ],
            }).sort({ createdAt: -1 });
            if (latestEstimate) {
                let shouldSave = false;
                if (!latestEstimate.workOrderId) {
                    latestEstimate.workOrderId = updatedWO._id;
                    await latestEstimate.save();
                }
                if (!updatedWO.estimatePdfUrl && latestEstimate.pdfUrl) {
                    updatedWO.estimatePdfUrl = latestEstimate.pdfUrl;
                    shouldSave = true;
                }
                if (!updatedWO.estimateNumber && latestEstimate.number) {
                    updatedWO.estimateNumber = latestEstimate.number;
                    shouldSave = true;
                }
                const pdfUrl = updatedWO.estimatePdfUrl || latestEstimate.pdfUrl;
                const number = updatedWO.estimateNumber || latestEstimate.number;
                if (pdfUrl && !updatedWO.originalEstimatePdfUrl) {
                    updatedWO.originalEstimatePdfUrl = pdfUrl;
                    shouldSave = true;
                }
                if (number && !updatedWO.originalEstimateNumber) {
                    updatedWO.originalEstimateNumber = number;
                    shouldSave = true;
                }
                if (shouldSave) {
                    updatedWO = await updatedWO.save();
                }
            }
        }
        if (workOrder.appointmentId && req.body.status) {
            const appointmentStatusMap = {
                EN_PROCESO: 'IN_PROGRESS',
                COMPLETADA: 'COMPLETED',
                CANCELADA: 'CANCELLED',
            };
            const mappedStatus = appointmentStatusMap[nextStatus];
            if (mappedStatus) {
                await Appointment_1.default.findByIdAndUpdate(workOrder.appointmentId, {
                    status: mappedStatus,
                });
            }
        }
        res.json(updatedWO);
    }
    else {
        res.status(404);
        throw new Error('Orden de Trabajo no encontrada');
    }
};
exports.updateWorkOrder = updateWorkOrder;
const addEvidence = async (req, res) => {
    const { type, text, url, fileName, mimeType, size } = req.body;
    const workOrder = await WorkOrder_1.default.findById(req.params.id);
    if (workOrder) {
        workOrder.evidence.push({
            type,
            text,
            url,
            fileName,
            mimeType,
            size,
            createdAt: new Date()
        });
        await workOrder.save();
        res.json(workOrder);
    }
    else {
        res.status(404);
        throw new Error('Work Order not found');
    }
};
exports.addEvidence = addEvidence;
const deleteWorkOrder = async (req, res) => {
    const workOrder = await WorkOrder_1.default.findById(req.params.id);
    if (workOrder) {
        const [estimates, invoices] = await Promise.all([
            Finance_1.Estimate.find({ workOrderId: workOrder._id }),
            Finance_1.Invoice.find({ workOrderId: workOrder._id }),
        ]);
        const urls = new Set();
        if (workOrder.estimatePdfUrl)
            urls.add(workOrder.estimatePdfUrl);
        if (workOrder.invoicePdfUrl)
            urls.add(workOrder.invoicePdfUrl);
        (workOrder.evidence || []).forEach((ev) => {
            if (ev?.url)
                urls.add(ev.url);
        });
        estimates.forEach((est) => {
            if (est.pdfUrl)
                urls.add(est.pdfUrl);
        });
        invoices.forEach((inv) => {
            if (inv.pdfUrl)
                urls.add(inv.pdfUrl);
        });
        await Promise.all(Array.from(urls).map((url) => deleteCloudinaryAsset(url)));
        await Finance_1.Estimate.deleteMany({ workOrderId: workOrder._id });
        await Finance_1.Invoice.deleteMany({ workOrderId: workOrder._id });
        await workOrder.deleteOne();
        res.json({ message: 'Orden de Trabajo eliminada' });
    }
    else {
        res.status(404);
        throw new Error('Orden de Trabajo no encontrada');
    }
};
exports.deleteWorkOrder = deleteWorkOrder;
//# sourceMappingURL=workOrderController.js.map