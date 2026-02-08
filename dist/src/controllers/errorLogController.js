"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteErrorLog = exports.getErrorLogs = void 0;
const ErrorLog_1 = __importDefault(require("../models/ErrorLog"));
const getErrorLogs = async (req, res) => {
    const pageSize = Number(req.query.pageSize) || 20;
    const page = Number(req.query.pageNumber) || 1;
    const keyword = req.query.keyword
        ? {
            $or: [
                { message: { $regex: req.query.keyword, $options: 'i' } },
                { path: { $regex: req.query.keyword, $options: 'i' } },
                { method: { $regex: req.query.keyword, $options: 'i' } },
            ],
        }
        : {};
    const count = await ErrorLog_1.default.countDocuments({ ...keyword });
    const logs = await ErrorLog_1.default.find({ ...keyword })
        .sort({ createdAt: -1 })
        .limit(pageSize)
        .skip(pageSize * (page - 1));
    res.json({ logs, page, pages: Math.ceil(count / pageSize), totalCount: count });
};
exports.getErrorLogs = getErrorLogs;
const deleteErrorLog = async (req, res) => {
    const log = await ErrorLog_1.default.findById(req.params.id);
    if (!log) {
        res.status(404);
        throw new Error('Log no encontrado');
    }
    await log.deleteOne();
    res.json({ message: 'Log eliminado' });
};
exports.deleteErrorLog = deleteErrorLog;
//# sourceMappingURL=errorLogController.js.map