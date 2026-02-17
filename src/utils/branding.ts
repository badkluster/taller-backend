import fs from 'fs';
import path from 'path';

let cachedLogoDataUrl: string | null = null;
let cachedLogoBuffer: Buffer | null = null;
const remoteLogoBufferCache = new Map<string, Buffer>();

const resolveLogoPath = () =>
  path.resolve(__dirname, '../../assets/logo-taller-sf.png');

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const stripWrappingQuotes = (value: string) =>
  value.replace(/^['"]+|['"]+$/g, '').trim();

const firstHttpUrlFromText = (value: string): string | undefined => {
  const absoluteMatch = value.match(/https?:\/\/[^\s"'<>]+/i);
  if (absoluteMatch?.[0]) return absoluteMatch[0];

  const protocolRelativeMatch = value.match(/\/\/[^\s"'<>]+/);
  if (protocolRelativeMatch?.[0]) return `https:${protocolRelativeMatch[0]}`;

  return undefined;
};

const normalizeLogoUrl = (logoUrl?: string | null): string => {
  const rawValue = decodeHtmlEntities(String(logoUrl || '')).trim();
  if (!rawValue) return '';

  const candidate = stripWrappingQuotes(rawValue);

  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  if (/^\/\//.test(candidate)) {
    return `https:${candidate}`;
  }
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(candidate)) {
    return candidate.replace(/\s+/g, '');
  }

  // If an HTML img snippet or mixed text was stored by mistake, recover first usable URL.
  const srcAttrMatch = candidate.match(
    /src\s*=\s*(['"]?)(https?:\/\/[^'"\s>]+|data:image\/[a-zA-Z0-9.+-]+;base64,[^'"\s>]+)\1/i,
  );
  if (srcAttrMatch?.[2]) {
    return normalizeLogoUrl(srcAttrMatch[2]);
  }

  const malformedImgPrefixMatch = candidate.match(/^<img\s*(https?:\/\/[^\s"'<>]+)/i);
  if (malformedImgPrefixMatch?.[1]) {
    return normalizeLogoUrl(malformedImgPrefixMatch[1]);
  }

  const recoveredUrl = firstHttpUrlFromText(candidate);
  if (recoveredUrl) {
    return normalizeLogoUrl(recoveredUrl);
  }

  return '';
};

export const sanitizeLogoUrlInput = (logoUrl?: string | null): string | undefined => {
  const normalized = normalizeLogoUrl(logoUrl);
  return normalized || undefined;
};

const dataUrlToBuffer = (value: string): Buffer | undefined => {
  const match = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/i);
  if (!match) return undefined;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return undefined;
  }
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const fetchLogoBuffer = async (url: string): Promise<Buffer | undefined> => {
  const fetchFn = (globalThis as any).fetch as
    | ((input: string, init?: any) => Promise<any>)
    | undefined;
  if (!fetchFn) return undefined;

  const controller =
    typeof AbortController !== 'undefined'
      ? new AbortController()
      : undefined;
  const timeout = setTimeout(() => controller?.abort(), 6000);

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      signal: controller?.signal,
      redirect: 'follow',
    });
    if (!response?.ok) return undefined;

    const data = await response.arrayBuffer();
    const buffer = Buffer.from(data);
    return buffer.length > 0 ? buffer : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

export const getDefaultLogoDataUrl = (): string | undefined => {
  const envDefault = sanitizeLogoUrlInput(process.env.DEFAULT_LOGO_URL);
  if (envDefault) return envDefault;
  if (cachedLogoDataUrl) return cachedLogoDataUrl;

  try {
    const file = fs.readFileSync(resolveLogoPath());
    cachedLogoDataUrl = `data:image/png;base64,${file.toString('base64')}`;
    return cachedLogoDataUrl;
  } catch {
    return undefined;
  }
};

export const getDefaultLogoBuffer = (): Buffer | undefined => {
  if (cachedLogoBuffer) return cachedLogoBuffer;

  try {
    cachedLogoBuffer = fs.readFileSync(resolveLogoPath());
    return cachedLogoBuffer;
  } catch {
    return undefined;
  }
};

export const resolveLogoUrl = (logoUrl?: string | null): string | undefined =>
  sanitizeLogoUrlInput(logoUrl) || getDefaultLogoDataUrl();

export const resolveLogoBuffer = async (
  logoUrl?: string | null,
): Promise<Buffer | undefined> => {
  const normalized = normalizeLogoUrl(logoUrl);
  if (!normalized) return getDefaultLogoBuffer();

  const embeddedBuffer = dataUrlToBuffer(normalized);
  if (embeddedBuffer) return embeddedBuffer;

  if (isHttpUrl(normalized)) {
    const cached = remoteLogoBufferCache.get(normalized);
    if (cached) return cached;

    const fetched = await fetchLogoBuffer(normalized);
    if (fetched) {
      remoteLogoBufferCache.set(normalized, fetched);
      return fetched;
    }
  }

  return getDefaultLogoBuffer();
};
