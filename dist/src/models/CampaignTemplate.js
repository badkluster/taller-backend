"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const campaignTemplateSchema = new mongoose_1.default.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, enum: ['DISCOUNT', 'INFO', 'CUSTOM'], default: 'CUSTOM' },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
const CampaignTemplate = mongoose_1.default.model('CampaignTemplate', campaignTemplateSchema);
exports.default = CampaignTemplate;
//# sourceMappingURL=CampaignTemplate.js.map