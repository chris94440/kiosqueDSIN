import { describe, expect, it } from 'vitest';
import { canonicalShareUrl, defaultShareUrl } from './share-qr';

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
});
