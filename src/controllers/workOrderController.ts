import { Request, Response } from 'express';
import WorkOrder from '../models/WorkOrder';
import { Estimate, Invoice } from '../models/Finance';
import Vehicle from '../models/Vehicle';
import Client from '../models/Client';
import { normalizePlate } from '../utils/normalizePlate';
import cloudinary from '../config/cloudinary';
import Appointment from '../models/Appointment';
import { logger } from '../utils/logger';

const calcItemsTotal = (items: any[] = []) =>
  items.reduce((acc, item) => acc + (Number(item.qty || 0) * Number(item.unitPrice || 0)), 0);

const calcGrandTotal = (items: any[] = [], laborCost = 0, discount = 0) => {
  const itemsTotal = calcItemsTotal(items);
  return itemsTotal + Number(laborCost || 0) - Number(discount || 0);
};

const normalizeItems = (items: any[] = []) =>
  items.map((item) => ({
    description: item?.description || '',
    qty: Number(item?.qty || 0),
    unitPrice: Number(item?.unitPrice || 0),
  }));

const parseDateBoundary = (
  rawDate: unknown,
  boundary: 'start' | 'end',
) => {
  if (!rawDate) return null;
  const raw = String(rawDate).trim();
  if (!raw) return null;

  const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let date: Date;
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]) - 1;
    const day = Number(ymdMatch[3]);
    date =
      boundary === 'start'
        ? new Date(year, month, day, 0, 0, 0, 0)
        : new Date(year, month, day, 23, 59, 59, 999);
  } else {
    date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    if (boundary === 'start') {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
  }

  return Number.isNaN(date.getTime()) ? null : date;
};

const WORK_ORDER_STATUS_FILTERS: Record<string, string[]> = {
  PRESUPUESTO: ['PRESUPUESTO', 'OPEN'],
  OPEN: ['PRESUPUESTO', 'OPEN'],
  EN_PROCESO: ['EN_PROCESO', 'IN_PROGRESS'],
  IN_PROGRESS: ['EN_PROCESO', 'IN_PROGRESS'],
  COMPLETADA: ['COMPLETADA', 'CLOSED'],
  CLOSED: ['COMPLETADA', 'CLOSED'],
  CANCELADA: ['CANCELADA', 'CANCELLED'],
  CANCELLED: ['CANCELADA', 'CANCELLED'],
};

const REPAIR_WORK_ORDER_STATUS = new Set(['EN_PROCESO', 'IN_PROGRESS', 'COMPLETADA', 'CLOSED']);

const normalizeWorkOrderCategory = (rawCategory?: unknown) => {
  const normalized = String(rawCategory || '')
    .trim()
    .toUpperCase();
  if (!normalized) return '';
  if (normalized === 'REPARACION') return 'REPARACION';
  if (normalized === 'PRESUPUESTO') return 'PRESUPUESTO';
  if (normalized === 'GENERAL') return 'GENERAL';
  return '';
};

const normalizeWorkOrderStatus = (rawStatus?: unknown) => {
  const normalized = String(rawStatus || '')
    .trim()
    .toUpperCase();
  if (!normalized) return '';
  if (normalized === 'OPEN') return 'PRESUPUESTO';
  if (normalized === 'IN_PROGRESS') return 'EN_PROCESO';
  if (normalized === 'CLOSED') return 'COMPLETADA';
  if (normalized === 'CANCELLED') return 'CANCELADA';
  if (['PRESUPUESTO', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'].includes(normalized)) {
    return normalized;
  }
  return '';
};

const buildWorkOrderStatusQuery = (rawStatus: unknown) => {
  if (!rawStatus) return null;

  const raw = Array.isArray(rawStatus)
    ? rawStatus.map((item) => String(item)).join(',')
    : String(rawStatus);

  const requested = raw
    .split(',')
    .map((status) => status.trim().toUpperCase())
    .filter(Boolean);

  if (!requested.length || requested.includes('ALL')) return null;

  const expanded = new Set<string>();
  requested.forEach((status) => {
    const mappedStatuses = WORK_ORDER_STATUS_FILTERS[status] || [status];
    mappedStatuses.forEach((mappedStatus) => expanded.add(mappedStatus));
  });

  const statuses = Array.from(expanded);
  if (!statuses.length) return null;
  return statuses.length === 1 ? statuses[0] : { $in: statuses };
};

const extractCloudinaryPublicId = (url?: string) => {
  if (!url) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
  return match?.[1] || null;
};

const deleteCloudinaryAsset = async (url?: string) => {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (error) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch (rawError) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      } catch {
        // Ignore delete failures to avoid blocking deletes
      }
    }
  }
};

const EMPLOYEE_ALLOWED_WORK_ORDER_STATUSES = new Set(['EN_PROCESO', 'IN_PROGRESS']);

const sanitizeWorkOrderForEmployee = (workOrder: any) => {
  const plain =
    typeof workOrder?.toObject === 'function'
      ? workOrder.toObject()
      : { ...(workOrder || {}) };

  delete plain.items;
  delete plain.laborCost;
  delete plain.discount;
  delete plain.total;
  delete plain.paymentMethod;
  delete plain.clientComment;
  delete plain.maintenanceDetail;
  delete plain.maintenanceNotice;
  delete plain.maintenanceDate;
  delete plain.estimatePdfUrl;
  delete plain.estimateNumber;
  delete plain.invoicePdfUrl;
  delete plain.invoiceNumber;
  delete plain.originalEstimatePdfUrl;
  delete plain.originalEstimateNumber;

  return plain;
};

const buildLatestEstimateSummaryByWorkOrder = async (workOrders: any[] = []) => {
  const workOrderIds = workOrders
    .map((workOrder) => workOrder?._id)
    .filter(Boolean);

  if (!workOrderIds.length) {
    return new Map<string, any>();
  }

  const latestEstimates = await Estimate.aggregate([
    { $match: { workOrderId: { $in: workOrderIds } } },
    { $sort: { workOrderId: 1, createdAt: -1 } },
    {
      $group: {
        _id: '$workOrderId',
        estimateId: { $first: '$_id' },
        number: { $first: '$number' },
        status: { $first: '$status' },
        sentAt: { $first: '$sentAt' },
        channelsUsed: { $first: '$channelsUsed' },
        createdAt: { $first: '$createdAt' },
        pdfUrl: { $first: '$pdfUrl' },
      },
    },
  ]);

  const summaryByWorkOrder = new Map<string, any>();
  latestEstimates.forEach((estimate) => {
    summaryByWorkOrder.set(String(estimate._id), {
      _id: estimate.estimateId,
      number: estimate.number,
      status: estimate.status,
      sentAt: estimate.sentAt,
      channelsUsed: estimate.channelsUsed || [],
      createdAt: estimate.createdAt,
      pdfUrl: estimate.pdfUrl,
    });
  });

  return summaryByWorkOrder;
};

// @desc    Get Work Orders
// @route   GET /api/workorders
// @access  Private
export const getWorkOrders = async (req: Request, res: Response) => {
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
  const { vehicleId, status, appointmentId, keyword, startDate, endDate, category } = req.query;
  const isEmployee = req.user?.role === 'employee';

  const query: any = {};
  if (isEmployee) {
    query.category = 'REPARACION';
    query.status = { $in: Array.from(EMPLOYEE_ALLOWED_WORK_ORDER_STATUSES) };
  }
  if (vehicleId) query.vehicleId = vehicleId;
  const statusQuery = buildWorkOrderStatusQuery(status);
  if (!isEmployee && statusQuery) query.status = statusQuery;
  if (!isEmployee && category) {
    const requestedCategories = String(category)
      .split(',')
      .map((item) => normalizeWorkOrderCategory(item))
      .filter(Boolean);
    if (requestedCategories.length === 1) {
      query.category = requestedCategories[0];
    } else if (requestedCategories.length > 1) {
      query.category = { $in: requestedCategories };
    }
  }
  if (appointmentId) query.appointmentId = appointmentId;
  if (startDate || endDate) {
    const start = parseDateBoundary(startDate, 'start');
    const end = parseDateBoundary(endDate, 'end');
    if (start || end) {
      query.createdAt = {};
      if (start) query.createdAt.$gte = start;
      if (end) query.createdAt.$lte = end;
    }
  }

  if (keyword) {
    const term = String(keyword);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const [vehicles, clients] = await Promise.all([
      Vehicle.find({
        $or: [
          { plateNormalized: { $regex: normalizePlate(term), $options: 'i' } },
          { make: regex },
          { model: regex },
        ],
      }).select('_id'),
      Client.find({
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
      { internalComment: { $regex: regex, $options: 'i' } },
      { clientComment: { $regex: regex, $options: 'i' } },
      ...(vehicleIds.length ? [{ vehicleId: { $in: vehicleIds } }] : []),
      ...(clientIds.length ? [{ clientId: { $in: clientIds } }] : []),
    ];
  }

  const count = await WorkOrder.countDocuments(query);
  const workOrders = await WorkOrder.find(query)
    .populate('vehicleId', 'plateNormalized make model')
    .populate('clientId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  const workOrdersPayload = isEmployee
    ? workOrders.map((workOrder) => sanitizeWorkOrderForEmployee(workOrder))
    : (() => {
        const result = workOrders.map((workOrder) =>
          typeof workOrder?.toObject === 'function'
            ? workOrder.toObject()
            : { ...(workOrder || {}) },
        );
        return result;
      })();

  if (!isEmployee) {
    const latestEstimateByWorkOrder =
      await buildLatestEstimateSummaryByWorkOrder(workOrders);
    workOrdersPayload.forEach((workOrder: any) => {
      workOrder.latestEstimate =
        latestEstimateByWorkOrder.get(String(workOrder._id)) || null;
    });
  }

  res.json({ workOrders: workOrdersPayload, page, pages: Math.ceil(count / pageSize), totalCount: count });
};

// @desc    Create Work Order
// @route   POST /api/workorders
// @access  Private
export const createWorkOrder = async (req: Request, res: Response) => {
  const { 
    vehicleId, 
    clientId, 
    appointmentId, 
    category,
    status, 
    workDetailsText, 
    internalComment,
    clientComment,
    startAt, 
    endAt,
    laborCost,
    discount,
    total,
    items
  } = req.body;

  if (!req.user) throw new Error('No autorizado');

  const normalizedCategory = normalizeWorkOrderCategory(category) || 'GENERAL';
  const normalizedStatus = normalizeWorkOrderStatus(status);
  const initialStatus = normalizedStatus ||
    (normalizedCategory === 'REPARACION' ? 'EN_PROCESO' : 'PRESUPUESTO');
  const shouldMarkWorkStarted = REPAIR_WORK_ORDER_STATUS.has(initialStatus);

  const workOrder = await WorkOrder.create({
    vehicleId,
    clientId,
    appointmentId,
    category: normalizedCategory,
    status: initialStatus,
    ...(shouldMarkWorkStarted ? { workStartedAt: new Date() } : {}),
    workDetailsText,
    internalComment,
    clientComment,
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

// @desc    Get WO by ID
// @route   GET /api/workorders/:id
// @access  Private
export const getWorkOrderById = async (req: Request, res: Response) => {
  const isEmployee = req.user?.role === 'employee';
  const workOrder = await WorkOrder.findById(req.params.id)
    .populate('vehicleId')
    .populate('clientId')
    .populate('appointmentId');

  if (workOrder) {
    if (isEmployee) {
      const category = String(workOrder.category || '').toUpperCase();
      const status = String(workOrder.status || '').toUpperCase();
      if (category !== 'REPARACION' || !EMPLOYEE_ALLOWED_WORK_ORDER_STATUSES.has(status)) {
        res.status(403);
        throw new Error('No autorizado para ver esta orden');
      }
      res.json(sanitizeWorkOrderForEmployee(workOrder));
      return;
    }

    res.json(workOrder);
  } else {
    res.status(404);
    throw new Error('Orden de Trabajo no encontrada');
  }
};

// @desc    Update WO (items, totals, status)
// @route   PATCH /api/workorders/:id
// @access  Private
export const updateWorkOrder = async (req: Request, res: Response) => {
  const workOrder = await WorkOrder.findById(req.params.id);

  if (workOrder) {
    const isEmployee = req.user?.role === 'employee';
    if (isEmployee) {
      const incomingKeys = Object.keys(req.body || {});
      const allowedKeys = new Set(['workDetailsText', 'internalComment', 'evidence']);
      const hasForbiddenUpdate = incomingKeys.some((key) => !allowedKeys.has(key));
      if (hasForbiddenUpdate) {
        res.status(403);
        throw new Error('No autorizado para modificar estos campos');
      }

      const currentStatus = String(workOrder.status || '').toUpperCase();
      if (!EMPLOYEE_ALLOWED_WORK_ORDER_STATUSES.has(currentStatus)) {
        res.status(403);
        throw new Error('Solo se pueden actualizar órdenes de reparación en proceso');
      }

      if (req.body.workDetailsText !== undefined) {
        workOrder.workDetailsText = req.body.workDetailsText;
      }
      if (req.body.internalComment !== undefined) {
        workOrder.internalComment = req.body.internalComment;
      }
      if (req.body.evidence !== undefined) {
        workOrder.evidence = req.body.evidence;
      }

      const updatedEmployeeWO = await workOrder.save();
      res.json(sanitizeWorkOrderForEmployee(updatedEmployeeWO));
      return;
    }

    logger.info({
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

    const itemsChanged =
      req.body.items &&
      JSON.stringify(normalizeItems(req.body.items)) !==
        JSON.stringify(normalizeItems(workOrder.items || []));
    const laborChanged =
      req.body.laborCost !== undefined &&
      Number(req.body.laborCost) !== Number(workOrder.laborCost || 0);
    const discountChanged =
      req.body.discount !== undefined &&
      Number(req.body.discount) !== Number(workOrder.discount || 0);
    const budgetChanged = itemsChanged || laborChanged || discountChanged;

    if (budgetChanged) {
      const nextStatus = (req.body.status || workOrder.status) as string;
      const hasWorkStarted =
        !!workOrder.workStartedAt ||
        ['EN_PROCESO', 'COMPLETADA'].includes(workOrder.status) ||
        ['EN_PROCESO', 'COMPLETADA'].includes(nextStatus);

      logger.info({
        id: workOrder._id.toString(),
        nextStatus,
        hasWorkStarted,
        itemsChanged,
        laborChanged,
        discountChanged,
      }, 'WO budget change detected');
      console.log('[WO budget change]', workOrder._id.toString(), { nextStatus, hasWorkStarted, itemsChanged, laborChanged, discountChanged });

      // Presupuesto: no borramos el PDF para preservar historial.

      // La factura siempre debe recalcularse si cambian items/valores
      if (workOrder.invoicePdfUrl) {
        await deleteCloudinaryAsset(workOrder.invoicePdfUrl);
      }
      workOrder.invoicePdfUrl = undefined;
      workOrder.invoiceNumber = undefined;
    }

    const nextStatus = req.body.status || workOrder.status;
    const repairProgressStatuses = ['EN_PROCESO', 'IN_PROGRESS', 'COMPLETADA', 'CLOSED'];
    const shouldPromoteCategoryToRepair =
      !req.body.category &&
      workOrder.category === 'PRESUPUESTO' &&
      repairProgressStatuses.includes(String(nextStatus).toUpperCase());

    workOrder.status = nextStatus;
    if (!workOrder.workStartedAt && ['EN_PROCESO', 'IN_PROGRESS', 'COMPLETADA', 'CLOSED'].includes(String(nextStatus).toUpperCase())) {
      workOrder.workStartedAt = new Date();
    }
    workOrder.category = req.body.category || (shouldPromoteCategoryToRepair ? 'REPARACION' : workOrder.category);
    if (req.body.workDetailsText !== undefined) {
      workOrder.workDetailsText = req.body.workDetailsText;
    }
    if (req.body.internalComment !== undefined) {
      workOrder.internalComment = req.body.internalComment;
    }
    if (req.body.clientComment !== undefined) {
      workOrder.clientComment = req.body.clientComment;
    }
    workOrder.maintenanceDetail = req.body.maintenanceDetail !== undefined ? req.body.maintenanceDetail : workOrder.maintenanceDetail;
    workOrder.maintenanceNotice = req.body.maintenanceNotice !== undefined ? req.body.maintenanceNotice : workOrder.maintenanceNotice;
    workOrder.maintenanceDate = req.body.maintenanceDate !== undefined ? req.body.maintenanceDate : workOrder.maintenanceDate;
    
    if (req.body.items) {
      workOrder.items = req.body.items;
      // Recalculate or trust frontend. Let's trust frontend with req.body.total 
      // but ensure schema compatibility if items was changed from 'name' to 'description'
    }

    if (req.body.evidence) {
      workOrder.evidence = req.body.evidence;
    }
    
    workOrder.laborCost = req.body.laborCost !== undefined ? req.body.laborCost : workOrder.laborCost;
    workOrder.discount = req.body.discount !== undefined ? req.body.discount : workOrder.discount;
    if (req.body.total !== undefined) {
      workOrder.total = req.body.total;
    } else if (req.body.items || req.body.laborCost !== undefined || req.body.discount !== undefined) {
      workOrder.total = calcGrandTotal(workOrder.items, workOrder.laborCost, workOrder.discount);
    }
    workOrder.paymentMethod = req.body.paymentMethod || workOrder.paymentMethod;
    workOrder.startAt = req.body.startAt || workOrder.startAt;
    workOrder.endAt = req.body.endAt || workOrder.endAt;

    let updatedWO = await workOrder.save();
    logger.info({
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

    // If we just started work, lock the latest estimate as the "original" reference
    if (['EN_PROCESO', 'COMPLETADA'].includes(updatedWO.status) &&
        (!updatedWO.originalEstimatePdfUrl || !updatedWO.originalEstimateNumber)) {
      const latestEstimate = await Estimate.findOne({
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

    if (updatedWO.appointmentId && req.body.status) {
      const appointmentStatusMap: Record<string, string> = {
        EN_PROCESO: 'IN_PROGRESS',
        IN_PROGRESS: 'IN_PROGRESS',
        COMPLETADA: 'COMPLETED',
        CLOSED: 'COMPLETED',
        CANCELADA: 'CANCELLED',
        CANCELLED: 'CANCELLED',
      };
      const mappedStatus = appointmentStatusMap[nextStatus as string];
      if (mappedStatus) {
        const appointmentUpdates: Record<string, string> = { status: mappedStatus };
        if (updatedWO.category === 'REPARACION') {
          appointmentUpdates.serviceType = 'REPARACION';
        } else if (updatedWO.category === 'PRESUPUESTO') {
          appointmentUpdates.serviceType = 'PRESUPUESTO';
        }
        await Appointment.findByIdAndUpdate(updatedWO.appointmentId, appointmentUpdates);
      }
    }
    res.json(updatedWO);
  } else {
    res.status(404);
    throw new Error('Orden de Trabajo no encontrada');
  }
};

// @desc    Add Evidence
// @route   POST /api/workorders/:id/evidence
// @access  Private
export const addEvidence = async (req: Request, res: Response) => {
  const { type, text, url, fileName, mimeType, size } = req.body; // type: 'text' | 'image' | 'video' | 'file'
  const workOrder = await WorkOrder.findById(req.params.id);

  if (workOrder) {
    if (req.user?.role === 'employee') {
      const category = String(workOrder.category || '').toUpperCase();
      const status = String(workOrder.status || '').toUpperCase();
      if (category !== 'REPARACION' || !EMPLOYEE_ALLOWED_WORK_ORDER_STATUSES.has(status)) {
        res.status(403);
        throw new Error('No autorizado para agregar evidencia en esta orden');
      }
    }

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
    if (req.user?.role === 'employee') {
      res.json(sanitizeWorkOrderForEmployee(workOrder));
      return;
    }
    res.json(workOrder);
  } else {
    res.status(404);
    throw new Error('Work Order not found');
  }
};

// @desc    Delete Work Order
// @route   DELETE /api/workorders/:id
// @access  Private
export const deleteWorkOrder = async (req: Request, res: Response) => {
  const workOrder = await WorkOrder.findById(req.params.id);

  if (workOrder) {
    const [estimates, invoices] = await Promise.all([
      Estimate.find({ workOrderId: workOrder._id }),
      Invoice.find({ workOrderId: workOrder._id }),
    ]);

    const urls = new Set<string>();
    if (workOrder.estimatePdfUrl) urls.add(workOrder.estimatePdfUrl);
    if (workOrder.invoicePdfUrl) urls.add(workOrder.invoicePdfUrl);
    (workOrder.evidence || []).forEach((ev: any) => {
      if (ev?.url) urls.add(ev.url);
    });
    estimates.forEach((est) => {
      if (est.pdfUrl) urls.add(est.pdfUrl);
    });
    invoices.forEach((inv) => {
      if (inv.pdfUrl) urls.add(inv.pdfUrl);
    });

    await Promise.all(Array.from(urls).map((url) => deleteCloudinaryAsset(url)));

    await Estimate.deleteMany({ workOrderId: workOrder._id });
    await Invoice.deleteMany({ workOrderId: workOrder._id });
    await workOrder.deleteOne();
    res.json({ message: 'Orden de Trabajo eliminada' });
  } else {
    res.status(404);
    throw new Error('Orden de Trabajo no encontrada');
  }
};
