import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true }, // Redundant but useful for queries
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED', 'IN_PROGRESS'], 
    default: 'SCHEDULED' 
  },
  serviceType: { type: String, required: true }, // e.g., 'Oil Change', 'Checkup'
  notes: { type: String },
  assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelReason: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

const Appointment = mongoose.model('Appointment', appointmentSchema);
export default Appointment;
