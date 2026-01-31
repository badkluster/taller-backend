import mongoose from 'mongoose';

const reminderJobSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  runAt: { type: Date, required: true },
  channel: { type: String, enum: ['EMAIL', 'WHATSAPP'], required: true },
  status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' },
  tries: { type: Number, default: 0 },
  lastError: { type: String }
}, {
  timestamps: true,
});

const ReminderJob = mongoose.model('ReminderJob', reminderJobSchema);
export default ReminderJob;
