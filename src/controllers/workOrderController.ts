import { Request, Response } from 'express';
import WorkOrder from '../models/WorkOrder';

// @desc    Get Work Orders
// @route   GET /api/workorders
// @access  Private
export const getWorkOrders = async (req: Request, res: Response) => {
  const pageSize = 10;
  const page = Number(req.query.pageNumber) || 1;
  const { vehicleId, status } = req.query;

  const query: any = {};
  if (vehicleId) query.vehicleId = vehicleId;
  if (status) query.status = status;

  const count = await WorkOrder.countDocuments(query);
  const workOrders = await WorkOrder.find(query)
    .populate('vehicleId', 'plateNormalized make model')
    .populate('clientId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ workOrders, page, pages: Math.ceil(count / pageSize) });
};

// @desc    Create Work Order
// @route   POST /api/workorders
// @access  Private
export const createWorkOrder = async (req: Request, res: Response) => {
  const { 
    vehicleId, 
    clientId, 
    appointmentId, 
    status, 
    workDetailsText, 
    startAt, 
    endAt,
    laborCost,
    discount,
    total,
    items
  } = req.body;

  if (!req.user) throw new Error('No autorizado');

  const workOrder = await WorkOrder.create({
    vehicleId,
    clientId,
    appointmentId,
    status: status || 'PRESUPUESTO',
    workDetailsText,
    startAt,
    endAt,
    laborCost,
    discount,
    total,
    items: items || [],
    createdBy: req.user._id
  });

  res.status(201).json(workOrder);
};

// @desc    Get WO by ID
// @route   GET /api/workorders/:id
// @access  Private
export const getWorkOrderById = async (req: Request, res: Response) => {
  const workOrder = await WorkOrder.findById(req.params.id)
    .populate('vehicleId')
    .populate('clientId')
    .populate('appointmentId');

  if (workOrder) {
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
    workOrder.status = req.body.status || workOrder.status;
    workOrder.workDetailsText = req.body.workDetailsText || workOrder.workDetailsText;
    workOrder.maintenanceDetail = req.body.maintenanceDetail !== undefined ? req.body.maintenanceDetail : workOrder.maintenanceDetail;
    workOrder.maintenanceNotice = req.body.maintenanceNotice !== undefined ? req.body.maintenanceNotice : workOrder.maintenanceNotice;
    workOrder.maintenanceDate = req.body.maintenanceDate !== undefined ? req.body.maintenanceDate : workOrder.maintenanceDate;
    
    if (req.body.items) {
      workOrder.items = req.body.items;
      // Recalculate or trust frontend. Let's trust frontend with req.body.total 
      // but ensure schema compatibility if items was changed from 'name' to 'description'
    }
    
    workOrder.laborCost = req.body.laborCost !== undefined ? req.body.laborCost : workOrder.laborCost;
    workOrder.discount = req.body.discount !== undefined ? req.body.discount : workOrder.discount;
    workOrder.total = req.body.total !== undefined ? req.body.total : workOrder.total;
    workOrder.paymentMethod = req.body.paymentMethod || workOrder.paymentMethod;
    workOrder.startAt = req.body.startAt || workOrder.startAt;
    workOrder.endAt = req.body.endAt || workOrder.endAt;

    const updatedWO = await workOrder.save();
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
  const { type, text, url } = req.body; // type: 'text' | 'image'
  const workOrder = await WorkOrder.findById(req.params.id);

  if (workOrder) {
    workOrder.evidence.push({
      type,
      text,
      url,
      createdAt: new Date()
    });

    await workOrder.save();
    res.json(workOrder);
  } else {
    res.status(404);
    throw new Error('Work Order not found');
  }
};
