import mongoose from 'mongoose';

const estimateSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder' },
  number: { type: String, required: true, unique: true, index: true }, // e.g., "P-0001"
  pdfUrl: { type: String },
  status: { type: String, enum: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'], default: 'DRAFT' },
  items: [{
    description: { type: String },
    qty: { type: Number },
    unitPrice: { type: Number },
    total: { type: Number }
  }],
  laborCost: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  sentAt: { type: Date },
  channelsUsed: [{ type: String, enum: ['EMAIL', 'WHATSAPP'] }]
}, {
  timestamps: true,
});

const invoiceSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder' },
  number: { type: String, required: true, unique: true, index: true }, // e.g., "A-0001"
  pdfUrl: { type: String },
  items: [{
    description: { type: String },
    qty: { type: Number },
    unitPrice: { type: Number },
    total: { type: Number }
  }],
  laborCost: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['CASH', 'TRANSFER', 'CARD', 'OTHER'] },
  issuedAt: { type: Date, default: Date.now },
  sentAt: { type: Date }
}, {
  timestamps: true,
});

export const Estimate = mongoose.model('Estimate', estimateSchema);
export const Invoice = mongoose.model('Invoice', invoiceSchema);
