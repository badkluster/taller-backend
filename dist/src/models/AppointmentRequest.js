"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const normalizePlate_1 = require("../utils/normalizePlate");
const vehicleDataSchema = new mongoose_1.default.Schema({
    plateRaw: { type: String, required: true },
    plateNormalized: { type: String, required: true, index: true },
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },
    km: { type: Number },
    color: { type: String },
}, { _id: false });
const appointmentRequestSchema = new mongoose_1.default.Schema({
    clientName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    clientId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Client',
    },
    vehicleId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Vehicle',
    },
    vehicleData: { type: vehicleDataSchema, required: true },
    requestType: {
        type: String,
        enum: ['diagnosis', 'repair'],
        required: true,
    },
    description: { type: String, trim: true, default: '' },
    suggestedDates: [{ type: Date, required: true }],
    status: {
        type: String,
        enum: ['PENDING', 'CONFIRMED', 'REJECTED'],
        default: 'PENDING',
        index: true,
    },
    rejectionReason: { type: String, trim: true },
    confirmedAppointmentId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Appointment',
    },
    confirmedAt: { type: Date },
    rejectedAt: { type: Date },
}, {
    timestamps: true,
});
appointmentRequestSchema.pre('validate', function normalizeVehiclePlate() {
    if (this.vehicleData?.plateRaw) {
        this.vehicleData.plateNormalized = (0, normalizePlate_1.normalizePlate)(this.vehicleData.plateRaw);
    }
});
const AppointmentRequest = mongoose_1.default.model('AppointmentRequest', appointmentRequestSchema);
exports.default = AppointmentRequest;
//# sourceMappingURL=AppointmentRequest.js.map