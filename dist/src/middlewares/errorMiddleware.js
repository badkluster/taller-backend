"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFound = void 0;
const logger_1 = require("../utils/logger");
const ErrorLog_1 = __importDefault(require("../models/ErrorLog"));
const mailer_1 = require("../utils/mailer");
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};
exports.notFound = notFound;
const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    (async () => {
        try {
            const log = await ErrorLog_1.default.create({
                message: err.message,
                stack: err.stack,
                statusCode,
                path: req.originalUrl,
                method: req.method,
                userId: req.user?._id,
                requestBody: req.body,
                requestQuery: req.query,
                requestParams: req.params,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            });
            if (statusCode >= 500) {
                const to = process.env.ERROR_ALERT_EMAIL || 'jorge.ema.dominguez@gmail.com';
                const subject = `[Taller] Error ${statusCode} - ${req.method} ${req.originalUrl}`;
                const html = `
          <div style="font-family:Arial,sans-serif;color:#0f172a;">
            <h2>Error en plataforma</h2>
            <p><strong>Mensaje:</strong> ${err.message}</p>
            <p><strong>Status:</strong> ${statusCode}</p>
            <p><strong>Ruta:</strong> ${req.method} ${req.originalUrl}</p>
            <p><strong>IP:</strong> ${req.ip}</p>
            <p><strong>Usuario:</strong> ${req.user?._id || '-'}</p>
            ${log?._id ? `<p><strong>Log ID:</strong> ${log._id}</p>` : ''}
          </div>
        `;
                await (0, mailer_1.sendEmail)({ to, subject, html });
            }
        }
        catch (logError) {
            logger_1.logger.error({ err: logError }, 'Failed to persist ErrorLog');
        }
    })();
    logger_1.logger.error({
        message: err.message,
        statusCode,
        method: req.method,
        path: req.originalUrl,
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    }, 'API Error');
    console.error('[API Error]', err.message, req.method, req.originalUrl);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errorMiddleware.js.map