import mongoose from 'mongoose';

const campaignTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, enum: ['DISCOUNT', 'INFO', 'CUSTOM'], default: 'CUSTOM' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const CampaignTemplate = mongoose.model('CampaignTemplate', campaignTemplateSchema);
export default CampaignTemplate;
