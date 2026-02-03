import PDFDocument from 'pdfkit';
import { getDefaultLogoBuffer } from './branding';

type PdfItem = { description: string; qty: number; unitPrice: number; total?: number };

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

const drawRule = (doc: any, y: number) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(left, y).lineTo(right, y).stroke();
};

const buildDoc = (title: string, meta: { number: string; date: Date; clientName: string; vehicleLabel: string; shopName?: string; address?: string; phone?: string }) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // Header background
  doc.rect(left, 28, width, 70).fill('#0f172a');

  // Shop identity
  const logo = getDefaultLogoBuffer();
  const logoWidth = 52;
  const logoHeight = 52;
  const logoX = left + 14;
  const logoY = 34;
  const textLeft = logo ? logoX + logoWidth + 12 : left + 14;

  if (logo) {
    doc.image(logo, logoX, logoY, { fit: [logoWidth, logoHeight] });
  }

  doc.fillColor('#ffffff').fontSize(18).text(meta.shopName || 'Taller Mecánico', textLeft, 42, { continued: false });
  doc.fontSize(9).fillColor('#cbd5f5').text(meta.address || 'Dirección no definida', textLeft, 62);
  doc.text(meta.phone || 'Teléfono no definido', textLeft, 74);

  // Document info block
  doc.fillColor('#0f172a');
  doc.roundedRect(right - 170, 36, 160, 54, 8).fill('#ffffff');
  doc.fillColor('#0f172a').fontSize(12).text(title.toUpperCase(), right - 162, 42, { width: 150, align: 'right' });
  doc.fontSize(10).fillColor('#475569').text(`Nº ${meta.number}`, right - 162, 58, { width: 150, align: 'right' });
  doc.text(`Fecha: ${meta.date.toLocaleDateString()}`, right - 162, 72, { width: 150, align: 'right' });

  doc.moveDown(3.2);

  // Client / vehicle block
  const infoY = doc.y;
  doc.roundedRect(left, infoY, width, 52, 10).fill('#f8fafc');
  doc.fillColor('#0f172a').fontSize(10).text('Cliente', left + 14, infoY + 10);
  doc.fontSize(11).text(meta.clientName, left + 14, infoY + 26);
  doc.fontSize(10).fillColor('#0f172a').text('Vehículo', left + width / 2, infoY + 10);
  doc.fontSize(11).text(meta.vehicleLabel, left + width / 2, infoY + 26, { width: width / 2 - 16 });
  doc.moveDown(2.6);

  return doc;
};

const addItemsTable = (doc: any, items: PdfItem[]) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const startY = doc.y;
  const colDescWidth = Math.round(width * 0.52);
  const colQtyWidth = Math.round(width * 0.1);
  const colUnitWidth = Math.round(width * 0.18);
  const colTotalWidth = width - colDescWidth - colQtyWidth - colUnitWidth;
  const descX = left + 10;
  const qtyX = left + colDescWidth;
  const unitX = left + colDescWidth + colQtyWidth;
  const totalX = left + colDescWidth + colQtyWidth + colUnitWidth;

  // Table header
  doc.rect(left, startY, width, 22).fill('#e2e8f0');
  doc.fontSize(9).fillColor('#334155');
  doc.text('Descripción', descX, startY + 6, { width: colDescWidth - 10 });
  doc.text('Cant.', qtyX, startY + 6, { width: colQtyWidth, align: 'right' });
  doc.text('Precio Unit.', unitX, startY + 6, { width: colUnitWidth, align: 'right' });
  doc.text('Total', totalX, startY + 6, { width: colTotalWidth, align: 'right' });

  let rowY = startY + 24;
  doc.fontSize(10).fillColor('#0f172a');

  items.forEach((item, idx) => {
    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.rect(left, rowY - 2, width, 22).fill('#f8fafc');
      doc.fillColor('#0f172a');
    }

    const total = item.total ?? item.qty * item.unitPrice;
    doc.text(item.description || '-', descX, rowY, { width: colDescWidth - 10 });
    doc.text(String(item.qty || 0), qtyX, rowY, { width: colQtyWidth, align: 'right' });
    doc.text(formatCurrency(item.unitPrice || 0), unitX, rowY, { width: colUnitWidth, align: 'right' });
    doc.text(formatCurrency(total || 0), totalX, rowY, { width: colTotalWidth, align: 'right' });
    rowY += 22;

    if (rowY > doc.page.height - 140) {
      doc.addPage();
      rowY = doc.page.margins.top;
    }
  });

  doc.y = rowY + 6;
};

export const generateEstimatePdf = (data: {
  number: string;
  date: Date;
  clientName: string;
  vehicleLabel: string;
  items: PdfItem[];
  laborCost: number;
  discount: number;
  total: number;
  shopName?: string;
  address?: string;
  phone?: string;
}) => {
  const doc = buildDoc('Presupuesto', {
    number: data.number,
    date: data.date,
    clientName: data.clientName,
    vehicleLabel: data.vehicleLabel,
    shopName: data.shopName,
    address: data.address,
    phone: data.phone,
  });

  addItemsTable(doc, data.items);

  drawRule(doc, doc.y + 6);
  doc.moveDown(1.2);

  const totalsY = doc.y;
  const boxWidth = 240;
  const boxX = doc.page.width - doc.page.margins.right - boxWidth;
  doc.roundedRect(boxX, totalsY, boxWidth, 84, 10).fill('#0f172a');
  doc.fillColor('#e2e8f0').fontSize(9).text('RESUMEN', boxX + 14, totalsY + 10);
  doc.fillColor('#ffffff').fontSize(11).text(`Mano de obra: ${formatCurrency(data.laborCost)}`, boxX + 14, totalsY + 26);
  if (data.discount > 0) {
    doc.text(`Descuento: -${formatCurrency(data.discount)}`, boxX + 14, totalsY + 42);
  }
  doc.fontSize(14).text(`TOTAL: ${formatCurrency(data.total)}`, boxX + 14, totalsY + 60);

  doc.moveDown(4.2);
  doc.fillColor('#475569').fontSize(9).text('Presupuesto válido por 15 días. Gracias por confiar en nuestro taller.', { align: 'center' });
  return doc;
};

export const generateInvoicePdf = (data: {
  number: string;
  date: Date;
  clientName: string;
  vehicleLabel: string;
  items: PdfItem[];
  laborCost: number;
  discount: number;
  total: number;
  shopName?: string;
  address?: string;
  phone?: string;
}) => {
  const doc = buildDoc('Factura', {
    number: data.number,
    date: data.date,
    clientName: data.clientName,
    vehicleLabel: data.vehicleLabel,
    shopName: data.shopName,
    address: data.address,
    phone: data.phone,
  });

  addItemsTable(doc, data.items);

  drawRule(doc, doc.y + 6);
  doc.moveDown(1.2);

  const totalsY = doc.y;
  const boxWidth = 240;
  const boxX = doc.page.width - doc.page.margins.right - boxWidth;
  doc.roundedRect(boxX, totalsY, boxWidth, 84, 10).fill('#0f172a');
  doc.fillColor('#e2e8f0').fontSize(9).text('RESUMEN', boxX + 14, totalsY + 10);
  doc.fillColor('#ffffff').fontSize(11).text(`Mano de obra: ${formatCurrency(data.laborCost)}`, boxX + 14, totalsY + 26);
  if (data.discount > 0) {
    doc.text(`Descuento: -${formatCurrency(data.discount)}`, boxX + 14, totalsY + 42);
  }
  doc.fontSize(14).text(`TOTAL: ${formatCurrency(data.total)}`, boxX + 14, totalsY + 60);

  doc.moveDown(4.2);
  doc.fillColor('#475569').fontSize(9).text('Factura emitida por servicios de mantenimiento/reparación.', { align: 'center' });
  return doc;
};
