import {
  appointmentCancelledTemplate,
  appointmentClientNotificationTemplate,
  appointmentCreatedTemplate,
  appointmentRequestConfirmedTemplate,
  appointmentRequestRejectedTemplate,
  clientPrepaidSummaryEmailTemplate,
  estimateEmailTemplate,
  invoiceEmailTemplate,
  ownerNewAppointmentRequestTemplate,
  prepaidOfferEmailTemplate,
} from "../utils/emailTemplates";

type TemplatePreview = {
  name: string;
  subject: string;
  text: string;
};

const settings = {
  shopName: "Taller Suarez",
  address: "Av. Siempre Viva 742",
  phone: "+54 11 5555-5555",
  emailFrom: "taller@example.com",
  websiteUrl: "https://taller.example.com",
  bankAlias: "TALLER.SALDO",
  bankName: "Banco Ejemplo",
  bankCbu: "0000003100000000000001",
  bankHolderFirstName: "Juan",
  bankHolderLastName: "Suarez",
};

const dateAm = new Date("2026-02-25T04:30:00.000Z"); // 01:30 local (-03)
const dateAmEnd = new Date("2026-02-25T05:00:00.000Z"); // 02:00 local (-03)
const datePm = new Date("2026-02-25T16:30:00.000Z"); // 13:30 local (-03)
const datePmEnd = new Date("2026-02-25T17:00:00.000Z"); // 14:00 local (-03)

const previews: TemplatePreview[] = [
  {
    name: "appointmentCreatedTemplate",
    ...appointmentCreatedTemplate({
      appointmentId: "APT-1001",
      startAt: dateAm,
      endAt: dateAmEnd,
      serviceType: "Diagnostico",
      notes: "Revisar bateria y arranque.",
      clientName: "Carlos Diaz",
      clientPhone: "+54 11 4000-4000",
      clientEmail: "carlos@example.com",
      vehicleLabel: "Ford Fiesta AB123CD",
      settings,
    }),
  },
  {
    name: "appointmentClientNotificationTemplate",
    ...appointmentClientNotificationTemplate({
      mode: "RESCHEDULED",
      startAt: datePm,
      endAt: datePmEnd,
      serviceType: "Reparacion",
      notes: "Cambio de correa.",
      clientName: "Lucia Gomez",
      vehicleLabel: "VW Gol AA111BB",
      settings,
    }),
  },
  {
    name: "estimateEmailTemplate",
    ...estimateEmailTemplate({
      estimateNumber: "P-2026-0001",
      total: 125000,
      pdfUrl: "https://files.example.com/estimate.pdf",
      clientName: "Sofia Ruiz",
      vehicleLabel: "Peugeot 208 AC222DD",
      validUntil: datePm,
      settings,
    }),
  },
  {
    name: "invoiceEmailTemplate",
    ...invoiceEmailTemplate({
      invoiceNumber: "F-2026-0042",
      total: 93000,
      pdfUrl: "https://files.example.com/invoice.pdf",
      clientName: "Martin Lopez",
      vehicleLabel: "Renault Clio AD333EE",
      prepaidApplied: 10000,
      invoiceType: "WORK_ORDER",
      settings,
    }),
  },
  {
    name: "prepaidOfferEmailTemplate",
    ...prepaidOfferEmailTemplate({
      subject: "Beneficio opcional de saldo",
      clientName: "Julia Ramos",
      customBody: "Podes cargar saldo cuando quieras.\nNo hay debito automatico.",
      balance: 35000,
      settings,
    }),
  },
  {
    name: "appointmentRequestConfirmedTemplate",
    ...appointmentRequestConfirmedTemplate({
      clientName: "Ana Torres",
      confirmedAt: datePm,
      vehicleLabel: "Fiat Cronos AE444FF",
      description: "Service de 20.000 km.",
      googleCalendarUrl: "https://calendar.google.com/event?action=TEMPLATE",
      settings,
    }),
  },
  {
    name: "appointmentRequestRejectedTemplate",
    ...appointmentRequestRejectedTemplate({
      clientName: "Pedro Salas",
      vehicleLabel: "Chevrolet Onix AF555GG",
      rejectionReason: "No hay cupos para esa fecha.",
      followUpText: "Responde este correo y buscamos otra opcion.",
      requestUrl: "https://taller.example.com/solicitar-turno",
      requestUrlLabel: "Solicitar turno",
      settings,
    }),
  },
  {
    name: "appointmentCancelledTemplate",
    ...appointmentCancelledTemplate({
      clientName: "Marta Silva",
      vehicleLabel: "Toyota Etios AG666HH",
      scheduledAt: dateAm,
      cancelReason: "Imprevisto operativo del taller.",
      followUpText: "Te ayudamos a elegir un nuevo horario.",
      requestUrl: "https://taller.example.com/solicitar-turno",
      requestUrlLabel: "Solicitar nuevo turno",
      settings,
    }),
  },
  {
    name: "ownerNewAppointmentRequestTemplate",
    ...ownerNewAppointmentRequestTemplate({
      clientName: "Diego Ferreyra",
      phone: "+54 11 4333-2211",
      email: "diego@example.com",
      vehicleLabel: "Nissan March AH777II",
      requestTypeLabel: "Diagnostico / Presupuesto",
      description: "Ruido en tren delantero.",
      suggestedDates: [dateAm, datePm],
      manageRequestsUrl: "https://taller.example.com/admin/solicitudes",
      notificationType: "NEW",
      settings,
    }),
  },
  {
    name: "clientPrepaidSummaryEmailTemplate",
    ...clientPrepaidSummaryEmailTemplate({
      clientName: "Paula Nunez",
      balance: 42000,
      settings,
      movements: [
        {
          createdAt: dateAm,
          type: "DEPOSIT",
          direction: "CREDIT",
          amount: 30000,
          balanceAfter: 30000,
          note: "Transferencia recibida",
        },
        {
          createdAt: datePm,
          type: "USAGE_INVOICE",
          direction: "DEBIT",
          amount: 8000,
          balanceAfter: 22000,
          note: "Aplicado en factura F-2026-0042",
        },
      ],
    }),
  },
];

const printPreview = (preview: TemplatePreview) => {
  console.log(`\n=== ${preview.name} ===`);
  console.log(`Subject: ${preview.subject}`);
  console.log("Text:");
  console.log(preview.text);
};

console.log("Email templates preview (24h check):");
previews.forEach(printPreview);
