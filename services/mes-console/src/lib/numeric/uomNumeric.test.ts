import { describe, expect, it } from 'vitest';
import { formatNumberForDisplay, formatQuantityForDisplay, validateQuantityAgainstUom } from './uomNumeric';

const pcs = { id: 'pcs', code: 'PCS', lifecycle_status: 'Released', allow_fraction: false, decimal_precision: 0 };
const kg = { id: 'kg', code: 'KG', lifecycle_status: 'Released', allow_fraction: true, decimal_precision: 3 };

describe('UOM numeric rules', () => {
  it('formats values without insignificant zeros', () => {
    expect(formatQuantityForDisplay('1.000000')).toBe('1');
    expect(formatQuantityForDisplay('1.500000')).toBe('1.5');
    expect(formatQuantityForDisplay('1000.010000')).toBe('1000.01');
  });
  it('formats read-only API numbers with a consistent fallback', () => {
    expect(formatNumberForDisplay('1.000000')).toBe('1');
    expect(formatNumberForDisplay('1.250000')).toBe('1.25');
    expect(formatNumberForDisplay(null)).toBe('-');
  });
  it('enforces integer-only UOMs', () => {
    expect(validateQuantityAgainstUom('1', pcs, { allowZero: false }).valid).toBe(true);
    expect(validateQuantityAgainstUom('1.1', pcs, { allowZero: false })).toMatchObject({ valid: false, code: 'FRACTION_NOT_ALLOWED' });
  });
  it('enforces configured decimal precision', () => {
    expect(validateQuantityAgainstUom('1.125', kg, { allowZero: false }).valid).toBe(true);
    expect(validateQuantityAgainstUom('1.1254', kg, { allowZero: false })).toMatchObject({ valid: false, code: 'DECIMAL_PRECISION_EXCEEDED' });
  });
});
