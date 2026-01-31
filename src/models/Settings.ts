import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  shopName: { type: String, default: 'Taller Plan B' },
  address: { type: String },
  phone: { type: String },
  emailFrom: { type: String },
  workingHours: { type: String }, // JSON string or structured object if preferred
  holidays: [{ type: Date }],
  reminderRules: {
    h24: { type: Boolean, default: true },
    h2: { type: Boolean, default: true }
  },
  invoiceSeriesPrefix: { type: String, default: 'A-' },
  logoUrl: { type: String }
}, {
  timestamps: true,
});

// We only need one settings document
const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
