"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const appointmentSchema = new mongoose_1.default.Schema({
    vehicleId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    clientId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Client', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
        type: String,
        enum: ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED', 'IN_PROGRESS'],
        default: 'SCHEDULED'
    },
    serviceType: { type: String, required: true },
    notes: { type: String },
    assignedToUserId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    cancelReason: { type: String },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
}, {
    timestamps: true,
});
const Appointment = mongoose_1.default.model('Appointment', appointmentSchema);
exports.default = Appointment;
//# sourceMappingURL=Appointment.js.map