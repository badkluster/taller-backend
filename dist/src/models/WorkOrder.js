"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const workOrderSchema = new mongoose_1.default.Schema({
    appointmentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Appointment', index: false },
    vehicleId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    clientId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Client', required: true },
    category: { type: String, enum: ['PRESUPUESTO', 'REPARACION', 'GENERAL'], default: 'GENERAL' },
    status: {
        type: String,
        enum: ['PRESUPUESTO', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'],
        default: 'PRESUPUESTO'
    },
    workDetailsText: { type: String },
    maintenanceDetail: { type: String },
    maintenanceNotice: { type: Boolean, default: false },
    maintenanceDate: { type: Date },
    maintenanceLastNotifiedAt: { type: Date },
    workStartedAt: { type: Date },
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
    estimatePdfUrl: { type: String },
    estimateNumber: { type: String },
    invoicePdfUrl: { type: String },
    invoiceNumber: { type: String },
    originalEstimatePdfUrl: { type: String },
    originalEstimateNumber: { type: String },
    evidence: [{
            type: { type: String, enum: ['text', 'image', 'video', 'file'] },
            text: { type: String },
            url: { type: String },
            fileName: { type: String },
            mimeType: { type: String },
            size: { type: Number },
            createdAt: { type: Date, default: Date.now }
        }],
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
});
const WorkOrder = mongoose_1.default.model('WorkOrder', workOrderSchema);
exports.default = WorkOrder;
//# sourceMappingURL=WorkOrder.js.map