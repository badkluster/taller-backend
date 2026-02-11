import mongoose from "mongoose";

export type ClientPrepaidMovementType =
  | "DEPOSIT"
  | "USAGE_INVOICE"
  | "ADJUSTMENT_PLUS"
  | "ADJUSTMENT_MINUS"
  | "REFUND";

export type ClientPrepaidMovementDirection = "CREDIT" | "DEBIT";

const clientPrepaidMovementSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "DEPOSIT",
        "USAGE_INVOICE",
        "ADJUSTMENT_PLUS",
        "ADJUSTMENT_MINUS",
        "REFUND",
      ],
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkOrder" },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    note: { type: String },
    source: {
      type: String,
      enum: ["MANUAL", "INVOICE_FLOW", "SYSTEM"],
      default: "MANUAL",
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
  },
);

clientPrepaidMovementSchema.index({ clientId: 1, createdAt: -1 });

const ClientPrepaidMovement = mongoose.model(
  "ClientPrepaidMovement",
  clientPrepaidMovementSchema,
);
export default ClientPrepaidMovement;

