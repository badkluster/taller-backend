"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const reminderJobSchema = new mongoose_1.default.Schema({
    appointmentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Appointment', required: true },
    runAt: { type: Date, required: true },
    channel: { type: String, enum: ['EMAIL', 'WHATSAPP'], required: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' },
    tries: { type: Number, default: 0 },
    lastError: { type: String }
}, {
    timestamps: true,
});
const ReminderJob = mongoose_1.default.model('ReminderJob', reminderJobSchema);
exports.default = ReminderJob;
//# sourceMappingURL=ReminderJob.js.map