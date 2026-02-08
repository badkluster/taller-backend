"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const getTransporter = () => {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
        throw new Error('SMTP config incompleta. Revisar SMTP_HOST/SMTP_USER/SMTP_PASS.');
    }
    return nodemailer_1.default.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });
};
const sendEmail = async ({ to, subject, html, text, bcc, replyTo, attachments }) => {
    const transporter = getTransporter();
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@taller.com';
    const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text,
        bcc,
        replyTo,
        attachments,
    });
    return info;
};
exports.sendEmail = sendEmail;
//# sourceMappingURL=mailer.js.map