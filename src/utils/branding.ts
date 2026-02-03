import fs from 'fs';
import path from 'path';

let cachedLogoDataUrl: string | null = null;
let cachedLogoBuffer: Buffer | null = null;

const resolveLogoPath = () =>
  path.resolve(__dirname, '../../assets/logo-taller-sf.png');

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
  logoUrl || getDefaultLogoDataUrl();
