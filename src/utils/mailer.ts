import nodemailer from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer';

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Attachment[];
};

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP config incompleta. Revisar SMTP_HOST/SMTP_USER/SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

export const sendEmail = async ({ to, subject, html, text, bcc, replyTo, attachments }: SendEmailInput) => {
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
