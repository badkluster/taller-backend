import mongoose from "mongoose";
import { normalizePlate } from "../utils/normalizePlate";

const vehicleDataSchema = new mongoose.Schema(
  {
    plateRaw: { type: String, required: true },
    plateNormalized: { type: String, required: true, index: true },
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },
    km: { type: Number },
    color: { type: String },
  },
  { _id: false },
);

const appointmentRequestSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
    },
    vehicleData: { type: vehicleDataSchema, required: true },
    requestType: {
      type: String,
      enum: ["diagnosis", "repair", "quick_estimate"],
      required: true,
    },
    quickEstimateScope: {
      type: String,
      enum: ["LABOR_ONLY", "WITH_MATERIALS"],
    },
    quickEstimateDetails: {
      engine: { type: String, trim: true },
      valves: { type: String, trim: true },
      engineCode: { type: String, trim: true },
      partsPreference: { type: String, trim: true },
      specialRequest: { type: String, trim: true },
    },
    description: { type: String, trim: true, default: "" },
    suggestedDates: [{ type: Date, required: true }],
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    rejectionReason: { type: String, trim: true },
    confirmedAppointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
    confirmedWorkOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkOrder",
    },
    confirmedAt: { type: Date },
    rejectedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

appointmentRequestSchema.pre(
  "validate",
  function normalizeVehiclePlate(this: any) {
    if (this.vehicleData?.plateRaw) {
      this.vehicleData.plateNormalized = normalizePlate(
        this.vehicleData.plateRaw,
      );
    }
  },
);

const AppointmentRequest = mongoose.model(
  "AppointmentRequest",
  appointmentRequestSchema,
);
export default AppointmentRequest;
