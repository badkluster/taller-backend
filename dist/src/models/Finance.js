"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Invoice = exports.Estimate = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const estimateSchema = new mongoose_1.default.Schema({
    vehicleId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    clientId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Client', required: true },
    appointmentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Appointment' },
    workOrderId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'WorkOrder' },
    number: { type: String, required: true, unique: true, index: true },
    pdfUrl: { type: String },
    status: { type: String, enum: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'], default: 'DRAFT' },
    items: [{
            description: { type: String },
            qty: { type: Number },
            unitPrice: { type: Number },
            total: { type: Number }
        }],
    laborCost: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    sentAt: { type: Date },
    channelsUsed: [{ type: String, enum: ['EMAIL', 'WHATSAPP'] }]
}, {
    timestamps: true,
});
const invoiceSchema = new mongoose_1.default.Schema({
    vehicleId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    clientId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Client', required: true },
    workOrderId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'WorkOrder' },
    number: { type: String, required: true, unique: true, index: true },
    pdfUrl: { type: String },
    items: [{
            description: { type: String },
            qty: { type: Number },
            unitPrice: { type: Number },
            total: { type: Number }
        }],
    laborCost: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['CASH', 'TRANSFER', 'CARD', 'OTHER'] },
    issuedAt: { type: Date, default: Date.now },
    sentAt: { type: Date }
}, {
    timestamps: true,
});
exports.Estimate = mongoose_1.default.model('Estimate', estimateSchema);
exports.Invoice = mongoose_1.default.model('Invoice', invoiceSchema);
//# sourceMappingURL=Finance.js.map