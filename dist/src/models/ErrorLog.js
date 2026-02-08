"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const errorLogSchema = new mongoose_1.default.Schema({
    message: { type: String, required: true },
    stack: { type: String },
    statusCode: { type: Number },
    path: { type: String },
    method: { type: String },
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    requestBody: { type: mongoose_1.default.Schema.Types.Mixed },
    requestQuery: { type: mongoose_1.default.Schema.Types.Mixed },
    requestParams: { type: mongoose_1.default.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
}, { timestamps: true });
const ErrorLog = mongoose_1.default.model('ErrorLog', errorLogSchema);
exports.default = ErrorLog;
//# sourceMappingURL=ErrorLog.js.map