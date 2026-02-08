"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvoiceEmail = exports.sendEstimateEmail = exports.deleteInvoice = exports.getInvoices = exports.createInvoice = exports.getEstimates = exports.createEstimate = void 0;
const Finance_1 = require("../models/Finance");
const Sequence_1 = __importDefault(require("../models/Sequence"));
const WorkOrder_1 = __importDefault(require("../models/WorkOrder"));
const Vehicle_1 = __importDefault(require("../models/Vehicle"));
const Client_1 = __importDefault(require("../models/Client"));
const Settings_1 = __importDefault(require("../models/Settings"));
const cloudinaryUpload_1 = require("../utils/cloudinaryUpload");
const pdfGenerator_1 = require("../utils/pdfGenerator");
const mailer_1 = require("../utils/mailer");
const emailTemplates_1 = require("../utils/emailTemplates");
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const buildPdfBuffer = async (doc) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const endPromise = new Promise((resolve) => doc.on('end', resolve));
    doc.end();
    await endPromise;
    return Buffer.concat(chunks);
};
const uploadPdfAndReturnUrl = async (buffer, number, kind) => {
    const folder = 'planb_finance';
    const filenameBase = `${kind === 'estimate' ? 'Presupuesto' : 'Factura'}-${number}`;
    let uploaded;
    try {
        uploaded = await (0, cloudinaryUpload_1.uploadBufferToCloudinary)(buffer, {
            folder,
            resourceType: 'image',
            publicId: filenameBase,
            format: 'pdf',
        });
    }
    catch (error) {
        try {
            uploaded = await (0, cloudinaryUpload_1.uploadBufferToCloudinary)(buffer, {
                folder,
                resourceType: 'raw',
                publicId: `${filenameBase}.pdf`,
            });
        }
        catch (fallbackError) {
            uploaded = await (0, cloudinaryUpload_1.uploadBufferToCloudinary)(buffer, {
                folder,
                resourceType: 'auto',
                publicId: `${filenameBase}.pdf`,
            });
        }
    }
    return { url: uploaded.secure_url, filename: `${filenameBase}.pdf` };
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
        catch {
        }
    }
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const getMaxUsedSequence = async (model, prefix) => {
    const escapedPrefix = escapeRegex(prefix);
    const [maxRow] = await model.aggregate([
        { $match: { number: { $regex: `^${escapedPrefix}[0-9]+$` } } },
        {
            $project: {
                numericValue: {
                    $toInt: { $substrCP: ['$number', prefix.length, -1] },
                },
            },
        },
        { $sort: { numericValue: -1 } },
        { $limit: 1 },
    ]);
    return Number(maxRow?.numericValue || 0);
};
const getNextDocumentNumber = async (model, sequenceKey, prefix) => {
    const maxUsedValue = await getMaxUsedSequence(model, prefix);
    await Sequence_1.default.findOneAndUpdate({ key: sequenceKey }, {
        $setOnInsert: { key: sequenceKey, value: 0 },
        $max: { value: maxUsedValue },
    }, { upsert: true, setDefaultsOnInsert: true });
    const sequence = await Sequence_1.default.findOneAndUpdate({ key: sequenceKey }, { $inc: { value: 1 } }, { new: true });
    if (!sequence) {
        throw new Error(`No se pudo generar numeración para ${sequenceKey}`);
    }
    return `${prefix}${String(sequence.value).padStart(4, '0')}`;
};
const createEstimate = async (req, res) => {
    const { vehicleId, clientId, items, workOrderId, appointmentId, laborCost, discount } = req.body;
    let resolvedVehicleId = vehicleId;
    let resolvedClientId = clientId;
    let workOrderDoc = null;
    if (workOrderId) {
        workOrderDoc = await WorkOrder_1.default.findById(workOrderId);
        if (!workOrderDoc) {
            res.status(404);
            throw new Error('Orden de Trabajo no encontrada');
        }
        resolvedVehicleId = resolvedVehicleId || workOrderDoc.vehicleId;
        resolvedClientId = resolvedClientId || workOrderDoc.clientId;
    }
    if (!resolvedVehicleId || !resolvedClientId) {
        res.status(400);
        throw new Error('vehicleId y clientId son requeridos');
    }
    const number = await getNextDocumentNumber(Finance_1.Estimate, 'estimate_number', 'P-');
    const baseItems = Array.isArray(items) && items.length ? items : (workOrderDoc?.items || []);
    const estimateItems = (baseItems || []).map((item) => ({
        description: item.description || '',
        qty: Number(item.qty || 0),
        unitPrice: Number(item.unitPrice || 0),
        total: item.total ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)),
    }));
    const resolvedLaborCost = laborCost !== undefined
        ? Number(laborCost || 0)
        : Number(workOrderDoc?.laborCost || 0);
    const resolvedDiscount = discount !== undefined
        ? Number(discount || 0)
        : Number(workOrderDoc?.discount || 0);
    const itemsTotal = estimateItems.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const total = itemsTotal + resolvedLaborCost - resolvedDiscount;
    if (itemsTotal <= 0 && resolvedLaborCost <= 0) {
        res.status(400);
        throw new Error('No se puede generar un presupuesto sin items ni mano de obra');
    }
    const estimate = await Finance_1.Estimate.create({
        vehicleId: resolvedVehicleId,
        clientId: resolvedClientId,
        workOrderId,
        appointmentId,
        number,
        total,
        status: 'DRAFT',
        items: estimateItems,
        laborCost: resolvedLaborCost,
        discount: resolvedDiscount,
    });
    try {
        const [settings, vehicle, client, workOrder] = await Promise.all([
            Settings_1.default.findOne(),
            resolvedVehicleId ? Vehicle_1.default.findById(resolvedVehicleId) : null,
            resolvedClientId ? Client_1.default.findById(resolvedClientId) : null,
            workOrderId ? WorkOrder_1.default.findById(workOrderId).populate('vehicleId').populate('clientId') : null,
        ]);
        const vehicleLabel = vehicle
            ? `${vehicle.make || ''} ${vehicle.model || ''} (${vehicle.plateNormalized || ''})`
            : workOrder
                ? `${workOrder.vehicleId?.make || ''} ${workOrder.vehicleId?.model || ''} (${workOrder.vehicleId?.plateNormalized || ''})`
                : 'Vehículo';
        const clientName = client
            ? `${client.firstName} ${client.lastName}`
            : workOrder
                ? `${workOrder.clientId?.firstName || ''} ${workOrder.clientId?.lastName || ''}`
                : 'Cliente';
        const pdfDoc = (0, pdfGenerator_1.generateEstimatePdf)({
            number,
            date: new Date(),
            clientName,
            vehicleLabel,
            items: estimateItems,
            laborCost: resolvedLaborCost,
            discount: resolvedDiscount,
            total,
            shopName: settings?.shopName,
            address: settings?.address ?? undefined,
            phone: settings?.phone ?? undefined,
        });
        const buffer = await buildPdfBuffer(pdfDoc);
        const uploaded = await uploadPdfAndReturnUrl(buffer, number, 'estimate');
        estimate.pdfUrl = uploaded.url;
        await estimate.save();
        if (workOrderId) {
            const wo = await WorkOrder_1.default.findById(workOrderId);
            const hasWorkStarted = !!wo?.workStartedAt || ['EN_PROCESO', 'COMPLETADA'].includes(wo?.status || '');
            if (wo && !hasWorkStarted) {
                wo.estimatePdfUrl = uploaded.url;
                wo.estimateNumber = number;
                await wo.save();
            }
        }
    }
    catch (error) {
        console.error('Error generando PDF de presupuesto:', error);
    }
    res.status(201).json(estimate);
};
exports.createEstimate = createEstimate;
const getEstimates = async (req, res) => {
    const pageSize = Number(req.query.pageSize) || 10;
    const page = Number(req.query.pageNumber) || 1;
    const keyword = req.query.keyword ? String(req.query.keyword) : '';
    const { workOrderId, vehicleId, clientId } = req.query;
    const query = {};
    if (workOrderId)
        query.workOrderId = workOrderId;
    if (vehicleId)
        query.vehicleId = vehicleId;
    if (clientId)
        query.clientId = clientId;
    if (keyword) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        query.$or = [{ number: { $regex: regex } }];
    }
    const count = await Finance_1.Estimate.countDocuments(query);
    const estimates = await Finance_1.Estimate.find(query)
        .populate('vehicleId', 'plateNormalized')
        .populate('clientId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(pageSize)
        .skip(pageSize * (page - 1));
    res.json({ estimates, page, pages: Math.ceil(count / pageSize), totalCount: count });
};
exports.getEstimates = getEstimates;
const createInvoice = async (req, res) => {
    const { workOrderId } = req.body;
    const workOrder = await WorkOrder_1.default.findById(workOrderId);
    if (!workOrder) {
        res.status(404);
        throw new Error('Work Order not found');
    }
    const rawItems = Array.isArray(req.body.items) ? req.body.items : (workOrder.items || []);
    const invoiceItems = rawItems.map((item) => ({
        description: item.description || '',
        qty: Number(item.qty || 0),
        unitPrice: Number(item.unitPrice || 0),
        total: item.total ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)),
    }));
    const itemsTotal = invoiceItems.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const laborCost = req.body.laborCost !== undefined ? Number(req.body.laborCost) : Number(workOrder.laborCost || 0);
    const discount = req.body.discount !== undefined ? Number(req.body.discount) : Number(workOrder.discount || 0);
    const total = req.body.total !== undefined
        ? Number(req.body.total)
        : (itemsTotal + laborCost - discount);
    const number = await getNextDocumentNumber(Finance_1.Invoice, 'invoice_number', 'A-');
    const invoice = await Finance_1.Invoice.create({
        vehicleId: workOrder.vehicleId,
        clientId: workOrder.clientId,
        workOrderId: workOrder._id,
        number,
        items: invoiceItems,
        laborCost,
        discount,
        total,
        paymentMethod: workOrder.paymentMethod,
        issuedAt: new Date()
    });
    try {
        const [settings, vehicle, client] = await Promise.all([
            Settings_1.default.findOne(),
            Vehicle_1.default.findById(workOrder.vehicleId),
            Client_1.default.findById(workOrder.clientId),
        ]);
        const vehicleLabel = vehicle
            ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNormalized})`
            : 'Vehículo';
        const clientName = client ? `${client.firstName} ${client.lastName}` : 'Cliente';
        const pdfDoc = (0, pdfGenerator_1.generateInvoicePdf)({
            number,
            date: new Date(),
            clientName,
            vehicleLabel,
            items: invoiceItems.map((item) => ({
                description: item.description || '',
                qty: item.qty || 0,
                unitPrice: item.unitPrice || 0,
                total: item.total
            })),
            laborCost,
            discount,
            total,
            shopName: settings?.shopName,
            address: settings?.address ?? undefined,
            phone: settings?.phone ?? undefined,
        });
        const buffer = await buildPdfBuffer(pdfDoc);
        const uploaded = await uploadPdfAndReturnUrl(buffer, number, 'invoice');
        invoice.pdfUrl = uploaded.url;
        await invoice.save();
        await WorkOrder_1.default.findByIdAndUpdate(workOrderId, {
            invoicePdfUrl: uploaded.url,
            invoiceNumber: number,
        });
    }
    catch (error) {
        console.error('Error generando PDF de factura:', error);
    }
    if (workOrder.status !== 'COMPLETADA') {
        workOrder.status = 'COMPLETADA';
        await workOrder.save();
    }
    res.status(201).json(invoice);
};
exports.createInvoice = createInvoice;
const getInvoices = async (req, res) => {
    const pageSize = Number(req.query.pageSize) || 10;
    const page = Number(req.query.pageNumber) || 1;
    const keyword = req.query.keyword ? String(req.query.keyword) : '';
    const query = {};
    if (keyword) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        const [clients, vehicles] = await Promise.all([
            Client_1.default.find({
                $or: [
                    { firstName: regex },
                    { lastName: regex },
                    { email: regex },
                    { phone: { $regex: regex, $options: 'i' } },
                ],
            }).select('_id'),
            Vehicle_1.default.find({
                $or: [
                    { plateNormalized: { $regex: keyword.replace(/[^A-Z0-9]/gi, ''), $options: 'i' } },
                    { make: regex },
                    { model: regex },
                ],
            }).select('_id'),
        ]);
        const clientIds = clients.map((c) => c._id);
        const vehicleIds = vehicles.map((v) => v._id);
        query.$or = [
            { number: { $regex: regex } },
            ...(clientIds.length ? [{ clientId: { $in: clientIds } }] : []),
            ...(vehicleIds.length ? [{ vehicleId: { $in: vehicleIds } }] : []),
        ];
    }
    const count = await Finance_1.Invoice.countDocuments(query);
    const invoices = await Finance_1.Invoice.find(query)
        .populate('vehicleId', 'plateNormalized')
        .populate('clientId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(pageSize)
        .skip(pageSize * (page - 1));
    const totalAgg = await Finance_1.Invoice.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    res.json({
        invoices,
        page,
        pages: Math.ceil(count / pageSize),
        totalCount: count,
        totalAmount: totalAgg[0]?.total || 0,
    });
};
exports.getInvoices = getInvoices;
const deleteInvoice = async (req, res) => {
    const invoice = await Finance_1.Invoice.findById(req.params.id);
    if (!invoice) {
        res.status(404);
        throw new Error('Factura no encontrada');
    }
    await deleteCloudinaryAsset(invoice.pdfUrl);
    await invoice.deleteOne();
    if (invoice.workOrderId) {
        const workOrder = await WorkOrder_1.default.findById(invoice.workOrderId);
        if (workOrder) {
            const shouldClearInvoice = !workOrder.invoiceNumber || workOrder.invoiceNumber === invoice.number;
            if (shouldClearInvoice) {
                workOrder.invoicePdfUrl = undefined;
                workOrder.invoiceNumber = undefined;
            }
            const reopen = req.query.reopen === 'true' || req.query.reopen === '1';
            if (reopen && workOrder.status === 'COMPLETADA') {
                workOrder.status = 'EN_PROCESO';
            }
            await workOrder.save();
        }
    }
    res.json({ message: 'Factura eliminada' });
};
exports.deleteInvoice = deleteInvoice;
const sendEstimateEmail = async (req, res) => {
    const estimate = await Finance_1.Estimate.findById(req.params.id);
    if (!estimate) {
        res.status(404);
        throw new Error('Presupuesto no encontrado');
    }
    const [client, vehicle, settings, workOrder] = await Promise.all([
        Client_1.default.findById(estimate.clientId),
        Vehicle_1.default.findById(estimate.vehicleId),
        Settings_1.default.findOne(),
        estimate.workOrderId ? WorkOrder_1.default.findById(estimate.workOrderId) : null,
    ]);
    if (!client?.email) {
        res.status(400);
        throw new Error('El cliente no tiene email');
    }
    const items = (estimate.items && estimate.items.length > 0)
        ? estimate.items.map((item) => ({
            description: item.description || '',
            qty: Number(item.qty || 0),
            unitPrice: Number(item.unitPrice || 0),
            total: item.total ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)),
        }))
        : (workOrder?.items || []).map((item) => ({
            description: item.description || '',
            qty: Number(item.qty || 0),
            unitPrice: Number(item.unitPrice || 0),
            total: item.total ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)),
        }));
    const laborCost = estimate.laborCost ?? workOrder?.laborCost ?? 0;
    const discount = estimate.discount ?? workOrder?.discount ?? 0;
    const total = estimate.total ?? (items.reduce((acc, item) => acc + Number(item.total || 0), 0) + laborCost - discount);
    const pdfDoc = (0, pdfGenerator_1.generateEstimatePdf)({
        number: estimate.number,
        date: new Date(),
        clientName: `${client.firstName} ${client.lastName}`,
        vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNormalized})` : 'Vehículo',
        items,
        laborCost,
        discount,
        total,
        shopName: settings?.shopName,
        address: settings?.address ?? undefined,
        phone: settings?.phone ?? undefined,
    });
    const pdfBuffer = await buildPdfBuffer(pdfDoc);
    const needsReupload = !!estimate.pdfUrl && estimate.pdfUrl.includes('/raw/upload/');
    if (!estimate.pdfUrl || needsReupload) {
        const uploaded = await uploadPdfAndReturnUrl(pdfBuffer, estimate.number, 'estimate');
        estimate.pdfUrl = uploaded.url;
        await estimate.save();
        if (workOrder) {
            workOrder.estimatePdfUrl = uploaded.url;
            workOrder.estimateNumber = estimate.number;
            await workOrder.save();
        }
    }
    const template = (0, emailTemplates_1.estimateEmailTemplate)({
        estimateNumber: estimate.number,
        total: estimate.total,
        pdfUrl: estimate.pdfUrl ?? undefined,
        clientName: `${client.firstName} ${client.lastName}`,
        vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNormalized})` : 'Vehículo',
        settings: {
            shopName: settings?.shopName,
            address: settings?.address ?? undefined,
            phone: settings?.phone ?? undefined,
            emailFrom: settings?.emailFrom ?? undefined,
            logoUrl: settings?.logoUrl ?? undefined,
        },
    });
    await (0, mailer_1.sendEmail)({
        to: client.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        bcc: settings?.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER,
        attachments: [{
                filename: `Presupuesto-${estimate.number}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            }],
    });
    estimate.status = 'SENT';
    estimate.sentAt = new Date();
    estimate.channelsUsed = [...(estimate.channelsUsed || []), 'EMAIL'];
    await estimate.save();
    res.json({ message: 'Presupuesto enviado' });
};
exports.sendEstimateEmail = sendEstimateEmail;
const sendInvoiceEmail = async (req, res) => {
    const invoice = await Finance_1.Invoice.findById(req.params.id);
    if (!invoice) {
        res.status(404);
        throw new Error('Factura no encontrada');
    }
    const [client, vehicle, settings, workOrder] = await Promise.all([
        Client_1.default.findById(invoice.clientId),
        Vehicle_1.default.findById(invoice.vehicleId),
        Settings_1.default.findOne(),
        invoice.workOrderId ? WorkOrder_1.default.findById(invoice.workOrderId) : null,
    ]);
    if (!client?.email) {
        res.status(400);
        throw new Error('El cliente no tiene email');
    }
    const baseItems = (invoice.items && invoice.items.length > 0)
        ? invoice.items
        : (workOrder?.items || []);
    const invoiceItems = baseItems.map((item) => ({
        description: item.description || '',
        qty: item.qty || 0,
        unitPrice: item.unitPrice || 0,
        total: item.total
    }));
    const laborCost = invoice.laborCost ?? workOrder?.laborCost ?? 0;
    const discount = invoice.discount ?? workOrder?.discount ?? 0;
    const total = invoice.total ?? workOrder?.total ?? 0;
    const invoiceDoc = (0, pdfGenerator_1.generateInvoicePdf)({
        number: invoice.number,
        date: new Date(),
        clientName: `${client.firstName} ${client.lastName}`,
        vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNormalized})` : 'Vehículo',
        items: invoiceItems,
        laborCost,
        discount,
        total,
        shopName: settings?.shopName,
        address: settings?.address ?? undefined,
        phone: settings?.phone ?? undefined,
    });
    const invoiceBuffer = await buildPdfBuffer(invoiceDoc);
    const needsReupload = !!invoice.pdfUrl && invoice.pdfUrl.includes('/raw/upload/');
    if (!invoice.pdfUrl || needsReupload) {
        const uploaded = await uploadPdfAndReturnUrl(invoiceBuffer, invoice.number, 'invoice');
        invoice.pdfUrl = uploaded.url;
        await invoice.save();
        if (workOrder) {
            workOrder.invoicePdfUrl = uploaded.url;
            workOrder.invoiceNumber = invoice.number;
            await workOrder.save();
        }
    }
    const template = (0, emailTemplates_1.invoiceEmailTemplate)({
        invoiceNumber: invoice.number,
        total: invoice.total,
        pdfUrl: invoice.pdfUrl ?? undefined,
        clientName: `${client.firstName} ${client.lastName}`,
        vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNormalized})` : 'Vehículo',
        settings: {
            shopName: settings?.shopName,
            address: settings?.address ?? undefined,
            phone: settings?.phone ?? undefined,
            emailFrom: settings?.emailFrom ?? undefined,
            logoUrl: settings?.logoUrl ?? undefined,
        },
    });
    await (0, mailer_1.sendEmail)({
        to: client.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        bcc: settings?.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER,
        attachments: [{
                filename: `Factura-${invoice.number}.pdf`,
                content: invoiceBuffer,
                contentType: 'application/pdf',
            }],
    });
    invoice.sentAt = new Date();
    await invoice.save();
    res.json({ message: 'Factura enviada' });
};
exports.sendInvoiceEmail = sendInvoiceEmail;
//# sourceMappingURL=financeController.js.map