import { Request, Response } from 'express';
import type { Model } from 'mongoose';
import { Estimate, Invoice } from '../models/Finance';
import Sequence from '../models/Sequence';
import WorkOrder from '../models/WorkOrder';
import Vehicle from '../models/Vehicle';
import Client from '../models/Client';
import Settings from '../models/Settings';
import { uploadBufferToCloudinary } from '../utils/cloudinaryUpload';
import { generateEstimatePdf, generateInvoicePdf } from '../utils/pdfGenerator';
import { sendEmail } from '../utils/mailer';
import { estimateEmailTemplate, invoiceEmailTemplate } from '../utils/emailTemplates';
import cloudinary from '../config/cloudinary';

const buildPdfBuffer = async (doc: any) => {
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const endPromise = new Promise<void>((resolve) => doc.on('end', resolve));
  doc.end();
  await endPromise;
  return Buffer.concat(chunks);
};

const uploadPdfAndReturnUrl = async (buffer: Buffer, number: string, kind: 'estimate' | 'invoice') => {
  const folder = 'planb_finance';
  const filenameBase = `${kind === 'estimate' ? 'Presupuesto' : 'Factura'}-${number}`;
  let uploaded: { secure_url: string; public_id: string };
  try {
    // Prefer image delivery for PDFs to avoid raw delivery restrictions (401)
    uploaded = await uploadBufferToCloudinary(buffer, {
      folder,
      resourceType: 'image',
      publicId: filenameBase,
      format: 'pdf',
    });
  } catch (error) {
    try {
      uploaded = await uploadBufferToCloudinary(buffer, {
        folder,
        resourceType: 'raw',
        publicId: `${filenameBase}.pdf`,
      });
    } catch (fallbackError) {
      uploaded = await uploadBufferToCloudinary(buffer, {
        folder,
        resourceType: 'auto',
        publicId: `${filenameBase}.pdf`,
      });
    }
  }
  return { url: uploaded.secure_url, filename: `${filenameBase}.pdf` };
};

const extractCloudinaryPublicId = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
  return match?.[1] || null;
};

const deleteCloudinaryAsset = async (url?: string | null) => {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (error) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch {
      // Ignore delete failures to avoid blocking deletes
    }
  }
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getMaxUsedSequence = async (model: Model<any>, prefix: string) => {
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

const getNextDocumentNumber = async (
  model: Model<any>,
  sequenceKey: string,
  prefix: string,
) => {
  const maxUsedValue = await getMaxUsedSequence(model, prefix);

  // Keep the sequence at least at the max value already used in persisted docs.
  // Avoid updating the same field ("value") via multiple operators in one command.
  await Sequence.updateOne(
    { key: sequenceKey },
    {
      $max: { value: maxUsedValue },
    },
    { upsert: true },
  );

  const sequence = await Sequence.findOneAndUpdate(
    { key: sequenceKey },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );

  if (!sequence) {
    throw new Error(`No se pudo generar numeración para ${sequenceKey}`);
  }

  return `${prefix}${String(sequence.value).padStart(4, '0')}`;
};
// PDF Generation Placeholder - in real app use pdfkit/pdfmake here
// import { generatePDF } from '../utils/pdfGenerator';

// ESTIMATES

// @desc    Create Estimate
// @route   POST /api/estimates
// @access  Private
export const createEstimate = async (req: Request, res: Response) => {
  const { vehicleId, clientId, items, workOrderId, appointmentId, laborCost, discount } = req.body;

  let resolvedVehicleId = vehicleId;
  let resolvedClientId = clientId;
  let workOrderDoc: any = null;
  if (workOrderId) {
    workOrderDoc = await WorkOrder.findById(workOrderId);
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

  const number = await getNextDocumentNumber(Estimate as any, 'estimate_number', 'P-');

  const baseItems = Array.isArray(items) && items.length ? items : (workOrderDoc?.items || []);
  const estimateItems = (baseItems || []).map((item: any) => ({
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
  const itemsTotal = estimateItems.reduce((acc: number, item: any) => acc + Number(item.total || 0), 0);
  const total = itemsTotal + resolvedLaborCost - resolvedDiscount;

  if (itemsTotal <= 0 && resolvedLaborCost <= 0) {
    res.status(400);
    throw new Error('No se puede generar un presupuesto sin items ni mano de obra');
  }

  const estimate = await Estimate.create({
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
      Settings.findOne(),
      resolvedVehicleId ? Vehicle.findById(resolvedVehicleId) : null,
      resolvedClientId ? Client.findById(resolvedClientId) : null,
      workOrderId ? WorkOrder.findById(workOrderId).populate('vehicleId').populate('clientId') : null,
    ]);

    const vehicleLabel = vehicle
      ? `${(vehicle as any).make || ''} ${(vehicle as any).model || ''} (${(vehicle as any).plateNormalized || ''})`
      : workOrder
      ? `${(workOrder as any).vehicleId?.make || ''} ${(workOrder as any).vehicleId?.model || ''} (${(workOrder as any).vehicleId?.plateNormalized || ''})`
      : 'Vehículo';

    const clientName = client
      ? `${(client as any).firstName} ${(client as any).lastName}`
      : workOrder
      ? `${(workOrder as any).clientId?.firstName || ''} ${(workOrder as any).clientId?.lastName || ''}`
      : 'Cliente';

    const pdfDoc = generateEstimatePdf({
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
      const wo = await WorkOrder.findById(workOrderId);
      const hasWorkStarted = !!wo?.workStartedAt || ['EN_PROCESO', 'COMPLETADA'].includes(wo?.status || '');
      if (wo && !hasWorkStarted) {
        wo.estimatePdfUrl = uploaded.url;
        wo.estimateNumber = number;
        await wo.save();
      }
    }
  } catch (error) {
    console.error('Error generando PDF de presupuesto:', error);
  }

  res.status(201).json(estimate);
};

// @desc    Get All Estimates
// @route   GET /api/estimates
// @access  Private
export const getEstimates = async (req: Request, res: Response) => {
  const DEFAULT_PAGE_SIZE = 10;
  const MIN_PAGE_SIZE = 10;
  const MAX_PAGE_SIZE = 50;

  const requestedPageSize = Number(req.query.pageSize);
  const requestedPage = Number(req.query.pageNumber);

  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(requestedPageSize)))
    : DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
  const keyword = req.query.keyword ? String(req.query.keyword) : '';
  const { workOrderId, vehicleId, clientId } = req.query;

  const query: any = {};
  if (workOrderId) query.workOrderId = workOrderId;
  if (vehicleId) query.vehicleId = vehicleId;
  if (clientId) query.clientId = clientId;

  if (keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    query.$or = [{ number: { $regex: regex } }];
  }

  const count = await Estimate.countDocuments(query);
  const estimates = await Estimate.find(query)
    .populate('vehicleId', 'plateNormalized')
    .populate('clientId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ estimates, page, pages: Math.ceil(count / pageSize), totalCount: count });
};

// INVOICES

// @desc    Create Invoice (from WorkOrder)
// @route   POST /api/invoices
// @access  Private
export const createInvoice = async (req: Request, res: Response) => {
  const { workOrderId } = req.body;

  const workOrder = await WorkOrder.findById(workOrderId);
  if (!workOrder) {
    res.status(404);
    throw new Error('Work Order not found');
  }

  const rawItems = Array.isArray(req.body.items) ? req.body.items : (workOrder.items || []);
  const invoiceItems = rawItems.map((item: any) => ({
    description: item.description || '',
    qty: Number(item.qty || 0),
    unitPrice: Number(item.unitPrice || 0),
    total: item.total ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)),
  }));
  const itemsTotal = invoiceItems.reduce((acc: number, item: any) => acc + Number(item.total || 0), 0);
  const laborCost = req.body.laborCost !== undefined ? Number(req.body.laborCost) : Number(workOrder.laborCost || 0);
  const discount = req.body.discount !== undefined ? Number(req.body.discount) : Number(workOrder.discount || 0);
  const total = req.body.total !== undefined
    ? Number(req.body.total)
    : (itemsTotal + laborCost - discount);

  const number = await getNextDocumentNumber(Invoice as any, 'invoice_number', 'A-');

  const invoice = await Invoice.create({
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
      Settings.findOne(),
      Vehicle.findById(workOrder.vehicleId),
      Client.findById(workOrder.clientId),
    ]);

    const vehicleLabel = vehicle
      ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNormalized})`
      : 'Vehículo';
    const clientName = client ? `${client.firstName} ${client.lastName}` : 'Cliente';

    const pdfDoc = generateInvoicePdf({
      number,
      date: new Date(),
      clientName,
      vehicleLabel,
      items: invoiceItems.map((item: any) => ({
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

    await WorkOrder.findByIdAndUpdate(workOrderId, {
      invoicePdfUrl: uploaded.url,
      invoiceNumber: number,
    });
  } catch (error) {
    console.error('Error generando PDF de factura:', error);
  }

  // Close WO if not closed?
  if (workOrder.status !== 'COMPLETADA') {
    workOrder.status = 'COMPLETADA';
    await workOrder.save();
  }

  res.status(201).json(invoice);
};

// @desc    Get All Invoices
// @route   GET /api/invoices
// @access  Private
export const getInvoices = async (req: Request, res: Response) => {
  const DEFAULT_PAGE_SIZE = 10;
  const MIN_PAGE_SIZE = 10;
  const MAX_PAGE_SIZE = 50;

  const requestedPageSize = Number(req.query.pageSize);
  const requestedPage = Number(req.query.pageNumber);

  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(requestedPageSize)))
    : DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
  const keyword = req.query.keyword ? String(req.query.keyword) : '';

  const query: any = {};
  if (keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const [clients, vehicles] = await Promise.all([
      Client.find({
        $or: [
          { firstName: regex },
          { lastName: regex },
          { email: regex },
          { phone: { $regex: regex, $options: 'i' } },
        ],
      }).select('_id'),
      Vehicle.find({
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

  const count = await Invoice.countDocuments(query);
  const invoices = await Invoice.find(query)
    .populate('vehicleId', 'plateNormalized')
    .populate('clientId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  const totalAgg = await Invoice.aggregate([
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

// @desc    Delete Invoice
// @route   DELETE /api/finance/invoices/:id
// @access  Private
export const deleteInvoice = async (req: Request, res: Response) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    res.status(404);
    throw new Error('Factura no encontrada');
  }

  await deleteCloudinaryAsset(invoice.pdfUrl);
  await invoice.deleteOne();

  if (invoice.workOrderId) {
    const workOrder = await WorkOrder.findById(invoice.workOrderId);
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

// @desc    Send Estimate Email
// @route   POST /api/finance/estimates/:id/send
// @access  Private
export const sendEstimateEmail = async (req: Request, res: Response) => {
  const estimate = await Estimate.findById(req.params.id);
  if (!estimate) {
    res.status(404);
    throw new Error('Presupuesto no encontrado');
  }

  const [client, vehicle, settings, workOrder] = await Promise.all([
    Client.findById(estimate.clientId),
    Vehicle.findById(estimate.vehicleId),
    Settings.findOne(),
    estimate.workOrderId ? WorkOrder.findById(estimate.workOrderId) : null,
  ]);

  if (!client?.email) {
    res.status(400);
    throw new Error('El cliente no tiene email');
  }

  const items = (estimate.items && estimate.items.length > 0)
    ? estimate.items.map((item: any) => ({
        description: item.description || '',
        qty: Number(item.qty || 0),
        unitPrice: Number(item.unitPrice || 0),
        total: item.total ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)),
      }))
    : (workOrder?.items || []).map((item: any) => ({
        description: item.description || '',
        qty: Number(item.qty || 0),
        unitPrice: Number(item.unitPrice || 0),
        total: item.total ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)),
      }));
  const laborCost = estimate.laborCost ?? workOrder?.laborCost ?? 0;
  const discount = estimate.discount ?? workOrder?.discount ?? 0;
  const total = estimate.total ?? (items.reduce((acc: number, item: any) => acc + Number(item.total || 0), 0) + laborCost - discount);
  const pdfDoc = generateEstimatePdf({
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

  const template = estimateEmailTemplate({
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

  await sendEmail({
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

// @desc    Send Invoice Email
// @route   POST /api/finance/invoices/:id/send
// @access  Private
export const sendInvoiceEmail = async (req: Request, res: Response) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) {
    res.status(404);
    throw new Error('Factura no encontrada');
  }

  const [client, vehicle, settings, workOrder] = await Promise.all([
    Client.findById(invoice.clientId),
    Vehicle.findById(invoice.vehicleId),
    Settings.findOne(),
    invoice.workOrderId ? WorkOrder.findById(invoice.workOrderId) : null,
  ]);

  if (!client?.email) {
    res.status(400);
    throw new Error('El cliente no tiene email');
  }

  const baseItems = (invoice.items && invoice.items.length > 0)
    ? invoice.items
    : (workOrder?.items || []);
  const invoiceItems = baseItems.map((item: any) => ({
    description: item.description || '',
    qty: item.qty || 0,
    unitPrice: item.unitPrice || 0,
    total: item.total
  }));
  const laborCost = invoice.laborCost ?? workOrder?.laborCost ?? 0;
  const discount = invoice.discount ?? workOrder?.discount ?? 0;
  const total = invoice.total ?? workOrder?.total ?? 0;
  const invoiceDoc = generateInvoicePdf({
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

  const template = invoiceEmailTemplate({
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

  await sendEmail({
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
