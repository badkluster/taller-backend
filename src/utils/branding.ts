import fs from 'fs';
import path from 'path';

let cachedLogoDataUrl: string | null = null;
let cachedLogoBuffer: Buffer | null = null;
const remoteLogoBufferCache = new Map<string, Buffer>();

const resolveLogoPath = () =>
  path.resolve(__dirname, '../../assets/logo-taller-sf.png');

const normalizeLogoUrl = (logoUrl?: string | null) =>
  String(logoUrl || '').trim();

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
  if (process.env.DEFAULT_LOGO_URL) return process.env.DEFAULT_LOGO_URL;
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
  normalizeLogoUrl(logoUrl) || getDefaultLogoDataUrl();

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
