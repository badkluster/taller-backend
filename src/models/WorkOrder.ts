import mongoose from 'mongoose';

const workOrderSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', index: false },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  category: { type: String, enum: ['PRESUPUESTO', 'REPARACION', 'GENERAL'], default: 'GENERAL' },
  status: {
    type: String,
    enum: ['PRESUPUESTO', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'],
    default: 'PRESUPUESTO'
  },
  workDetailsText: { type: String },
  maintenanceDetail: { type: String },
  maintenanceNotice: { type: Boolean, default: false },
  maintenanceDate: { type: Date },
  workStartedAt: { type: Date },
  startAt: { type: Date },
  endAt: { type: Date },
  items: [{
    description: { type: String },
    qty: { type: Number },
    unitPrice: { type: Number }
  }],
  laborCost: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['CASH', 'TRANSFER', 'CARD', 'OTHER'] },
  estimatePdfUrl: { type: String },
  estimateNumber: { type: String },
  invoicePdfUrl: { type: String },
  invoiceNumber: { type: String },
  originalEstimatePdfUrl: { type: String },
  originalEstimateNumber: { type: String },
  evidence: [{
    type: { type: String, enum: ['text', 'image', 'video', 'file'] },
    text: { type: String },
    url: { type: String }, // Cloudinary URL
    fileName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    createdAt: { type: Date, default: Date.now }
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
});

const WorkOrder = mongoose.model('WorkOrder', workOrderSchema);
export default WorkOrder;
