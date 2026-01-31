import { Request, Response } from 'express';
import { Estimate, Invoice } from '../models/Finance';
import WorkOrder from '../models/WorkOrder';
import Appointment from '../models/Appointment';
import Vehicle from '../models/Vehicle';
import Client from '../models/Client';
// PDF Generation Placeholder - in real app use pdfkit/pdfmake here
// import { generatePDF } from '../utils/pdfGenerator';

// ESTIMATES

// @desc    Create Estimate
// @route   POST /api/estimates
// @access  Private
export const createEstimate = async (req: Request, res: Response) => {
  const { vehicleId, clientId, items, workOrderId, appointmentId } = req.body;

  // Generate Number (P-0001 usually requires querying last)
  const lastEstimate = await Estimate.findOne().sort({ createdAt: -1 });
  const lastNumber = lastEstimate ? parseInt(lastEstimate.number.replace('P-', '')) : 0;
  const number = `P-${String(lastNumber + 1).padStart(4, '0')}`;

  const total = items.reduce((acc: number, item: any) => acc + (item.qty * item.unitPrice), 0);

  const estimate = await Estimate.create({
    vehicleId,
    clientId,
    workOrderId,
    appointmentId,
    number,
    total,
    status: 'DRAFT'
  });

  // Generate PDF Logic (mocked)
  estimate.pdfUrl = `https://generated-pdf-url.com/${number}.pdf`; 
  await estimate.save();

  res.status(201).json(estimate);
};

// @desc    Get All Estimates
// @route   GET /api/estimates
// @access  Private
export const getEstimates = async (req: Request, res: Response) => {
  const estimates = await Estimate.find()
    .populate('vehicleId', 'plateNormalized')
    .populate('clientId', 'firstName lastName')
    .sort({ createdAt: -1 });
  res.json(estimates);
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

  // Generate Number (A-0001)
  const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 });
  const lastNumber = lastInvoice ? parseInt(lastInvoice.number.replace('A-', '')) : 0;
  const number = `A-${String(lastNumber + 1).padStart(4, '0')}`;

  const invoice = await Invoice.create({
    vehicleId: workOrder.vehicleId,
    clientId: workOrder.clientId,
    workOrderId: workOrder._id,
    number,
    total: workOrder.total,
    paymentMethod: workOrder.paymentMethod,
    issuedAt: new Date()
  });

  // Generate PDF Logic (mocked)
  invoice.pdfUrl = `https://generated-pdf-url.com/${number}.pdf`; 
  await invoice.save();

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
  const invoices = await Invoice.find()
    .populate('vehicleId', 'plateNormalized')
    .populate('clientId', 'firstName lastName')
    .sort({ createdAt: -1 });
  res.json(invoices);
};
