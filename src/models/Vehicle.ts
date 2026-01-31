import mongoose from 'mongoose';
import { normalizePlate } from '../utils/normalizePlate';

const vehicleSchema = new mongoose.Schema({
  plateRaw: { type: String, required: true },
  plateNormalized: { type: String, required: true, unique: true, index: true },
  make: { type: String, required: true },
  model: { type: String, required: true },
  year: { type: Number, required: true },
  color: { type: String },
  km: { type: Number },
  currentOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  ownerHistory: [{
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    fromAt: { type: Date, default: Date.now },
    toAt: { type: Date },
    note: { type: String }
  }]
}, {
  timestamps: true,
});

vehicleSchema.pre('validate', function () {
  if (this.plateRaw) {
    this.plateNormalized = normalizePlate(this.plateRaw);
  }
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
export default Vehicle;
