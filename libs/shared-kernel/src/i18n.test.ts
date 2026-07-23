import { describe, expect, it } from 'vitest';
import { localizedTextSchema, resolveLocalizedText, type LocalizedText } from './i18n.js';

describe('i18n shared contract', () => {
  it('resolves requested locale, then default locale, then first available text', () => {
    const value: LocalizedText = { vi: 'Sản phẩm', en: 'Item' };

    expect(resolveLocalizedText(value, 'en')).toBe('Item');
    expect(resolveLocalizedText(value, 'ja')).toBe('Sản phẩm');
    expect(resolveLocalizedText({ vi: '', ko: '품목' } as LocalizedText, 'ja')).toBe('품목');
  });

  it('requires vi and rejects unknown locale keys', () => {
    expect(localizedTextSchema.parse({ vi: 'Tên' })).toEqual({ vi: 'Tên' });
    expect(() => localizedTextSchema.parse({ en: 'Name' })).toThrow();
    expect(() => localizedTextSchema.parse({ vi: 'Tên', fr: 'Nom' })).toThrow();
  });
});
