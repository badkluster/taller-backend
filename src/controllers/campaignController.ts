import { Request, Response } from 'express';
import { EmailCampaign } from '../models/Campaign';
import Client from '../models/Client';
// import { sendEmail } from '../utils/mailer'; // TODO

// @desc    Get Campaigns
// @route   GET /api/campaigns
// @access  Private/Admin
export const getCampaigns = async (req: Request, res: Response) => {
  const campaigns = await EmailCampaign.find().sort({ createdAt: -1 });
  res.json(campaigns);
};

// @desc    Create and Send Campaign
// @route   POST /api/campaigns
// @access  Private/Admin
export const createCampaign = async (req: Request, res: Response) => {
  const { title, subject, body, target } = req.body; // target: 'all' or specific

  if (!req.user) throw new Error('No autorizado');

  const campaign = await EmailCampaign.create({
    title,
    subject,
    body,
    createdBy: req.user._id,
    stats: { sent: 0, failed: 0 }
  });

  // Mock processing in background
  // In real app, push to queue. Here we just select clients and "mock" send.
  
  const clients = await Client.find({}); // if target 'all'
  
  // Update stats mock
  if (campaign.stats) {
    campaign.stats.sent = clients.length;
  }
  await campaign.save();

  res.status(201).json(campaign);
};
