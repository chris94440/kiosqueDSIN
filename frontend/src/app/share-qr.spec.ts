import { describe, expect, it } from 'vitest';
import { buildQrDataUrl, canonicalShareUrl, defaultShareUrl, resolveQrApi } from './share-qr';

describe('share-qr helpers', () => {
  it('strips query and hash for the default application URL', () => {
    expect(defaultShareUrl('https://kiosque.example:8080/path/?foo=bar#appels'))
      .toBe('https://kiosque.example:8080/path/');
  });

  it('accepts only full http(s) URLs for QR generation', () => {
    expect(canonicalShareUrl('https://example.com/app')).toBe('https://example.com/app');
    expect(canonicalShareUrl('http://127.0.0.1:8080/')).toBe('http://127.0.0.1:8080/');
    expect(canonicalShareUrl('ftp://example.com')).toBeNull();
    expect(canonicalShareUrl('127.0.0.1:8080')).toBeNull();
    expect(canonicalShareUrl('   ')).toBeNull();
  });

  it('resolves qrcode API from named or default CommonJS export', () => {
    const named = resolveQrApi({ toDataURL: async () => 'ok' });
    expect(typeof named?.toDataURL).toBe('function');
    const fromDefault = resolveQrApi({ default: { toString: async () => '<svg/>' } });
    expect(typeof fromDefault?.toString).toBe('function');
    expect(resolveQrApi({})).toBeNull();
  });

  it('prefers SVG generation and falls back to PNG data URL', async () => {
    const svgData = await buildQrDataUrl({ toString: async () => '<svg>ok</svg>' }, 'https://example.com');
    expect(svgData.startsWith('data:image/svg+xml')).toBe(true);
    const pngData = await buildQrDataUrl({ toDataURL: async () => 'data:image/png;base64,abc' }, 'https://example.com');
    expect(pngData).toBe('data:image/png;base64,abc');
  });
});
