export const SHARE_URL_MAX = 500;

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
