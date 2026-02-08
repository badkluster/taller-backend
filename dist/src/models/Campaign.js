"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailLog = exports.EmailCampaign = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const emailCampaignSchema = new mongoose_1.default.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    template: { type: String },
    target: { type: String, default: 'all' },
    status: { type: String, enum: ['DRAFT', 'SENT'], default: 'DRAFT' },
    sentCount: { type: Number, default: 0 },
    sentAt: { type: Date },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "User" },
    stats: {
        sent: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        opened: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },
    },
}, {
    timestamps: true,
});
const emailLogSchema = new mongoose_1.default.Schema({
    campaignId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "EmailCampaign" },
    to: { type: String, required: true },
    clientId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Client" },
    vehicleId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Vehicle" },
    subject: { type: String },
    status: { type: String, enum: ["SENT", "FAILED"], default: "SENT" },
    errorMessage: { type: String },
    openedAt: { type: Date },
    clickedAt: { type: Date },
}, {
    timestamps: true,
});
exports.EmailCampaign = mongoose_1.default.model("EmailCampaign", emailCampaignSchema);
exports.EmailLog = mongoose_1.default.model("EmailLog", emailLogSchema);
//# sourceMappingURL=Campaign.js.map