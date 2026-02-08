"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const normalizePlate_1 = require("../utils/normalizePlate");
const vehicleSchema = new mongoose_1.default.Schema({
    plateRaw: { type: String, required: true },
    plateNormalized: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },
    color: { type: String },
    km: { type: Number },
    currentOwner: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "Client",
        required: true,
    },
    ownerHistory: [
        {
            clientId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Client" },
            fromAt: { type: Date, default: Date.now },
            toAt: { type: Date },
            note: { type: String },
        },
    ],
}, {
    timestamps: true,
});
vehicleSchema.pre("validate", function () {
    if (this.plateRaw) {
        this.plateNormalized = (0, normalizePlate_1.normalizePlate)(this.plateRaw);
    }
});
const Vehicle = mongoose_1.default.model("Vehicle", vehicleSchema);
exports.default = Vehicle;
//# sourceMappingURL=Vehicle.js.map