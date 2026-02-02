import { Request, Response } from 'express';
import CampaignTemplate from '../models/CampaignTemplate';

// @desc    Get templates
// @route   GET /api/campaign-templates
// @access  Private/Admin
export const getCampaignTemplates = async (req: Request, res: Response) => {
  const templates = await CampaignTemplate.find().sort({ createdAt: -1 });
  res.json(templates);
};

// @desc    Create template
// @route   POST /api/campaign-templates
// @access  Private/Admin
export const createCampaignTemplate = async (req: Request, res: Response) => {
  const { title, subject, body, type } = req.body;
  if (!req.user) throw new Error('No autorizado');

  if (!title || !subject || !body) {
    res.status(400);
    throw new Error('Título, asunto y contenido son obligatorios');
  }

  const template = await CampaignTemplate.create({
    title,
    subject,
    body,
    type: type || 'CUSTOM',
    createdBy: req.user._id,
  });

  res.status(201).json(template);
};

// @desc    Delete template
// @route   DELETE /api/campaign-templates/:id
// @access  Private/Admin
export const deleteCampaignTemplate = async (req: Request, res: Response) => {
  const template = await CampaignTemplate.findById(req.params.id);
  if (!template) {
    res.status(404);
    throw new Error('Template no encontrado');
  }

  await template.deleteOne();
  res.json({ message: 'Template eliminado' });
};
