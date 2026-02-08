"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackOpen = exports.sendCampaign = exports.createCampaign = exports.getCampaigns = void 0;
const Campaign_1 = require("../models/Campaign");
const Client_1 = __importDefault(require("../models/Client"));
const Settings_1 = __importDefault(require("../models/Settings"));
const mailer_1 = require("../utils/mailer");
const branding_1 = require("../utils/branding");
const getCampaigns = async (req, res) => {
    const campaigns = await Campaign_1.EmailCampaign.find().sort({ createdAt: -1 });
    res.json(campaigns);
};
exports.getCampaigns = getCampaigns;
const createCampaign = async (req, res) => {
    const { title, subject, body, target, template } = req.body;
    if (!req.user)
        throw new Error('No autorizado');
    const campaign = await Campaign_1.EmailCampaign.create({
        title,
        subject,
        body,
        template,
        target: target || 'all',
        status: 'DRAFT',
        sentCount: 0,
        createdBy: req.user._id,
        stats: { sent: 0, failed: 0 }
    });
    res.status(201).json(campaign);
};
exports.createCampaign = createCampaign;
const sendCampaign = async (req, res) => {
    const campaign = await Campaign_1.EmailCampaign.findById(req.params.id);
    if (!campaign) {
        res.status(404);
        throw new Error('Campaña no encontrada');
    }
    if (campaign.status === 'SENT') {
        return res.json(campaign);
    }
    const settings = await Settings_1.default.findOne();
    const shopName = settings?.shopName || 'Taller';
    const logoUrl = (0, branding_1.resolveLogoUrl)(settings?.logoUrl);
    const address = settings?.address;
    const phone = settings?.phone;
    const emailFrom = settings?.emailFrom;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const clients = await Client_1.default.find({ email: { $exists: true, $ne: '' } });
    let sent = 0;
    let failed = 0;
    for (const client of clients) {
        try {
            if (!client.email) {
                failed += 1;
                continue;
            }
            const openPixelUrl = `${baseUrl}/api/campaigns/track/open?cid=${campaign._id}&email=${encodeURIComponent(client.email)}`;
            const ctaUrl = `${frontendUrl}/`;
            const safeBody = (campaign.body || '').replace(/\n/g, '<br/>');
            const html = `
        <div style="margin:0;background:#f8fafc;padding:24px 0;font-family:Arial,sans-serif;color:#0f172a;">
          <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:20px 28px;background:#0f172a;color:#ffffff;">
                <table role="presentation" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="font-size:18px;font-weight:800;letter-spacing:0.5px;">${shopName}</div>
                    </td>
                    <td style="text-align:right;">
                      ${logoUrl ? `<img src="${logoUrl}" alt="${shopName}" style="height:42px;object-fit:contain;" />` : ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:20px;font-weight:700;margin-bottom:12px;">${campaign.subject}</div>
                <div style="font-size:15px;line-height:1.6;color:#334155;">${safeBody}</div>
                <div style="margin-top:20px;">
                  <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">
                    Agendar un turno
                  </a>
                </div>
                <div style="margin-top:24px;padding:16px;border-radius:12px;background:#f1f5f9;color:#475569;font-size:13px;">
                  ${address ? `<div><strong>Dirección:</strong> ${address}</div>` : ''}
                  ${phone ? `<div><strong>Teléfono:</strong> ${phone}</div>` : ''}
                  ${emailFrom ? `<div><strong>Email:</strong> ${emailFrom}</div>` : ''}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center;">
                Gracias por confiar en ${shopName}.
              </td>
            </tr>
          </table>
          <img src="${openPixelUrl}" width="1" height="1" style="display:none;" alt="" />
        </div>
      `;
            await (0, mailer_1.sendEmail)({
                to: client.email,
                subject: campaign.subject,
                html,
            });
            await Campaign_1.EmailLog.create({
                campaignId: campaign._id,
                to: client.email,
                clientId: client._id,
                subject: campaign.subject,
                status: 'SENT',
            });
            sent += 1;
        }
        catch (error) {
            if (client?.email) {
                await Campaign_1.EmailLog.create({
                    campaignId: campaign._id,
                    to: client.email,
                    clientId: client._id,
                    subject: campaign.subject,
                    status: 'FAILED',
                    errorMessage: error.message,
                });
            }
            failed += 1;
        }
    }
    campaign.status = 'SENT';
    campaign.sentAt = new Date();
    campaign.sentCount = sent;
    if (campaign.stats) {
        campaign.stats.sent = sent;
        campaign.stats.failed = failed;
    }
    await campaign.save();
    return res.json(campaign);
};
exports.sendCampaign = sendCampaign;
const trackOpen = async (req, res) => {
    const { cid, email } = req.query;
    if (!cid || !email) {
        res.status(400);
        return res.end();
    }
    const log = await Campaign_1.EmailLog.findOne({ campaignId: cid, to: email });
    if (log && !log.openedAt) {
        log.openedAt = new Date();
        await log.save();
        await Campaign_1.EmailCampaign.findByIdAndUpdate(cid, { $inc: { 'stats.opened': 1 } });
    }
    const pixel = Buffer.from('R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(pixel);
};
exports.trackOpen = trackOpen;
//# sourceMappingURL=campaignController.js.map