import { resolveLogoUrl } from "./branding";

type ShopSettings = {
  shopName?: string;
  address?: string;
  phone?: string;
  emailFrom?: string;
  logoUrl?: string;
  websiteUrl?: string;
  bankAlias?: string;
  bankName?: string;
  bankCbu?: string;
  bankHolderFirstName?: string;
  bankHolderLastName?: string;
};

const escapeHtml = (value?: string | null) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);

const renderMultilineParagraphs = (value?: string | null) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 10px; color:#334155; line-height:1.6;">${escapeHtml(
          paragraph,
        ).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
};

const resolvePrepaidPaymentDetails = (settings: ShopSettings) => {
  const bankAlias = String(settings.bankAlias || "").trim();
  const bankName = String(settings.bankName || "").trim();
  const bankCbu = String(settings.bankCbu || "").trim();
  const bankHolder = [
    String(settings.bankHolderFirstName || "").trim(),
    String(settings.bankHolderLastName || "").trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const whatsapp = String(settings.phone || "").trim();

  return {
    bankAlias,
    bankName,
    bankCbu,
    bankHolder,
    whatsapp,
    hasBankData: Boolean(bankAlias || bankName || bankCbu || bankHolder),
  };
};

export const prepaidPaymentInstructionsHtml = (settings: ShopSettings) => {
  const details = resolvePrepaidPaymentDetails(settings);
  const bankRows = [
    details.bankName
      ? `<tr><td style="padding:4px 10px 4px 0; color:#64748b;">Banco</td><td style="padding:4px 0; color:#0f172a; font-weight:700;">${escapeHtml(details.bankName)}</td></tr>`
      : "",
    details.bankAlias
      ? `<tr><td style="padding:4px 10px 4px 0; color:#64748b;">Alias</td><td style="padding:4px 0; color:#0f172a; font-weight:700;">${escapeHtml(details.bankAlias)}</td></tr>`
      : "",
    details.bankCbu
      ? `<tr><td style="padding:4px 10px 4px 0; color:#64748b;">CBU</td><td style="padding:4px 0; color:#0f172a; font-weight:700;">${escapeHtml(details.bankCbu)}</td></tr>`
      : "",
    details.bankHolder
      ? `<tr><td style="padding:4px 10px 4px 0; color:#64748b;">Titular</td><td style="padding:4px 0; color:#0f172a; font-weight:700;">${escapeHtml(details.bankHolder)}</td></tr>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const bankBlock = details.hasBankData
    ? `
      <div style="margin:0 0 10px;">
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#1e3a8a; margin-bottom:6px; font-weight:700;">
          Datos para transferencia
        </div>
        <table style="border-collapse:collapse; font-size:14px; line-height:1.5;">
          ${bankRows}
        </table>
      </div>
    `
    : "";

  const whatsappInstruction = details.whatsapp
    ? `Una vez realizada la transferencia, enviá el comprobante por WhatsApp al <strong>${escapeHtml(details.whatsapp)}</strong>.`
    : "Una vez realizada la transferencia, enviá el comprobante por WhatsApp para acreditarlo.";

  return `
    ${bankBlock}
    <p style="margin:0; color:#334155; line-height:1.6;">${whatsappInstruction}</p>
  `;
};

export const prepaidPaymentInstructionsText = (settings: ShopSettings) => {
  const details = resolvePrepaidPaymentDetails(settings);
  const lines: string[] = [];

  if (details.hasBankData) {
    lines.push("Datos para transferencia:");
    if (details.bankName) lines.push(`Banco: ${details.bankName}`);
    if (details.bankAlias) lines.push(`Alias: ${details.bankAlias}`);
    if (details.bankCbu) lines.push(`CBU: ${details.bankCbu}`);
    if (details.bankHolder) lines.push(`Titular: ${details.bankHolder}`);
  }

  lines.push(
    details.whatsapp
      ? `Una vez realizada la transferencia, enviá el comprobante por WhatsApp al ${details.whatsapp}.`
      : "Una vez realizada la transferencia, enviá el comprobante por WhatsApp para acreditarlo.",
  );

  return lines.join("\n");
};

const normalizeWebsiteUrl = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `https://${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
};

const resolveWebsiteUrl = (settings: ShopSettings) => {
  const fromSettings = normalizeWebsiteUrl(settings.websiteUrl);
  if (fromSettings) return fromSettings;
  return normalizeWebsiteUrl(
    process.env.FRONTEND_URL || process.env.APP_BASE_URL || "",
  );
};

const baseLayout = (title: string, body: string, settings: ShopSettings) => {
  const logoUrl = resolveLogoUrl(settings.logoUrl);
  const websiteUrl = resolveWebsiteUrl(settings);
  const safeTitle = escapeHtml(title);
  const safeShopName = escapeHtml(settings.shopName || "Taller Mecánico");
  const safeAddress = escapeHtml(settings.address || "");
  const safePhone = escapeHtml(settings.phone || "Sin teléfono");
  const safeEmailFrom = escapeHtml(settings.emailFrom || "");
  const safeWebsiteUrl = escapeHtml(websiteUrl);
  const safeLogoUrl = escapeHtml(logoUrl);
  const logoHtml = logoUrl
    ? `<img src="${safeLogoUrl}" alt="${safeShopName}" style="height:40px; max-width:140px; object-fit:contain;" />`
    : "";

  return `
  <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
      <div style="padding:20px 24px; background:#0f172a; color:#fff;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${logoHtml}
          <div>
            <div style="font-size:18px; font-weight:700;">${safeShopName}</div>
            <div style="font-size:12px; opacity:.8;">${safeAddress}</div>
          </div>
        </div>
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px; font-size:20px; color:#0f172a;">${safeTitle}</h2>
        ${body}
      </div>
      <div style="padding:16px 24px; background:#f1f5f9; font-size:12px; color:#475569;">
        <div>📞 ${safePhone}</div>
        <div>✉️ ${safeEmailFrom}</div>
        ${
          websiteUrl
            ? `<div>🌐 <a href="${safeWebsiteUrl}" style="color:#2563eb; text-decoration:none;">${safeWebsiteUrl}</a></div>`
            : ""
        }
      </div>
    </div>
  </div>
`;
};

export const appointmentCreatedTemplate = (data: {
  appointmentId: string;
  startAt: Date;
  endAt: Date;
  serviceType: string;
  notes?: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  vehicleLabel: string;
  settings: ShopSettings;
}) => {
  const body = `
    <p>Se creó un nuevo turno con los siguientes datos:</p>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tr><td style="padding:6px 0; color:#64748b;">ID</td><td style="padding:6px 0; font-weight:700;">${data.appointmentId}</td></tr>
      <tr><td style="padding:6px 0; color:#64748b;">Fecha</td><td style="padding:6px 0;">${new Date(data.startAt).toLocaleString()}</td></tr>
      <tr><td style="padding:6px 0; color:#64748b;">Fin</td><td style="padding:6px 0;">${new Date(data.endAt).toLocaleString()}</td></tr>
      <tr><td style="padding:6px 0; color:#64748b;">Servicio</td><td style="padding:6px 0;">${data.serviceType}</td></tr>
      <tr><td style="padding:6px 0; color:#64748b;">Cliente</td><td style="padding:6px 0;">${data.clientName}</td></tr>
      <tr><td style="padding:6px 0; color:#64748b;">Vehículo</td><td style="padding:6px 0;">${data.vehicleLabel}</td></tr>
      ${data.clientPhone ? `<tr><td style="padding:6px 0; color:#64748b;">Teléfono</td><td style="padding:6px 0;">${data.clientPhone}</td></tr>` : ""}
      ${data.clientEmail ? `<tr><td style="padding:6px 0; color:#64748b;">Email</td><td style="padding:6px 0;">${data.clientEmail}</td></tr>` : ""}
    </table>
    ${data.notes ? `<p style="margin-top:12px;"><strong>Notas:</strong> ${data.notes}</p>` : ""}
  `;

  return {
    subject: `Nuevo turno creado - ${data.vehicleLabel}`,
    html: baseLayout("Nuevo turno creado", body, data.settings),
    text: `Nuevo turno creado\nID: ${data.appointmentId}\nFecha: ${new Date(data.startAt).toLocaleString()}\nCliente: ${data.clientName}\nVehículo: ${data.vehicleLabel}\nServicio: ${data.serviceType}\n${data.notes ? `Notas: ${data.notes}` : ""}`,
  };
};

export const appointmentClientNotificationTemplate = (data: {
  mode: "CREATED" | "RESCHEDULED";
  startAt: Date | string;
  endAt: Date | string;
  serviceType: string;
  notes?: string;
  clientName: string;
  vehicleLabel: string;
  settings: ShopSettings;
}) => {
  const isRescheduled = data.mode === "RESCHEDULED";
  const title = isRescheduled ? "Turno reprogramado" : "Turno confirmado";
  const safeClientName = escapeHtml(data.clientName || "Cliente");
  const safeVehicleLabel = escapeHtml(data.vehicleLabel || "Vehículo");
  const safeServiceType = escapeHtml(data.serviceType || "General");
  const safeNotes = escapeHtml(String(data.notes || "").trim());

  const formatDateTime = (value: Date | string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const startAtLabel = formatDateTime(data.startAt);
  const endAtLabel = formatDateTime(data.endAt);
  const intro = isRescheduled
    ? "Actualizamos la fecha y hora de tu turno."
    : "Te confirmamos el turno agendado para tu vehículo.";

  const body = `
    <p style="margin:0 0 12px; color:#334155;">Hola ${safeClientName},</p>
    <p style="margin:0 0 14px; color:#334155;">${intro}</p>

    <div style="border:1px solid #dbeafe; border-radius:12px; background:#f8fbff; padding:14px; margin:0 0 14px;">
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr>
          <td style="padding:6px 0; color:#64748b;">Vehículo</td>
          <td style="padding:6px 0; color:#0f172a; font-weight:700;">${safeVehicleLabel}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#64748b;">Servicio</td>
          <td style="padding:6px 0; color:#0f172a; font-weight:700;">${safeServiceType}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#64748b;">Inicio</td>
          <td style="padding:6px 0; color:#0f172a; font-weight:700;">${escapeHtml(startAtLabel)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#64748b;">Fin</td>
          <td style="padding:6px 0; color:#0f172a; font-weight:700;">${escapeHtml(endAtLabel)}</td>
        </tr>
      </table>
    </div>

    ${
      safeNotes
        ? `<div style="margin:0 0 14px; padding:12px; border-radius:10px; border:1px solid #e2e8f0; background:#f8fafc;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#475569; font-weight:700;">Notas</div>
            <div style="margin-top:6px; color:#0f172a; line-height:1.6;">${safeNotes.replace(/\n/g, "<br/>")}</div>
          </div>`
        : ""
    }

    <p style="margin:0; color:#475569; font-size:13px;">
      Si necesitás reprogramar, respondé este email y te ayudamos.
    </p>
  `;

  const text = [
    `Hola ${data.clientName || "Cliente"},`,
    "",
    isRescheduled
      ? "Tu turno fue reprogramado."
      : "Tu turno fue confirmado.",
    `Vehículo: ${data.vehicleLabel || "Vehículo"}`,
    `Servicio: ${data.serviceType || "General"}`,
    `Inicio: ${startAtLabel}`,
    `Fin: ${endAtLabel}`,
    safeNotes ? `Notas: ${String(data.notes || "").trim()}` : "",
    "",
    "Si necesitás reprogramar, respondé este email y te ayudamos.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `${title} - ${data.vehicleLabel || "Vehículo"}`,
    html: baseLayout(title, body, data.settings),
    text,
  };
};

export const estimateEmailTemplate = (data: {
  estimateNumber: string;
  total: number;
  pdfUrl?: string;
  clientName: string;
  vehicleLabel: string;
  validityDays?: number;
  validUntil?: Date;
  settings: ShopSettings;
}) => {
  const resolvedValidityDays = Number.isFinite(Number(data.validityDays))
    ? Math.max(1, Math.floor(Number(data.validityDays)))
    : 15;
  const validUntilDate = data.validUntil
    ? new Date(data.validUntil)
    : null;
  const validUntilText =
    validUntilDate && !Number.isNaN(validUntilDate.getTime())
      ? `Vigente hasta el ${validUntilDate.toLocaleDateString("es-AR")}.`
      : `Vigente por ${resolvedValidityDays} días desde su emisión.`;

  const body = `
    <p>Hola ${data.clientName},</p>
    <p>Te enviamos el presupuesto para tu vehículo <strong>${data.vehicleLabel}</strong>.</p>
    <p style="font-size:18px; font-weight:700; color:#0f172a;">Total estimado: ${formatCurrency(data.total)}</p>
    <p style="color:#0f172a;">${validUntilText}</p>
    ${data.pdfUrl ? `<p><a href="${data.pdfUrl}" style="color:#2563eb; font-weight:700;">Descargar PDF</a></p>` : ""}
    <p>Quedamos atentos a tu confirmación.</p>
  `;

  return {
    subject: `Presupuesto ${data.estimateNumber} - ${data.vehicleLabel}`,
    html: baseLayout("Presupuesto", body, data.settings),
    text: `Hola ${data.clientName}\nPresupuesto ${data.estimateNumber}\nVehículo: ${data.vehicleLabel}\nTotal estimado: ${formatCurrency(data.total)}\n${validUntilText}\n${data.pdfUrl ? `PDF: ${data.pdfUrl}` : ""}`,
  };
};

export const invoiceEmailTemplate = (data: {
  invoiceNumber: string;
  total: number;
  pdfUrl?: string;
  clientName: string;
  vehicleLabel: string;
  prepaidApplied?: number;
  invoiceType?: "WORK_ORDER" | "PREPAID_DEPOSIT";
  settings: ShopSettings;
}) => {
  const prepaidApplied = Number(data.prepaidApplied || 0);
  const invoiceType = data.invoiceType || "WORK_ORDER";
  const isPrepaidDeposit = invoiceType === "PREPAID_DEPOSIT";
  const intro = isPrepaidDeposit
    ? `Adjuntamos la factura de la carga de saldo a favor registrada para tu cuenta.`
    : `Adjuntamos la factura correspondiente al trabajo realizado en tu vehículo <strong>${data.vehicleLabel}</strong>.`;
  const supportiveText = isPrepaidDeposit
    ? `<p style="font-size:14px; color:#0f172a;">Este importe queda disponible como <strong>saldo a favor</strong> para futuros servicios o reparaciones.</p>`
    : "";
  const title = isPrepaidDeposit
    ? "Factura de saldo a favor"
    : "Factura";
  const textLines = [
    `Hola ${data.clientName}`,
    `Factura ${data.invoiceNumber}`,
    isPrepaidDeposit
      ? "Tipo: Carga de saldo a favor"
      : `Vehículo: ${data.vehicleLabel}`,
    `Total: ${formatCurrency(data.total)}`,
    prepaidApplied > 0
      ? `Saldo a favor aplicado: ${formatCurrency(prepaidApplied)}`
      : "",
    data.pdfUrl ? `PDF: ${data.pdfUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = `
    <p>Hola ${data.clientName},</p>
    <p>${intro}</p>
    ${supportiveText}
    ${prepaidApplied > 0 ? `<p style="font-size:14px; color:#0f172a;">Saldo a favor aplicado: <strong>${formatCurrency(prepaidApplied)}</strong></p>` : ""}
    <p style="font-size:18px; font-weight:700; color:#0f172a;">Total: ${formatCurrency(data.total)}</p>
    ${data.pdfUrl ? `<p><a href="${data.pdfUrl}" style="color:#2563eb; font-weight:700;">Descargar PDF</a></p>` : ""}
    <p>Gracias por confiar en nosotros.</p>
  `;

  return {
    subject: isPrepaidDeposit
      ? `Factura ${data.invoiceNumber} - Saldo a favor`
      : `Factura ${data.invoiceNumber} - ${data.vehicleLabel}`,
    html: baseLayout(title, body, data.settings),
    text: textLines,
  };
};

export const prepaidOfferEmailTemplate = (data: {
  subject: string;
  clientName: string;
  customBody?: string;
  balance?: number;
  settings: ShopSettings;
}) => {
  const safeClientName = escapeHtml(data.clientName);
  const customBodyHtml = renderMultilineParagraphs(data.customBody);
  const hasCustomBody = Boolean(customBodyHtml);
  const balance = Number(data.balance || 0);
  const paymentInstructionsHtml = prepaidPaymentInstructionsHtml(data.settings);
  const paymentInstructionsText = prepaidPaymentInstructionsText(data.settings);
  const balanceBlock =
    balance > 0
      ? `<div style="margin:0 0 16px; padding:12px 14px; border-radius:10px; background:#ecfeff; border:1px solid #a5f3fc;">
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#155e75; font-weight:700;">Saldo actual a favor</div>
          <div style="margin-top:4px; font-size:20px; font-weight:800; color:#0f766e;">${formatCurrency(balance)}</div>
        </div>`
      : "";

  const defaultBody = `
    <p style="margin:0 0 10px; color:#334155; line-height:1.6;">
      Queremos ofrecerte un beneficio opcional para que puedas anticiparte a futuros mantenimientos.
    </p>
    <p style="margin:0 0 10px; color:#334155; line-height:1.6;">
      Podés ir cargando saldo cuando te resulte cómodo y usarlo luego en services o reparaciones.
    </p>
  `;

  const body = `
    <div style="margin-bottom:14px;">
      <span style="display:inline-block; padding:6px 10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:999px; color:#1d4ed8; font-size:12px; font-weight:700;">
        Beneficio opcional
      </span>
    </div>
    <p style="margin:0 0 14px; color:#0f172a;">Hola ${safeClientName},</p>
    <div style="border:1px solid #dbeafe; border-radius:12px; background:#f8fbff; padding:14px; margin:0 0 16px;">
      <div style="font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#64748b; margin-bottom:4px;">
        Saldo a favor para futuros servicios
      </div>
      <div style="font-size:20px; font-weight:800; color:#0f172a; margin-bottom:8px;">
        Planificá gastos del auto con más tranquilidad
      </div>
      ${hasCustomBody ? customBodyHtml : defaultBody}
      <ul style="margin:0; padding-left:18px; color:#334155; line-height:1.6;">
        <li>Sin obligación mensual ni débito automático.</li>
        <li>Podés cargar montos parciales cuando quieras.</li>
        <li>El saldo queda registrado y disponible para usar en facturas futuras.</li>
      </ul>
    </div>
    ${balanceBlock}
    <div style="margin:0 0 14px; padding:12px 14px; border-radius:10px; border:1px solid #dbeafe; background:#f8fafc;">
      ${paymentInstructionsHtml}
    </div>
    <p style="margin:0; color:#475569; font-size:13px;">
      Si tenés dudas, respondé este email y te ayudamos.
    </p>
  `;

  const textLines = [
    `Hola ${data.clientName},`,
    "",
    "Beneficio opcional: saldo a favor para futuros servicios.",
    hasCustomBody
      ? String(data.customBody || "").trim()
      : "Podés cargar saldo cuando quieras y usarlo más adelante en services o reparaciones.",
    "",
    balance > 0 ? `Saldo actual a favor: ${formatCurrency(balance)}` : "",
    paymentInstructionsText,
    "",
    "Sin obligación mensual.",
    "Podés responder este email para coordinar.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: data.subject,
    html: baseLayout("Beneficio opcional", body, data.settings),
    text: textLines,
  };
};

export const appointmentRequestConfirmedTemplate = (data: {
  clientName: string;
  confirmedAt: Date;
  vehicleLabel: string;
  description?: string;
  googleCalendarUrl?: string;
  settings: ShopSettings;
}) => {
  const body = `
    <p>Hola ${data.clientName},</p>
    <p>Tu solicitud fue <strong>confirmada</strong>.</p>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tr><td style="padding:6px 0; color:#64748b;">Fecha y hora</td><td style="padding:6px 0; font-weight:700;">${new Date(data.confirmedAt).toLocaleString()}</td></tr>
      <tr><td style="padding:6px 0; color:#64748b;">Vehículo</td><td style="padding:6px 0;">${data.vehicleLabel}</td></tr>
      ${data.settings.address ? `<tr><td style="padding:6px 0; color:#64748b;">Dirección</td><td style="padding:6px 0;">${data.settings.address}</td></tr>` : ""}
    </table>
    ${data.description ? `<p style="margin-top:12px;"><strong>Detalle:</strong> ${data.description}</p>` : ""}
    ${
      data.googleCalendarUrl
        ? `
      <div style="margin-top:20px;">
        <a href="${data.googleCalendarUrl}" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 16px; border-radius:8px; font-weight:700; text-decoration:none;">
          Agregar a Google Calendar
        </a>
      </div>
      <p style="margin-top:10px; color:#475569; font-size:13px;">
        Si el botón no funciona, copiá este enlace:
        <a href="${data.googleCalendarUrl}" style="color:#2563eb;">Abrir Google Calendar</a>
      </p>
    `
        : ""
    }
  `;

  return {
    subject: `Solicitud confirmada - ${data.vehicleLabel}`,
    html: baseLayout("Solicitud confirmada", body, data.settings),
    text: `Hola ${data.clientName}\nTu solicitud fue confirmada.\nFecha y hora: ${new Date(data.confirmedAt).toLocaleString()}\nVehículo: ${data.vehicleLabel}\n${data.settings.address ? `Dirección: ${data.settings.address}\n` : ""}${data.googleCalendarUrl ? `Agregar a Google Calendar: ${data.googleCalendarUrl}` : ""}`,
  };
};

export const appointmentRequestRejectedTemplate = (data: {
  clientName: string;
  vehicleLabel: string;
  rejectionReason: string;
  followUpText?: string;
  requestUrl?: string;
  requestUrlLabel?: string;
  settings: ShopSettings;
}) => {
  const safeClientName = escapeHtml(data.clientName);
  const safeVehicleLabel = escapeHtml(data.vehicleLabel);
  const safeRejectionReason = escapeHtml(data.rejectionReason);
  const safeFollowUpText = escapeHtml(
    data.followUpText ||
      "Si querés, podés responder este mensaje para coordinar una alternativa.",
  );
  const safeRequestUrl = escapeHtml(data.requestUrl || "");
  const safeRequestUrlLabel = escapeHtml(
    data.requestUrlLabel || "Solicitar turno",
  );

  const body = `
    <p>Hola ${safeClientName},</p>
    <p>Tu solicitud fue <strong>rechazada</strong>.</p>
    <p style="margin-top:12px;"><strong>Motivo:</strong> ${safeRejectionReason}</p>
    <p style="margin-top:12px;">${safeFollowUpText}</p>
    ${
      data.requestUrl
        ? `
    <div style="margin-top:14px;">
      <a href="${safeRequestUrl}" style="display:inline-block; background:#2563eb; color:#ffffff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:700;">
        ${safeRequestUrlLabel}
      </a>
    </div>
  `
        : ""
    }
    <p><strong>Vehículo:</strong> ${safeVehicleLabel}</p>
  `;

  return {
    subject: `Solicitud rechazada - ${data.vehicleLabel}`,
    html: baseLayout("Solicitud rechazada", body, data.settings),
    text: `Hola ${data.clientName}\nTu solicitud fue rechazada.\nMotivo: ${data.rejectionReason}\n${data.followUpText || "Si querés, podés responder este mensaje para coordinar una alternativa."}\n${data.requestUrl ? `${data.requestUrlLabel || "Solicitar turno"}: ${data.requestUrl}\n` : ""}Vehículo: ${data.vehicleLabel}`,
  };
};

export const appointmentCancelledTemplate = (data: {
  clientName: string;
  vehicleLabel: string;
  scheduledAt?: Date;
  cancelReason?: string;
  followUpText?: string;
  requestUrl?: string;
  requestUrlLabel?: string;
  settings: ShopSettings;
}) => {
  const safeClientName = escapeHtml(data.clientName);
  const safeVehicleLabel = escapeHtml(data.vehicleLabel);
  const safeCancelReason = escapeHtml(data.cancelReason || "");
  const safeFollowUpText = escapeHtml(
    data.followUpText ||
      "Podés solicitar un nuevo turno cuando te quede cómodo desde el siguiente enlace.",
  );
  const safeRequestUrl = escapeHtml(data.requestUrl || "");
  const safeRequestUrlLabel = escapeHtml(
    data.requestUrlLabel || "Solicitar nuevo turno",
  );
  const scheduledAtDate = data.scheduledAt ? new Date(data.scheduledAt) : null;
  const scheduledAtText =
    scheduledAtDate && !Number.isNaN(scheduledAtDate.getTime())
      ? scheduledAtDate.toLocaleString("es-AR")
      : "";

  const body = `
    <p>Hola ${safeClientName},</p>
    <p>Te informamos que tu turno fue <strong>cancelado</strong>.</p>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      ${
        scheduledAtText
          ? `<tr><td style="padding:6px 0; color:#64748b;">Fecha y hora original</td><td style="padding:6px 0; font-weight:700;">${scheduledAtText}</td></tr>`
          : ""
      }
      <tr><td style="padding:6px 0; color:#64748b;">Vehículo</td><td style="padding:6px 0;">${safeVehicleLabel}</td></tr>
    </table>
    ${
      data.cancelReason
        ? `<p style="margin-top:12px;"><strong>Motivo:</strong> ${safeCancelReason}</p>`
        : ""
    }
    <p style="margin-top:12px;">${safeFollowUpText}</p>
    ${
      data.requestUrl
        ? `
      <div style="margin-top:14px;">
        <a href="${safeRequestUrl}" style="display:inline-block; background:#2563eb; color:#ffffff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:700;">
          ${safeRequestUrlLabel}
        </a>
      </div>
    `
        : ""
    }
  `;

  return {
    subject: `Turno cancelado - ${data.vehicleLabel}`,
    html: baseLayout("Turno cancelado", body, data.settings),
    text: `Hola ${data.clientName}\nTu turno fue cancelado.\n${scheduledAtText ? `Fecha y hora original: ${scheduledAtText}\n` : ""}Vehículo: ${data.vehicleLabel}\n${data.cancelReason ? `Motivo: ${data.cancelReason}\n` : ""}${data.followUpText || "Podés solicitar un nuevo turno cuando te quede cómodo."}\n${data.requestUrl ? `${data.requestUrlLabel || "Solicitar nuevo turno"}: ${data.requestUrl}` : ""}`,
  };
};

export const ownerNewAppointmentRequestTemplate = (data: {
  clientName: string;
  phone: string;
  email?: string;
  vehicleLabel: string;
  requestTypeLabel: string;
  description?: string;
  suggestedDates: Date[];
  manageRequestsUrl?: string;
  notificationType?: "NEW" | "UPDATED";
  settings: ShopSettings;
}) => {
  const notificationType =
    data.notificationType === "UPDATED" ? "UPDATED" : "NEW";
  const isUpdated = notificationType === "UPDATED";
  const safeClientName = escapeHtml(data.clientName);
  const safePhone = escapeHtml(data.phone);
  const safeEmail = escapeHtml(data.email);
  const safeVehicleLabel = escapeHtml(data.vehicleLabel);
  const safeRequestTypeLabel = escapeHtml(data.requestTypeLabel);
  const safeDescription = escapeHtml(data.description);
  const safeManageRequestsUrl = escapeHtml(data.manageRequestsUrl);

  const dateLabels = data.suggestedDates
    .map((date) =>
      new Date(date).toLocaleDateString("es-AR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }),
    )
    .filter(Boolean);

  const datePillsHtml = dateLabels.length
    ? dateLabels
        .map(
          (label) =>
            `<span style="display:inline-block; margin:4px 6px 0 0; padding:6px 10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:999px; color:#1d4ed8; font-size:12px; font-weight:700;">${escapeHtml(label)}</span>`,
        )
        .join("")
    : '<span style="color:#64748b;">Sin fechas sugeridas</span>';

  const body = `
    <div style="margin-bottom:14px;">
      <span style="display:inline-block; padding:6px 10px; background:#ecfeff; border:1px solid #a5f3fc; border-radius:999px; color:#155e75; font-size:12px; font-weight:700;">
        ${isUpdated ? "Solicitud actualizada" : "Nueva solicitud recibida"}
      </span>
    </div>

    <p style="margin:0 0 14px; color:#334155;">
      ${
        isUpdated
          ? "El cliente actualizó una solicitud pendiente desde la landing."
          : "Ingresó una nueva solicitud de turno desde la landing."
      }
      Revisala para confirmar fecha y hora con el cliente.
    </p>

    <div style="border:1px solid #e2e8f0; border-radius:12px; padding:14px; background:#f8fafc; margin:0 0 14px;">
      <div style="font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#64748b; margin-bottom:4px;">Vehículo</div>
      <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:6px;">${safeVehicleLabel}</div>
      <div style="font-size:14px; color:#334155;">Tipo solicitado: <strong>${safeRequestTypeLabel}</strong></div>
    </div>

    <table style="width:100%; border-collapse:collapse; margin:0 0 14px; font-size:14px;">
      <tr>
        <td style="padding:8px 0; color:#64748b; width:120px;">Cliente</td>
        <td style="padding:8px 0; color:#0f172a; font-weight:700;">${safeClientName}</td>
      </tr>
      <tr>
        <td style="padding:8px 0; color:#64748b;">Teléfono</td>
        <td style="padding:8px 0;">
          <a href="tel:${safePhone}" style="color:#0f172a; font-weight:700; text-decoration:none;">${safePhone}</a>
        </td>
      </tr>
      ${
        data.email
          ? `
      <tr>
        <td style="padding:8px 0; color:#64748b;">Email</td>
        <td style="padding:8px 0;">
          <a href="mailto:${safeEmail}" style="color:#2563eb; font-weight:700; text-decoration:none;">${safeEmail}</a>
        </td>
      </tr>
      `
          : ""
      }
    </table>

    ${
      data.description
        ? `
      <div style="border-left:4px solid #2563eb; background:#f8fafc; padding:10px 12px; margin:0 0 14px;">
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#64748b; margin-bottom:4px;">Detalle informado</div>
        <div style="font-size:14px; color:#1e293b;">${safeDescription}</div>
      </div>
    `
        : ""
    }

    <div style="margin:0 0 16px;">
      <div style="font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#64748b; margin-bottom:6px;">Fechas sugeridas</div>
      ${datePillsHtml}
    </div>

    ${
      data.manageRequestsUrl
        ? `
      <div style="margin-top:18px;">
        <a href="${safeManageRequestsUrl}" style="display:inline-block; background:#2563eb; color:#ffffff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:700;">
          Ver solicitudes pendientes
        </a>
      </div>
    `
        : ""
    }
  `;

  const suggestedDateLabels = dateLabels.join(", ") || "-";
  const text = [
    "Nueva solicitud de turno",
    `Cliente: ${data.clientName}`,
    `Telefono: ${data.phone}`,
    data.email ? `Email: ${data.email}` : "",
    `Vehiculo: ${data.vehicleLabel}`,
    `Tipo: ${data.requestTypeLabel}`,
    data.description ? `Detalle: ${data.description}` : "",
    `Fechas sugeridas: ${suggestedDateLabels}`,
    data.manageRequestsUrl
      ? `Gestionar solicitudes: ${data.manageRequestsUrl}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `${isUpdated ? "Solicitud actualizada" : "Nueva solicitud de turno"} - ${data.vehicleLabel}`,
    html: baseLayout(
      isUpdated ? "Solicitud actualizada" : "Nueva solicitud de turno",
      body,
      data.settings,
    ),
    text,
  };
};

export const clientPrepaidSummaryEmailTemplate = (data: {
  clientName: string;
  balance: number;
  settings: ShopSettings;
  movements: Array<{
    createdAt: Date | string;
    type: string;
    direction: string;
    amount: number;
    balanceAfter: number;
    note?: string;
  }>;
}) => {
  const safeClientName = escapeHtml(data.clientName);
  const movementTypeLabels: Record<string, string> = {
    DEPOSIT: "Ingreso de saldo",
    USAGE_INVOICE: "Consumo por factura",
    ADJUSTMENT_PLUS: "Ajuste manual a favor",
    ADJUSTMENT_MINUS: "Ajuste manual en contra",
    REFUND: "Reintegro",
  };

  const formatMovementDate = (value: Date | string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const resolveIsCredit = (movement: {
    direction?: string;
    type?: string;
  }) => {
    const normalizedDirection = String(movement.direction || "").toUpperCase();
    if (normalizedDirection === "CREDIT") return true;
    if (normalizedDirection === "DEBIT") return false;
    const normalizedType = String(movement.type || "").toUpperCase();
    return normalizedType === "DEPOSIT" || normalizedType === "ADJUSTMENT_PLUS";
  };

  const movementTotals = data.movements.reduce(
    (acc, movement) => {
      const amount = Number(movement.amount || 0);
      if (resolveIsCredit(movement)) {
        acc.credit += amount;
      } else {
        acc.debit += amount;
      }
      return acc;
    },
    { credit: 0, debit: 0 },
  );

  const movementsRowsHtml = data.movements
    .map((movement, index) => {
      const normalizedType = String(movement.type || "").toUpperCase();
      const movementLabel = movementTypeLabels[normalizedType] || normalizedType || "Movimiento";
      const isCredit = resolveIsCredit(movement);
      const amountLabel = `${isCredit ? "+" : "-"} ${formatCurrency(
        Number(movement.amount || 0),
      )}`;
      const amountColor = isCredit ? "#166534" : "#b91c1c";
      const noteHtml = movement.note
        ? `<div style="margin-top:4px; color:#64748b; font-size:12px;">${escapeHtml(movement.note)}</div>`
        : "";

      return `
        <tr>
          <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; color:#334155; font-size:13px; background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
            ${escapeHtml(formatMovementDate(movement.createdAt))}
          </td>
          <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13px; background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
            <strong>${escapeHtml(movementLabel)}</strong>
            ${noteHtml}
          </td>
          <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; text-align:right; font-size:13px; font-weight:700; color:${amountColor}; background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
            ${escapeHtml(amountLabel)}
          </td>
          <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; text-align:right; color:#0f172a; font-size:13px; font-weight:700; background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
            ${escapeHtml(formatCurrency(Number(movement.balanceAfter || 0)))}
          </td>
        </tr>
      `;
    })
    .join("");

  const movementsBlock = movementsRowsHtml
    ? `
      <table role="presentation" width="100%" style="border-collapse:collapse; margin-top:8px;">
        <thead>
          <tr>
            <th align="left" style="padding:8px; background:#f1f5f9; color:#334155; font-size:12px; text-transform:uppercase; letter-spacing:.4px;">Fecha</th>
            <th align="left" style="padding:8px; background:#f1f5f9; color:#334155; font-size:12px; text-transform:uppercase; letter-spacing:.4px;">Concepto</th>
            <th align="right" style="padding:8px; background:#f1f5f9; color:#334155; font-size:12px; text-transform:uppercase; letter-spacing:.4px;">Monto</th>
            <th align="right" style="padding:8px; background:#f1f5f9; color:#334155; font-size:12px; text-transform:uppercase; letter-spacing:.4px;">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${movementsRowsHtml}
        </tbody>
      </table>
    `
    : `
      <div style="margin-top:8px; padding:12px; border-radius:10px; border:1px dashed #cbd5e1; color:#64748b; background:#f8fafc;">
        Todavía no registrás movimientos en tu saldo a favor.
      </div>
    `;

  const body = `
    <p style="margin:0 0 12px; color:#334155;">Hola ${safeClientName},</p>
    <p style="margin:0 0 14px; color:#334155;">
      Te compartimos el estado actualizado de tu saldo a favor.
    </p>

    <div style="margin:0 0 16px; padding:14px 16px; border-radius:12px; border:1px solid #86efac; background:#f0fdf4;">
      <div style="font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#166534; font-weight:700;">
        Saldo actual disponible
      </div>
      <div style="margin-top:4px; font-size:26px; font-weight:800; color:#14532d;">
        ${escapeHtml(formatCurrency(Number(data.balance || 0)))}
      </div>
      <div style="margin-top:4px; color:#166534; font-size:13px;">
        Este monto podés aplicarlo en próximos servicios o reparaciones.
      </div>
    </div>

    <table role="presentation" width="100%" style="border-collapse:separate; border-spacing:0 8px; margin:0 0 10px;">
      <tr>
        <td style="width:50%; padding-right:6px;">
          <div style="border:1px solid #d1fae5; background:#ecfdf5; border-radius:10px; padding:10px 12px;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:.3px; color:#166534; font-weight:700;">Ingresos recientes</div>
            <div style="margin-top:4px; color:#14532d; font-size:18px; font-weight:800;">${escapeHtml(
              formatCurrency(Number(movementTotals.credit || 0)),
            )}</div>
          </div>
        </td>
        <td style="width:50%; padding-left:6px;">
          <div style="border:1px solid #fee2e2; background:#fef2f2; border-radius:10px; padding:10px 12px;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:.3px; color:#b91c1c; font-weight:700;">Consumos recientes</div>
            <div style="margin-top:4px; color:#7f1d1d; font-size:18px; font-weight:800;">${escapeHtml(
              formatCurrency(Number(movementTotals.debit || 0)),
            )}</div>
          </div>
        </td>
      </tr>
    </table>

    <div style="margin:0 0 8px; font-size:14px; font-weight:700; color:#0f172a;">
      Últimos movimientos
    </div>
    ${movementsBlock}

    <p style="margin:14px 0 0; color:#475569; font-size:13px;">
      Si querés consultar un movimiento puntual, respondé este email y te ayudamos.
    </p>
  `;

  const textMovements = data.movements.length
    ? data.movements
        .map((movement) => {
          const normalizedType = String(movement.type || "").toUpperCase();
          const movementLabel = movementTypeLabels[normalizedType] || normalizedType || "Movimiento";
          const isCredit = resolveIsCredit(movement);
          const amountLabel = `${isCredit ? "+" : "-"} ${formatCurrency(
            Number(movement.amount || 0),
          )}`;
          const noteText = movement.note ? ` (${movement.note})` : "";
          return `${formatMovementDate(movement.createdAt)} - ${movementLabel}${noteText} - ${amountLabel} - Saldo: ${formatCurrency(Number(movement.balanceAfter || 0))}`;
        })
        .join("\n")
    : "Sin movimientos aún.";

  const text = [
    `Hola ${data.clientName},`,
    "",
    `Saldo actual: ${formatCurrency(Number(data.balance || 0))}`,
    `Ingresos recientes: ${formatCurrency(Number(movementTotals.credit || 0))}`,
    `Consumos recientes: ${formatCurrency(Number(movementTotals.debit || 0))}`,
    "",
    "Últimos movimientos:",
    textMovements,
    "",
    "Este saldo queda a tu favor para futuros servicios o reparaciones.",
  ].join("\n");

  return {
    subject: `Resumen de saldo a favor - ${data.settings.shopName || "Taller"}`,
    html: baseLayout("Resumen de saldo a favor", body, data.settings),
    text,
  };
};
