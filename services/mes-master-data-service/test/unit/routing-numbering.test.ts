import { describe, expect, it } from 'vitest';
import { formatRoutingCode } from '../../src/infrastructure/http/routing-numbering.js';

describe('MES routing numbering', () => {
  it('formats a date and sequence with the RT business prefix', () => {
    expect(formatRoutingCode('2026-07-23', 1)).toBe('RT-20260723-0001');
    expect(formatRoutingCode('20260723', 12)).toBe('RT-20260723-0012');
  });

  it('rejects invalid numbering inputs', () => {
    expect(() => formatRoutingCode('2026/07/23', 1)).toThrow();
    expect(() => formatRoutingCode('20260723', 0)).toThrow();
  });
});
