import mongoose from 'mongoose';
import { normalizeClientEmail, normalizeClientPhone } from '../utils/clientIdentity';

const clientSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, index: true },
  email: { type: String, index: true },
  notes: { type: String },
}, {
  timestamps: true,
});

clientSchema.pre('validate', function normalizeClientIdentity(this: any) {
  if (this.firstName) this.firstName = String(this.firstName).trim();
  if (this.lastName) this.lastName = String(this.lastName).trim();
  if (this.notes !== undefined) this.notes = String(this.notes || '').trim();

  if (this.phone !== undefined) {
    this.phone = normalizeClientPhone(this.phone);
  }

  if (this.email !== undefined) {
    this.email = normalizeClientEmail(this.email);
  }
});

const Client = mongoose.model('Client', clientSchema);
export default Client;
