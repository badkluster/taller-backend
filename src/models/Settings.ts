import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    shopName: { type: String, default: "Taller Suarez" },
    address: { type: String },
    phone: { type: String },
    emailFrom: { type: String },
    workingHours: { type: String }, // JSON string or structured object if preferred
    bankAlias: { type: String },
    bankName: { type: String },
    bankCbu: { type: String },
    bankHolderFirstName: { type: String },
    bankHolderLastName: { type: String },
    estimateValidityDays: { type: Number, default: 15, min: 1, max: 365 },
    prepaidBalanceEnabled: { type: Boolean, default: false },
    prepaidReminderEnabled: { type: Boolean, default: false },
    prepaidReminderDay: { type: Number, default: 5, min: 1, max: 28 },
    prepaidOfferWhatsAppTemplate: {
      type: String,
      default:
        "Hola {{nombre}}. Te ofrecemos un beneficio opcional: podes ir dejando saldo a favor para futuros services o reparaciones. Es una forma simple de anticiparte a gastos del auto.",
    },
    prepaidOfferEmailSubject: {
      type: String,
      default: "Beneficio opcional: saldo a favor para futuros servicios",
    },
    prepaidOfferEmailBody: {
      type: String,
      default:
        "Hola {{nombre}},\n\nQueremos ofrecerte un beneficio opcional de saldo a favor. Podes ir depositando cuando te quede cómodo y usar ese saldo en futuros services o reparaciones.\n\nNo es obligatorio y no genera compromiso mensual: es una herramienta para planificar mejor tus gastos del vehículo.",
    },
    prepaidReminderEmailSubject: {
      type: String,
      default: "Recordatorio amable: saldo a favor disponible",
    },
    prepaidReminderEmailBody: {
      type: String,
      default:
        "Hola {{nombre}},\n\nTe recordamos que tenés disponible nuestro beneficio de saldo a favor. Si este mes querés sumar una parte, te ayuda a anticiparte a futuros services o reparaciones.\n\nEs totalmente opcional.",
    },
    holidays: [{ type: Date }],
    reminderRules: {
      h24: { type: Boolean, default: true },
      h2: { type: Boolean, default: true },
    },
    unavailableRanges: [
      {
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        reason: { type: String },
      },
    ],
    invoiceSeriesPrefix: { type: String, default: "A-" },
    logoUrl: { type: String },
  },
  {
    timestamps: true,
  },
);

// We only need one settings document
const Settings = mongoose.model("Settings", settingsSchema);
export default Settings;
