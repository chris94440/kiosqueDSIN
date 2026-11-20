export const SHARE_URL_MAX = 500;
export type QrToDataURL = (text: string, options?: Record<string, unknown>) => Promise<string>;
export type QrToString = (text: string, options?: Record<string, unknown>) => Promise<string>;
export interface QrApi { toDataURL?: QrToDataURL; toString?: QrToString; }

export function defaultShareUrl(currentHref: string): string {
  try {
    const current = new URL(currentHref);
    return `${current.origin}${current.pathname}`;
  } catch {
    return currentHref.trim();
  }
}

export function canonicalShareUrl(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveQrApi(moduleValue: unknown): QrApi | null {
  if (!moduleValue || typeof moduleValue !== 'object') return null;
  const hasOwn = Object.prototype.hasOwnProperty;
  const source = (moduleValue as { default?: unknown }).default
    && typeof (moduleValue as { default?: unknown }).default === 'object'
    ? (moduleValue as { default: Record<string, unknown> }).default
    : (moduleValue as Record<string, unknown>);
  const candidateToDataURL = hasOwn.call(source, 'toDataURL') ? source['toDataURL'] : undefined;
  const candidateToString = hasOwn.call(source, 'toString') ? source['toString'] : undefined;
  const api: QrApi = {
    toDataURL: typeof candidateToDataURL === 'function' ? candidateToDataURL as unknown as QrToDataURL : undefined,
    toString: typeof candidateToString === 'function' ? candidateToString as unknown as QrToString : undefined,
  };
  return api.toDataURL || api.toString ? api : null;
}

export async function buildQrDataUrl(api: QrApi, url: string): Promise<string> {
  if (Object.prototype.hasOwnProperty.call(api, 'toString') && typeof api.toString === 'function') {
    const svg = await api.toString(url, { type: 'svg', width: 220, margin: 1, errorCorrectionLevel: 'M' });
    const svgText = typeof svg === 'string' ? svg : String(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  }
  if (Object.prototype.hasOwnProperty.call(api, 'toDataURL') && typeof api.toDataURL === 'function') {
    return api.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: 'M' });
  }
  throw new Error('Bibliothèque QR indisponible');
}
