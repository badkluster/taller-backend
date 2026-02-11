import { Request, Response } from 'express';
import type { Model } from 'mongoose';
import { Estimate, Invoice } from '../models/Finance';
import ClientPrepaidMovement from '../models/ClientPrepaidMovement';
import Sequence from '../models/Sequence';
import WorkOrder from '../models/WorkOrder';
import Vehicle from '../models/Vehicle';
import Client from '../models/Client';
import Settings from '../models/Settings';
import { uploadBufferToCloudinary } from '../utils/cloudinaryUpload';
import { generateEstimatePdf, generateInvoicePdf } from '../utils/pdfGenerator';
import { sendEmail } from '../utils/mailer';
import {
  estimateEmailTemplate,
  invoiceEmailTemplate,
  prepaidOfferEmailTemplate,
} from '../utils/emailTemplates';
import cloudinary from '../config/cloudinary';

const DEFAULT_ESTIMATE_VALIDITY_DAYS = 15;
const MAX_ESTIMATE_VALIDITY_DAYS = 365;
const DEFAULT_PREPAID_REMINDER_DAY = 5;

const resolveEstimateValidityDays = (settingsDoc?: any) => {
  const rawValue = Number(settingsDoc?.estimateValidityDays);
  if (!Number.isFinite(rawValue)) {
    return DEFAULT_ESTIMATE_VALIDITY_DAYS;
  }
  const normalized = Math.floor(rawValue);
  if (normalized < 1 || normalized > MAX_ESTIMATE_VALIDITY_DAYS) {
    return DEFAULT_ESTIMATE_VALIDITY_DAYS;
  }
  return normalized;
};

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
          $toInt: {
            $substrCP: [
              '$number',
              prefix.length,
              { $subtract: [{ $strLenCP: '$number' }, prefix.length] },
            ],
          },
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

const normalizePhone = (phone?: string | null) =>
  String(phone || '').replace(/[^0-9]/g, '');

const toMoney = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
};

const ensurePositiveMoney = (value: unknown, fieldLabel: string) => {
  const amount = toMoney(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldLabel} debe ser mayor a 0`);
  }
  return amount;
};

const getClientDisplayName = (client?: any) =>
  `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Cliente';

const buildVehicleLabel = (vehicle?: any, fallback = 'Vehículo') => {
  if (!vehicle) return fallback;
  const make = String(vehicle.make || '').trim();
  const model = String(vehicle.model || '').trim();
  const plate = String(vehicle.plateNormalized || '').trim();
  const joined = [make, model].filter(Boolean).join(' ').trim();
  if (joined && plate) return `${joined} (${plate})`;
  if (joined) return joined;
  if (plate) return plate;
  return fallback;
};

const replaceTemplateTokens = (template: string, vars: Record<string, string>) => {
  return Object.entries(vars).reduce((acc, [key, value]) => {
    const token = new RegExp(`{{\\s*${escapeRegex(key)}\\s*}}`, 'gi');
    return acc.replace(token, value);
  }, template);
};

const buildInvoiceWhatsAppUrl = (params: {
  phone?: string | null;
  shopName?: string;
  clientFirstName?: string;
  invoiceNumber?: string;
  vehicleLabel?: string;
  pdfUrl?: string;
}) => {
  const digits = normalizePhone(params.phone);
  if (!digits) return null;
  const safePdfUrl = params.pdfUrl || '';
  if (!safePdfUrl) return null;

  const shopName = params.shopName || 'Taller';
  const firstName = String(params.clientFirstName || '').trim();
  const invoiceNumberBlock = params.invoiceNumber ? ` (${params.invoiceNumber})` : '';
  const vehicleBlock = params.vehicleLabel ? ` de ${params.vehicleLabel}` : '';
  const message = `*${shopName}*\n\nHola ${firstName || 'cliente'}, te compartimos la factura${invoiceNumberBlock}${vehicleBlock}.\n\nPDF: ${safePdfUrl}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

const creditClientBalanceAndCreateMovement = async (params: {
  clientId: string;
  amount: number;
  type: 'DEPOSIT' | 'ADJUSTMENT_PLUS';
  note?: string;
  source?: 'MANUAL' | 'SYSTEM';
  createdBy?: string;
}) => {
  const amount = ensurePositiveMoney(params.amount, 'El monto');
  const updatedClient = await Client.findByIdAndUpdate(
    params.clientId,
    { $inc: { prepaidBalance: amount } },
    { new: true },
  );
  if (!updatedClient) {
    throw new Error('Cliente no encontrado');
  }
  const balanceAfter = toMoney(updatedClient.prepaidBalance || 0);
  const balanceBefore = toMoney(balanceAfter - amount);

  const movement = await ClientPrepaidMovement.create({
    clientId: updatedClient._id,
    type: params.type,
    direction: 'CREDIT',
    amount,
    balanceBefore,
    balanceAfter,
    note: params.note || undefined,
    source: params.source || 'MANUAL',
    createdBy: params.createdBy || undefined,
  });

  return { updatedClient, movement, balanceBefore, balanceAfter, amount };
};

const debitClientBalanceAndCreateMovement = async (params: {
  clientId: string;
  amount: number;
  type: 'USAGE_INVOICE' | 'ADJUSTMENT_MINUS' | 'REFUND';
  note?: string;
  source?: 'INVOICE_FLOW' | 'MANUAL' | 'SYSTEM';
  workOrderId?: string;
  invoiceId?: string;
  createdBy?: string;
}) => {
  const amount = ensurePositiveMoney(params.amount, 'El monto');
  const updatedClient = await Client.findOneAndUpdate(
    {
      _id: params.clientId,
      prepaidBalance: { $gte: amount },
    },
    { $inc: { prepaidBalance: -amount } },
    { new: true },
  );

  if (!updatedClient) {
    throw new Error('Saldo a favor insuficiente para aplicar ese monto');
  }

  const balanceAfter = toMoney(updatedClient.prepaidBalance || 0);
  const balanceBefore = toMoney(balanceAfter + amount);

  const movement = await ClientPrepaidMovement.create({
    clientId: updatedClient._id,
    type: params.type,
    direction: 'DEBIT',
    amount,
    balanceBefore,
    balanceAfter,
    note: params.note || undefined,
    source: params.source || 'INVOICE_FLOW',
    workOrderId: params.workOrderId || undefined,
    invoiceId: params.invoiceId || undefined,
    createdBy: params.createdBy || undefined,
  });

  return { updatedClient, movement, balanceBefore, balanceAfter, amount };
};

const generateAndAttachInvoicePdf = async (params: {
  invoice: any;
  settings: any;
  clientName: string;
  vehicleLabel: string;
}) => {
  const baseItems = (params.invoice.items || []).map((item: any) => ({
    description: item.description || '',
    qty: Number(item.qty || 0),
    unitPrice: Number(item.unitPrice || 0),
    total: Number(item.total || 0),
  }));

  const pdfDoc = generateInvoicePdf({
    number: params.invoice.number,
    date: params.invoice.issuedAt ? new Date(params.invoice.issuedAt) : new Date(),
    clientName: params.clientName,
    vehicleLabel: params.vehicleLabel,
    items: baseItems,
    laborCost: Number(params.invoice.laborCost || 0),
    discount: Number(params.invoice.discount || 0),
    total: Number(params.invoice.total || 0),
    prepaidApplied: Number(params.invoice.prepaidApplied || 0),
    clientComment: params.invoice.clientComment || undefined,
    shopName: params.settings?.shopName,
    address: params.settings?.address ?? undefined,
    phone: params.settings?.phone ?? undefined,
  });
  const buffer = await buildPdfBuffer(pdfDoc);
  const uploaded = await uploadPdfAndReturnUrl(buffer, params.invoice.number, 'invoice');
  params.invoice.pdfUrl = uploaded.url;
  await params.invoice.save();
  return { uploadedUrl: uploaded.url, pdfBuffer: buffer };
};

const sendInvoiceEmailNow = async (params: {
  invoice: any;
  client: any;
  vehicleLabel: string;
  settings: any;
  prebuiltBuffer?: Buffer;
}) => {
  if (!params.client?.email) {
    throw new Error('El cliente no tiene email');
  }
  const clientName = getClientDisplayName(params.client);
  const template = invoiceEmailTemplate({
    invoiceNumber: params.invoice.number,
    total: Number(params.invoice.total || 0),
    pdfUrl: params.invoice.pdfUrl ?? undefined,
    clientName,
    vehicleLabel: params.vehicleLabel,
    prepaidApplied: Number(params.invoice.prepaidApplied || 0),
    invoiceType:
      params.invoice.invoiceType === 'PREPAID_DEPOSIT'
        ? 'PREPAID_DEPOSIT'
        : 'WORK_ORDER',
    settings: {
      shopName: params.settings?.shopName,
      address: params.settings?.address ?? undefined,
      phone: params.settings?.phone ?? undefined,
      emailFrom: params.settings?.emailFrom ?? undefined,
      logoUrl: params.settings?.logoUrl ?? undefined,
    },
  });

  const attachmentBuffer = params.prebuiltBuffer
    ? params.prebuiltBuffer
    : await buildPdfBuffer(
        generateInvoicePdf({
          number: params.invoice.number,
          date: params.invoice.issuedAt ? new Date(params.invoice.issuedAt) : new Date(),
          clientName,
          vehicleLabel: params.vehicleLabel,
          items: (params.invoice.items || []).map((item: any) => ({
            description: item.description || '',
            qty: Number(item.qty || 0),
            unitPrice: Number(item.unitPrice || 0),
            total: Number(item.total || 0),
          })),
          laborCost: Number(params.invoice.laborCost || 0),
          discount: Number(params.invoice.discount || 0),
          total: Number(params.invoice.total || 0),
          prepaidApplied: Number(params.invoice.prepaidApplied || 0),
          clientComment: params.invoice.clientComment || undefined,
          shopName: params.settings?.shopName,
          address: params.settings?.address ?? undefined,
          phone: params.settings?.phone ?? undefined,
        }),
      );

  await sendEmail({
    to: params.client.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    bcc: params.settings?.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER,
    attachments: [{
      filename: `Factura-${params.invoice.number}.pdf`,
      content: attachmentBuffer,
      contentType: 'application/pdf',
    }],
  });

  params.invoice.sentAt = new Date();
  await params.invoice.save();
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

  const settings = await Settings.findOne();
  const estimateValidityDays = resolveEstimateValidityDays(settings);
  const estimateIssuedAt = new Date();
  const estimateValidUntil = new Date(estimateIssuedAt);
  estimateValidUntil.setDate(
    estimateValidUntil.getDate() + estimateValidityDays,
  );

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
  const resolvedClientComment = req.body.clientComment !== undefined
    ? String(req.body.clientComment || '').trim()
    : String(workOrderDoc?.clientComment || '').trim();
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
    validityDays: estimateValidityDays,
    validUntil: estimateValidUntil,
    clientComment: resolvedClientComment,
  });

  try {
    const [vehicle, client, workOrder] = await Promise.all([
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
      date: estimateIssuedAt,
      clientName,
      vehicleLabel,
      items: estimateItems,
      laborCost: resolvedLaborCost,
      discount: resolvedDiscount,
      total,
      validityDays: estimateValidityDays,
      validUntil: estimateValidUntil,
      clientComment: resolvedClientComment || undefined,
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
  const clientComment = req.body.clientComment !== undefined
    ? String(req.body.clientComment || '').trim()
    : String(workOrder.clientComment || '').trim();
  const baseTotal = req.body.total !== undefined
    ? Number(req.body.total)
    : (itemsTotal + laborCost - discount);
  const requestedPrepaidUsage = toMoney(req.body.prepaidUsageAmount || 0);

  if (requestedPrepaidUsage < 0) {
    res.status(400);
    throw new Error('El saldo a favor aplicado no puede ser negativo');
  }

  if (requestedPrepaidUsage > baseTotal) {
    res.status(400);
    throw new Error('El saldo a favor aplicado no puede superar el total de la factura');
  }

  let prepaidApplied = 0;
  if (requestedPrepaidUsage > 0) {
    const client = await Client.findById(workOrder.clientId).select('prepaidEligible');
    if (!client) {
      res.status(404);
      throw new Error('Cliente no encontrado para aplicar saldo');
    }
    if (!client.prepaidEligible) {
      res.status(400);
      throw new Error('El cliente no tiene habilitado saldo a favor');
    }
    prepaidApplied = requestedPrepaidUsage;
  }

  const total = toMoney(Math.max(0, baseTotal - prepaidApplied));

  const number = await getNextDocumentNumber(Invoice as any, 'invoice_number', 'A-');

  const invoice = await Invoice.create({
    vehicleId: workOrder.vehicleId,
    clientId: workOrder.clientId,
    workOrderId: workOrder._id,
    number,
    items: invoiceItems,
    laborCost,
    discount,
    prepaidApplied,
    clientComment,
    total,
    invoiceType: 'WORK_ORDER',
    paymentMethod: workOrder.paymentMethod,
    issuedAt: new Date()
  });

  if (prepaidApplied > 0) {
    try {
      const debitResult = await debitClientBalanceAndCreateMovement({
        clientId: String(workOrder.clientId),
        amount: prepaidApplied,
        type: 'USAGE_INVOICE',
        note: `Aplicado en factura ${number}`,
        source: 'INVOICE_FLOW',
        workOrderId: String(workOrder._id),
        invoiceId: String(invoice._id),
        createdBy: (req as any).user?._id ? String((req as any).user?._id) : undefined,
      });
      invoice.prepaidMovementId = debitResult.movement._id;
      await invoice.save();
    } catch (error: any) {
      await invoice.deleteOne();
      res.status(400);
      throw new Error(error?.message || 'No se pudo aplicar saldo a favor');
    }
  }

  try {
    const [settings, vehicle, client] = await Promise.all([
      Settings.findOne(),
      Vehicle.findById(workOrder.vehicleId),
      Client.findById(workOrder.clientId),
    ]);

    const vehicleLabel = buildVehicleLabel(vehicle, 'Vehículo');
    const clientName = getClientDisplayName(client);
    const { uploadedUrl } = await generateAndAttachInvoicePdf({
      invoice,
      settings,
      clientName,
      vehicleLabel,
    });

    await WorkOrder.findByIdAndUpdate(workOrderId, {
      invoicePdfUrl: uploadedUrl,
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
  const invoiceType = req.query.invoiceType ? String(req.query.invoiceType) : '';

  const query: any = {};
  if (invoiceType) {
    query.invoiceType = invoiceType;
  }
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

  const totalsAgg = await Invoice.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalBilled: { $sum: { $ifNull: ['$total', 0] } },
        totalRealIncome: { $sum: { $ifNull: ['$laborCost', 0] } },
        totalPrepaidApplied: { $sum: { $ifNull: ['$prepaidApplied', 0] } },
      },
    },
  ]);

  const totalBilled = Number(totalsAgg?.[0]?.totalBilled || 0);
  const totalRealIncome = Number(totalsAgg?.[0]?.totalRealIncome || 0);
  const totalPrepaidApplied = Number(totalsAgg?.[0]?.totalPrepaidApplied || 0);
  const normalizedInvoices = invoices.map((invoice: any) => {
    const raw = invoice?.toObject ? invoice.toObject() : invoice;
    return {
      ...raw,
      totalBilled: Number(raw?.total || 0),
      realIncome: Number(raw?.laborCost || 0),
      prepaidApplied: Number(raw?.prepaidApplied || 0),
    };
  });

  res.json({
    invoices: normalizedInvoices,
    page,
    pages: Math.ceil(count / pageSize),
    totalCount: count,
    totalAmount: totalBilled,
    totalBilled,
    totalRealIncome,
    totalPrepaidApplied,
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

  if (invoice.invoiceType === 'PREPAID_DEPOSIT') {
    try {
      await debitClientBalanceAndCreateMovement({
        clientId: String(invoice.clientId),
        amount: Number(invoice.total || 0),
        type: 'ADJUSTMENT_MINUS',
        note: `Reverso por eliminación de factura de depósito ${invoice.number}`,
        source: 'MANUAL',
        invoiceId: String(invoice._id),
        createdBy: (req as any).user?._id ? String((req as any).user?._id) : undefined,
      });
    } catch (error: any) {
      res.status(400);
      throw new Error(
        error?.message ||
          'No se puede eliminar la factura de depósito porque el saldo ya fue utilizado',
      );
    }
  } else if (Number(invoice.prepaidApplied || 0) > 0) {
    await creditClientBalanceAndCreateMovement({
      clientId: String(invoice.clientId),
      amount: Number(invoice.prepaidApplied || 0),
      type: 'ADJUSTMENT_PLUS',
      note: `Reintegro por eliminación de factura ${invoice.number}`,
      source: 'MANUAL',
      createdBy: (req as any).user?._id ? String((req as any).user?._id) : undefined,
    });
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
  const clientCommentSource = workOrder?.clientComment !== undefined
    ? workOrder.clientComment
    : estimate.clientComment;
  const clientComment = String(clientCommentSource ?? '').trim();
  const configuredValidityDays = resolveEstimateValidityDays(settings);
  const persistedValidityDays = Number((estimate as any).validityDays);
  const estimateValidityDays = Number.isFinite(persistedValidityDays) &&
    persistedValidityDays >= 1 &&
    persistedValidityDays <= MAX_ESTIMATE_VALIDITY_DAYS
    ? Math.floor(persistedValidityDays)
    : configuredValidityDays;
  const persistedValidUntil = (estimate as any).validUntil
    ? new Date((estimate as any).validUntil)
    : null;
  const baseEstimateDate = estimate.createdAt
    ? new Date(estimate.createdAt)
    : new Date();
  const resolvedValidUntil = persistedValidUntil &&
    !Number.isNaN(persistedValidUntil.getTime())
    ? persistedValidUntil
    : (() => {
        const next = new Date(baseEstimateDate);
        next.setDate(next.getDate() + estimateValidityDays);
        return next;
      })();

  let shouldPersistEstimate = false;

  if ((estimate.clientComment || '') !== clientComment) {
    estimate.clientComment = clientComment;
    shouldPersistEstimate = true;
  }
  if (Number((estimate as any).validityDays || 0) !== estimateValidityDays) {
    (estimate as any).validityDays = estimateValidityDays;
    shouldPersistEstimate = true;
  }
  if (!(estimate as any).validUntil || Number(new Date((estimate as any).validUntil).getTime()) !== Number(resolvedValidUntil.getTime())) {
    (estimate as any).validUntil = resolvedValidUntil;
    shouldPersistEstimate = true;
  }
  if (shouldPersistEstimate) {
    await estimate.save();
  }

  const pdfDoc = generateEstimatePdf({
    number: estimate.number,
    date: new Date(),
    clientName: `${client.firstName} ${client.lastName}`,
    vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNormalized})` : 'Vehículo',
    items,
    laborCost,
    discount,
    total,
    validityDays: estimateValidityDays,
    validUntil: resolvedValidUntil,
    clientComment: clientComment || undefined,
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
    validityDays: estimateValidityDays,
    validUntil: resolvedValidUntil,
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
    invoice.vehicleId ? Vehicle.findById(invoice.vehicleId) : null,
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
  const clientCommentSource = workOrder?.clientComment !== undefined
    ? workOrder.clientComment
    : invoice.clientComment;
  const clientComment = String(clientCommentSource ?? '').trim();

  if ((invoice.clientComment || '') !== clientComment) {
    invoice.clientComment = clientComment;
    await invoice.save();
  }

  const vehicleLabel =
    invoice.invoiceType === 'PREPAID_DEPOSIT'
      ? 'Saldo a favor'
      : buildVehicleLabel(vehicle, 'Vehículo');
  const clientName = getClientDisplayName(client);
  const invoiceDoc = generateInvoicePdf({
    number: invoice.number,
    date: new Date(),
    clientName,
    vehicleLabel,
    items: invoiceItems,
    laborCost,
    discount,
    total,
    prepaidApplied: Number(invoice.prepaidApplied || 0),
    clientComment: clientComment || undefined,
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
    if (workOrder && invoice.invoiceType !== 'PREPAID_DEPOSIT') {
      workOrder.invoicePdfUrl = uploaded.url;
      workOrder.invoiceNumber = invoice.number;
      await workOrder.save();
    }
  }

  await sendInvoiceEmailNow({
    invoice,
    client,
    vehicleLabel,
    settings,
    prebuiltBuffer: invoiceBuffer,
  });

  res.json({ message: 'Factura enviada' });
};

const buildPrepaidTemplateVars = (params: {
  client: any;
  settings: any;
  balance?: number;
}) => {
  return {
    nombre: getClientDisplayName(params.client),
    saldo: new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(Number(params.balance || 0)),
    taller: String(params.settings?.shopName || 'Taller'),
  };
};

export const updateClientPrepaidConfig = async (req: Request, res: Response) => {
  const client = await Client.findById(req.params.clientId);
  if (!client) {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }

  if (req.body.prepaidEligible !== undefined) {
    client.prepaidEligible = Boolean(req.body.prepaidEligible);
  }

  await client.save();
  res.json({
    _id: client._id,
    prepaidEligible: client.prepaidEligible,
    prepaidBalance: Number(client.prepaidBalance || 0),
    prepaidLastReminderMonth: client.prepaidLastReminderMonth || null,
    prepaidOfferSentAt: client.prepaidOfferSentAt || null,
  });
};

export const getClientPrepaidSummary = async (req: Request, res: Response) => {
  const client = await Client.findById(req.params.clientId);
  if (!client) {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }

  const recentMovements = await ClientPrepaidMovement.find({
    clientId: client._id,
  })
    .populate('invoiceId', 'number')
    .populate('workOrderId', '_id')
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    clientId: client._id,
    prepaidEligible: Boolean(client.prepaidEligible),
    balance: Number(client.prepaidBalance || 0),
    lastReminderMonth: client.prepaidLastReminderMonth || null,
    recentMovements,
  });
};

export const getClientPrepaidMovements = async (req: Request, res: Response) => {
  const client = await Client.findById(req.params.clientId);
  if (!client) {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }

  const requestedPageSize = Number(req.query.pageSize);
  const requestedPage = Number(req.query.pageNumber);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(100, Math.max(10, Math.floor(requestedPageSize)))
    : 20;
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;

  const query = { clientId: client._id };
  const count = await ClientPrepaidMovement.countDocuments(query);
  const movements = await ClientPrepaidMovement.find(query)
    .populate('createdBy', 'name email')
    .populate('invoiceId', 'number')
    .populate('workOrderId', '_id')
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({
    clientId: client._id,
    balance: Number(client.prepaidBalance || 0),
    movements,
    page,
    pages: Math.ceil(count / pageSize),
    totalCount: count,
  });
};

export const sendClientPrepaidOffer = async (req: Request, res: Response) => {
  const client = await Client.findById(req.params.clientId);
  if (!client) {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }
  const settings = await Settings.findOne();
  const prepaidEnabled = Boolean(settings?.prepaidBalanceEnabled);
  if (!prepaidEnabled) {
    res.status(400);
    throw new Error('El beneficio de saldo a favor está desactivado en configuración');
  }

  const channel = String(req.body.channel || 'EMAIL').toUpperCase();
  const vars = buildPrepaidTemplateVars({
    client,
    settings,
    balance: Number(client.prepaidBalance || 0),
  });

  if (channel === 'WHATSAPP') {
    const digits = normalizePhone(client.phone);
    if (!digits) {
      res.status(400);
      throw new Error('El cliente no tiene teléfono válido');
    }
    const baseTemplate =
      String(settings?.prepaidOfferWhatsAppTemplate || '').trim() ||
      'Hola {{nombre}}. Te ofrecemos un beneficio opcional de saldo a favor para futuros servicios.';
    const message = replaceTemplateTokens(baseTemplate, vars);
    client.prepaidOfferSentAt = new Date();
    await client.save();
    res.json({
      message: 'Oferta preparada para WhatsApp',
      whatsAppUrl: `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
    });
    return;
  }

  if (!client.email) {
    res.status(400);
    throw new Error('El cliente no tiene email');
  }

  const subjectTemplate =
    String(settings?.prepaidOfferEmailSubject || '').trim() ||
    'Beneficio opcional: saldo a favor';
  const bodyTemplate =
    String(settings?.prepaidOfferEmailBody || '').trim() ||
    'Hola {{nombre}}, te ofrecemos un beneficio opcional de saldo a favor para futuros servicios.';
  const subject = replaceTemplateTokens(subjectTemplate, vars);
  const body = replaceTemplateTokens(bodyTemplate, vars);
  const template = prepaidOfferEmailTemplate({
    subject,
    clientName: getClientDisplayName(client),
    customBody: body,
    balance: Number(client.prepaidBalance || 0),
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
    text: template.text,
    html: template.html,
    bcc: settings?.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER,
  });
  client.prepaidOfferSentAt = new Date();
  await client.save();
  res.json({ message: 'Oferta enviada por email' });
};

export const sendClientPrepaidSummary = async (req: Request, res: Response) => {
  const client = await Client.findById(req.params.clientId);
  if (!client) {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }
  if (!client.email) {
    res.status(400);
    throw new Error('El cliente no tiene email');
  }

  const settings = await Settings.findOne();
  const latestMovements = await ClientPrepaidMovement.find({
    clientId: client._id,
  })
    .sort({ createdAt: -1 })
    .limit(10);

  const formatAmount = (value: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const movementRows = latestMovements
    .map((movement: any) => {
      const date = new Date(movement.createdAt).toLocaleString('es-AR');
      const sign = movement.direction === 'CREDIT' ? '+' : '-';
      return `${date} | ${movement.type} | ${sign}${formatAmount(movement.amount)} | Saldo: ${formatAmount(movement.balanceAfter)}`;
    })
    .join('\n');

  const clientName = getClientDisplayName(client);
  const balance = Number(client.prepaidBalance || 0);
  const subject = `Resumen de saldo a favor - ${settings?.shopName || 'Taller'}`;
  const text = [
    `Hola ${clientName},`,
    '',
    `Saldo actual: ${formatAmount(balance)}`,
    '',
    'Últimos movimientos:',
    movementRows || 'Sin movimientos aún.',
    '',
    'Recordá que este saldo queda a tu favor para futuros servicios.',
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h2 style="margin:0 0 12px;">Resumen de saldo a favor</h2>
      <p>Hola ${clientName},</p>
      <p>Saldo actual: <strong>${formatAmount(balance)}</strong></p>
      <h3 style="margin:16px 0 8px;">Últimos movimientos</h3>
      <pre style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; font-size:12px; white-space:pre-wrap;">${movementRows || 'Sin movimientos aún.'}</pre>
      <p style="margin-top:12px;">Este saldo queda a tu favor para futuros servicios.</p>
    </div>
  `;

  await sendEmail({
    to: client.email,
    subject,
    text,
    html,
    bcc: settings?.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_USER,
  });

  res.json({ message: 'Resumen enviado por email' });
};

export const createClientPrepaidDeposit = async (req: Request, res: Response) => {
  const settings = await Settings.findOne();
  const prepaidEnabled = Boolean(settings?.prepaidBalanceEnabled);
  if (!prepaidEnabled) {
    res.status(400);
    throw new Error('El beneficio de saldo a favor está desactivado');
  }

  const client = await Client.findById(req.params.clientId);
  if (!client) {
    res.status(404);
    throw new Error('Cliente no encontrado');
  }
  if (!client.prepaidEligible) {
    res.status(400);
    throw new Error('El cliente no está habilitado para saldo a favor');
  }

  const amount = ensurePositiveMoney(req.body.amount, 'El monto');
  const note = String(req.body.note || '').trim();
  const paymentMethod = String(req.body.paymentMethod || 'TRANSFER').toUpperCase();
  const createdBy = (req as any).user?._id ? String((req as any).user._id) : undefined;

  const creditResult = await creditClientBalanceAndCreateMovement({
    clientId: String(client._id),
    amount,
    type: 'DEPOSIT',
    note: note || 'Carga de saldo a favor',
    source: 'MANUAL',
    createdBy,
  });

  const number = await getNextDocumentNumber(Invoice as any, 'invoice_number', 'A-');
  const invoice = await Invoice.create({
    clientId: client._id,
    number,
    invoiceType: 'PREPAID_DEPOSIT',
    items: [
      {
        description: 'Carga de saldo a favor',
        qty: 1,
        unitPrice: amount,
        total: amount,
      },
    ],
    laborCost: 0,
    discount: 0,
    prepaidApplied: 0,
    total: amount,
    clientComment: note || 'Depósito de saldo a favor',
    paymentMethod:
      paymentMethod === 'CASH' ||
      paymentMethod === 'TRANSFER' ||
      paymentMethod === 'CARD' ||
      paymentMethod === 'OTHER'
        ? paymentMethod
        : 'TRANSFER',
    issuedAt: new Date(),
    prepaidMovementId: creditResult.movement._id,
  });

  creditResult.movement.invoiceId = invoice._id;
  await creditResult.movement.save();

  const clientName = getClientDisplayName(client);
  const vehicleLabel = 'Saldo a favor';
  const { uploadedUrl, pdfBuffer } = await generateAndAttachInvoicePdf({
    invoice,
    settings,
    clientName,
    vehicleLabel,
  });

  let emailSent = false;
  let emailError = '';
  if (client.email) {
    try {
      await sendInvoiceEmailNow({
        invoice,
        client,
        vehicleLabel,
        settings,
        prebuiltBuffer: pdfBuffer,
      });
      emailSent = true;
    } catch (error: any) {
      emailError = error?.message || 'No se pudo enviar la factura por email';
    }
  } else {
    emailError = 'El cliente no tiene email';
  }

  const whatsAppUrl =
    req.body.includeWhatsAppLink === false
      ? null
      : buildInvoiceWhatsAppUrl({
          phone: client.phone,
          shopName: settings?.shopName,
          clientFirstName: client.firstName,
          invoiceNumber: invoice.number,
          vehicleLabel,
          pdfUrl: uploadedUrl,
        });

  res.status(201).json({
    message: 'Saldo cargado correctamente',
    invoice,
    movement: creditResult.movement,
    balance: Number(creditResult.balanceAfter || 0),
    emailSent,
    emailError: emailError || null,
    whatsAppUrl,
  });
};
