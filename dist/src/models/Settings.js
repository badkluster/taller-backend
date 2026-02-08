"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const settingsSchema = new mongoose_1.default.Schema({
    shopName: { type: String, default: "Taller Suarez" },
    address: { type: String },
    phone: { type: String },
    emailFrom: { type: String },
    workingHours: { type: String },
    holidays: [{ type: Date }],
    reminderRules: {
        h24: { type: Boolean, default: true },
        h2: { type: Boolean, default: true },
    },
    unavailableRanges: [
        {
            startAt: { type: Date, required: true },
            endAt: { type: Date, required: true },
            reason: { type: String },
        },
    ],
    invoiceSeriesPrefix: { type: String, default: "A-" },
    logoUrl: { type: String },
}, {
    timestamps: true,
});
const Settings = mongoose_1.default.model("Settings", settingsSchema);
exports.default = Settings;
//# sourceMappingURL=Settings.js.map