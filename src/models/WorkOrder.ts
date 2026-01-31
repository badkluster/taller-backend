import mongoose from 'mongoose';

const workOrderSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', index: false },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  status: {
    type: String,
    enum: ['PRESUPUESTO', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'],
    default: 'PRESUPUESTO'
  },
  workDetailsText: { type: String },
  maintenanceDetail: { type: String },
  maintenanceNotice: { type: Boolean, default: false },
  maintenanceDate: { type: Date },
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
  evidence: [{
    type: { type: String, enum: ['text', 'image'] },
    text: { type: String },
    url: { type: String }, // Cloudinary URL
    createdAt: { type: Date, default: Date.now }
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
});

const WorkOrder = mongoose.model('WorkOrder', workOrderSchema);
export default WorkOrder;
