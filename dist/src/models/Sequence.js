"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const sequenceSchema = new mongoose_1.default.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Number, required: true, default: 0 },
}, {
    timestamps: true,
});
const Sequence = mongoose_1.default.model('Sequence', sequenceSchema);
exports.default = Sequence;
//# sourceMappingURL=Sequence.js.map