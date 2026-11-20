export const SHARE_URL_MAX = 500;
export type QrToDataURL = (text: string, options?: Record<string, unknown>) => Promise<string>;

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

export function resolveQrToDataURL(moduleValue: unknown): QrToDataURL | null {
  if (!moduleValue || typeof moduleValue !== 'object') return null;
  const named = (moduleValue as { toDataURL?: unknown }).toDataURL;
  if (typeof named === 'function') return named as QrToDataURL;
  const fromDefault = (moduleValue as { default?: { toDataURL?: unknown } }).default?.toDataURL;
  if (typeof fromDefault === 'function') return fromDefault as QrToDataURL;
  return null;
}
