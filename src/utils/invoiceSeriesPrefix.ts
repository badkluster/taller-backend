export const DEFAULT_INVOICE_SERIES_PREFIX = "A-";

export const normalizeInvoiceSeriesPrefix = (value: unknown) => {
  const compact = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);

  if (!compact) {
    return DEFAULT_INVOICE_SERIES_PREFIX;
  }

  return `${compact}-`;
};

export const buildInvoiceSequenceKey = (prefix: unknown) =>
  `invoice_number:${normalizeInvoiceSeriesPrefix(prefix)}`;
