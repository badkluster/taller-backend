import mongoose from "mongoose";

const emailCampaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true }, // HTML content
    template: { type: String },
    target: { type: String, default: 'all' },
    status: { type: String, enum: ['DRAFT', 'SENT'], default: 'DRAFT' },
    sentCount: { type: Number, default: 0 },
    sentAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    stats: {
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  },
);

const emailLogSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailCampaign" },
    to: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    subject: { type: String },
    status: { type: String, enum: ["SENT", "FAILED"], default: "SENT" },
    errorMessage: { type: String },
    openedAt: { type: Date },
    clickedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

export const EmailCampaign = mongoose.model(
  "EmailCampaign",
  emailCampaignSchema,
);
export const EmailLog = mongoose.model("EmailLog", emailLogSchema);
