import { resolveLogoUrl } from './branding';

type ShopSettings = {
  shopName?: string;
  address?: string;
  phone?: string;
  emailFrom?: string;
  logoUrl?: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

const baseLayout = (title: string, body: string, settings: ShopSettings) => {
  const logoUrl = resolveLogoUrl(settings.logoUrl);
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${settings.shopName || 'Taller Mecánico'}" style="height:40px; max-width:140px; object-fit:contain;" />`
    : '';

  return `
  <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
      <div style="padding:20px 24px; background:#0f172a; color:#fff;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${logoHtml}
          <div>
            <div style="font-size:18px; font-weight:700;">${settings.shopName || 'Taller Mecánico'}</div>
            <div style="font-size:12px; opacity:.8;">${settings.address || ''}</div>
          </div>
        </div>
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px; font-size:20px; color:#0f172a;">${title}</h2>
        ${body}
      </div>
      <div style="padding:16px 24px; background:#f1f5f9; font-size:12px; color:#475569;">
        <div>📞 ${settings.phone || 'Sin teléfono'}</div>
        <div>✉️ ${settings.emailFrom || ''}</div>
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
      ${data.clientPhone ? `<tr><td style="padding:6px 0; color:#64748b;">Teléfono</td><td style="padding:6px 0;">${data.clientPhone}</td></tr>` : ''}
      ${data.clientEmail ? `<tr><td style="padding:6px 0; color:#64748b;">Email</td><td style="padding:6px 0;">${data.clientEmail}</td></tr>` : ''}
    </table>
    ${data.notes ? `<p style="margin-top:12px;"><strong>Notas:</strong> ${data.notes}</p>` : ''}
  `;

  return {
    subject: `Nuevo turno creado - ${data.vehicleLabel}`,
    html: baseLayout('Nuevo turno creado', body, data.settings),
    text: `Nuevo turno creado\nID: ${data.appointmentId}\nFecha: ${new Date(data.startAt).toLocaleString()}\nCliente: ${data.clientName}\nVehículo: ${data.vehicleLabel}\nServicio: ${data.serviceType}\n${data.notes ? `Notas: ${data.notes}` : ''}`,
  };
};

export const estimateEmailTemplate = (data: {
  estimateNumber: string;
  total: number;
  pdfUrl?: string;
  clientName: string;
  vehicleLabel: string;
  settings: ShopSettings;
}) => {
  const body = `
    <p>Hola ${data.clientName},</p>
    <p>Te enviamos el presupuesto para tu vehículo <strong>${data.vehicleLabel}</strong>.</p>
    <p style="font-size:18px; font-weight:700; color:#0f172a;">Total estimado: ${formatCurrency(data.total)}</p>
    ${data.pdfUrl ? `<p><a href="${data.pdfUrl}" style="color:#2563eb; font-weight:700;">Descargar PDF</a></p>` : ''}
    <p>Quedamos atentos a tu confirmación.</p>
  `;

  return {
    subject: `Presupuesto ${data.estimateNumber} - ${data.vehicleLabel}`,
    html: baseLayout('Presupuesto', body, data.settings),
    text: `Hola ${data.clientName}\nPresupuesto ${data.estimateNumber}\nVehículo: ${data.vehicleLabel}\nTotal estimado: ${formatCurrency(data.total)}\n${data.pdfUrl ? `PDF: ${data.pdfUrl}` : ''}`,
  };
};

export const invoiceEmailTemplate = (data: {
  invoiceNumber: string;
  total: number;
  pdfUrl?: string;
  clientName: string;
  vehicleLabel: string;
  settings: ShopSettings;
}) => {
  const body = `
    <p>Hola ${data.clientName},</p>
    <p>Adjuntamos la factura correspondiente al trabajo realizado en tu vehículo <strong>${data.vehicleLabel}</strong>.</p>
    <p style="font-size:18px; font-weight:700; color:#0f172a;">Total: ${formatCurrency(data.total)}</p>
    ${data.pdfUrl ? `<p><a href="${data.pdfUrl}" style="color:#2563eb; font-weight:700;">Descargar PDF</a></p>` : ''}
    <p>Gracias por confiar en nosotros.</p>
  `;

  return {
    subject: `Factura ${data.invoiceNumber} - ${data.vehicleLabel}`,
    html: baseLayout('Factura', body, data.settings),
    text: `Hola ${data.clientName}\nFactura ${data.invoiceNumber}\nVehículo: ${data.vehicleLabel}\nTotal: ${formatCurrency(data.total)}\n${data.pdfUrl ? `PDF: ${data.pdfUrl}` : ''}`,
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
      ${data.settings.address ? `<tr><td style="padding:6px 0; color:#64748b;">Dirección</td><td style="padding:6px 0;">${data.settings.address}</td></tr>` : ''}
    </table>
    ${data.description ? `<p style="margin-top:12px;"><strong>Detalle:</strong> ${data.description}</p>` : ''}
    ${data.googleCalendarUrl ? `
      <div style="margin-top:20px;">
        <a href="${data.googleCalendarUrl}" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 16px; border-radius:8px; font-weight:700; text-decoration:none;">
          Agregar a Google Calendar
        </a>
      </div>
      <p style="margin-top:10px; color:#475569; font-size:13px;">
        Si el botón no funciona, copiá este enlace:
        <a href="${data.googleCalendarUrl}" style="color:#2563eb;">Abrir Google Calendar</a>
      </p>
    ` : ''}
  `;

  return {
    subject: `Solicitud confirmada - ${data.vehicleLabel}`,
    html: baseLayout('Solicitud confirmada', body, data.settings),
    text: `Hola ${data.clientName}\nTu solicitud fue confirmada.\nFecha y hora: ${new Date(data.confirmedAt).toLocaleString()}\nVehículo: ${data.vehicleLabel}\n${data.settings.address ? `Dirección: ${data.settings.address}\n` : ''}${data.googleCalendarUrl ? `Agregar a Google Calendar: ${data.googleCalendarUrl}` : ''}`,
  };
};

export const appointmentRequestRejectedTemplate = (data: {
  clientName: string;
  vehicleLabel: string;
  rejectionReason: string;
  settings: ShopSettings;
}) => {
  const body = `
    <p>Hola ${data.clientName},</p>
    <p>Tu solicitud fue <strong>rechazada</strong>.</p>
    <p style="margin-top:12px;"><strong>Motivo:</strong> ${data.rejectionReason}</p>
    <p style="margin-top:12px;">Si querés, podés responder este mensaje para coordinarmos una alternativa.</p>
    <p><strong>Vehículo:</strong> ${data.vehicleLabel}</p>
  `;

  return {
    subject: `Solicitud rechazada - ${data.vehicleLabel}`,
    html: baseLayout('Solicitud rechazada', body, data.settings),
    text: `Hola ${data.clientName}\nTu solicitud fue rechazada.\nMotivo: ${data.rejectionReason}\nVehículo: ${data.vehicleLabel}`,
  };
};
