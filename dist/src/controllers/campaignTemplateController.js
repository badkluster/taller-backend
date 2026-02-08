"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCampaignTemplate = exports.createCampaignTemplate = exports.getCampaignTemplates = void 0;
const CampaignTemplate_1 = __importDefault(require("../models/CampaignTemplate"));
const getCampaignTemplates = async (req, res) => {
    const templates = await CampaignTemplate_1.default.find().sort({ createdAt: -1 });
    res.json(templates);
};
exports.getCampaignTemplates = getCampaignTemplates;
const createCampaignTemplate = async (req, res) => {
    const { title, subject, body, type } = req.body;
    if (!req.user)
        throw new Error('No autorizado');
    if (!title || !subject || !body) {
        res.status(400);
        throw new Error('Título, asunto y contenido son obligatorios');
    }
    const template = await CampaignTemplate_1.default.create({
        title,
        subject,
        body,
        type: type || 'CUSTOM',
        createdBy: req.user._id,
    });
    res.status(201).json(template);
};
exports.createCampaignTemplate = createCampaignTemplate;
const deleteCampaignTemplate = async (req, res) => {
    const template = await CampaignTemplate_1.default.findById(req.params.id);
    if (!template) {
        res.status(404);
        throw new Error('Template no encontrado');
    }
    await template.deleteOne();
    res.json({ message: 'Template eliminado' });
};
exports.deleteCampaignTemplate = deleteCampaignTemplate;
//# sourceMappingURL=campaignTemplateController.js.map