export type NumericValidationCode =
  | 'REQUIRED'
  | 'INVALID_NUMBER'
  | 'NEGATIVE_NOT_ALLOWED'
  | 'ZERO_NOT_ALLOWED'
  | 'FRACTION_NOT_ALLOWED'
  | 'DECIMAL_PRECISION_EXCEEDED'
  | 'BELOW_MINIMUM'
  | 'ABOVE_MAXIMUM'
  | 'UOM_REQUIRED'
  | 'UOM_INACTIVE';

export type UomNumericDefinition = {
  master_id?: string;
  id?: string;
  code?: string;
  name?: unknown;
  decimal_precision?: number;
  decimalPrecision?: number;
  allow_fraction?: boolean;
  allowFraction?: boolean;
  lifecycle_status?: string;
  status?: string;
};

export type NumericValidationResult = { valid: true } | { valid: false; code: NumericValidationCode; message: string };

const DECIMAL_PATTERN = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function countDecimalPlaces(value: string): number {
  const fraction = String(value).split('.')[1];
  return fraction ? fraction.length : 0;
}

export function isNumericEditingValue(value: string): boolean {
  return value === '' || value === '-' || value === '+' || value === '.' || value === '-.' || value === '+.' || DECIMAL_PATTERN.test(value);
}

export function formatQuantityForDisplay(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value).trim();
  if (!DECIMAL_PATTERN.test(raw)) return raw;
  const sign = raw.startsWith('-') || raw.startsWith('+') ? raw[0] : '';
  const unsigned = sign ? raw.slice(1) : raw;
  const [integer, fraction] = unsigned.split('.');
  const compactInteger = (integer || '0').replace(/^0+(?=\d)/, '');
  const compactFraction = (fraction || '').replace(/0+$/, '');
  return `${sign === '+' ? '' : sign}${compactInteger}${compactFraction ? `.${compactFraction}` : ''}`;
}

/**
 * Formats API numeric values for read-only UI text. PostgreSQL numeric values
 * commonly arrive as strings such as `1.000000`; forms keep their raw editing
 * value, while display surfaces should never expose insignificant zeroes.
 */
export function formatNumberForDisplay(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const raw = String(value).trim();
  if (DECIMAL_PATTERN.test(raw)) return formatQuantityForDisplay(raw) || fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return raw || fallback;
  return formatQuantityForDisplay(numeric.toString()) || fallback;
}

function compareDecimalStrings(left: string, right: string): number {
  const normalise = (value: string) => {
    const negative = value.startsWith('-');
    const unsigned = negative || value.startsWith('+') ? value.slice(1) : value;
    const [integer, fraction = ''] = unsigned.split('.');
    return { negative, integer: (integer || '0').replace(/^0+(?=\d)/, ''), fraction: fraction.replace(/0+$/, '') };
  };
  const a = normalise(left); const b = normalise(right);
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const sign = a.negative ? -1 : 1;
  if (a.integer.length !== b.integer.length) return (a.integer.length > b.integer.length ? 1 : -1) * sign;
  if (a.integer !== b.integer) return (a.integer > b.integer ? 1 : -1) * sign;
  const scale = Math.max(a.fraction.length, b.fraction.length);
  const af = a.fraction.padEnd(scale, '0'); const bf = b.fraction.padEnd(scale, '0');
  return (af === bf ? 0 : af > bf ? 1 : -1) * sign;
}

export function validateQuantityAgainstUom(rawValue: string, uom?: UomNumericDefinition, options: { required?: boolean; min?: string; max?: string; allowNegative?: boolean; allowZero?: boolean } = {}): NumericValidationResult {
  const value = String(rawValue ?? '').trim();
  if (!uom || !(uom.master_id || uom.id)) return { valid: false, code: 'UOM_REQUIRED', message: 'A UOM is required.' };
  if (uom.lifecycle_status && uom.lifecycle_status !== 'Released' && uom.status !== 'Released') return { valid: false, code: 'UOM_INACTIVE', message: 'The selected UOM is not Released.' };
  if (!value) return options.required === false ? { valid: true } : { valid: false, code: 'REQUIRED', message: 'A quantity is required.' };
  if (!DECIMAL_PATTERN.test(value) || value === '-' || value === '+' || value === '.' || value === '-.') return { valid: false, code: 'INVALID_NUMBER', message: 'Enter a valid decimal number.' };
  if (!options.allowNegative && value.startsWith('-')) return { valid: false, code: 'NEGATIVE_NOT_ALLOWED', message: 'The quantity cannot be negative.' };
  if (!options.allowZero && compareDecimalStrings(value, '0') === 0) return { valid: false, code: 'ZERO_NOT_ALLOWED', message: 'The quantity must be greater than zero.' };
  const allowFraction = uom.allow_fraction ?? uom.allowFraction ?? true;
  const precision = Number(uom.decimal_precision ?? uom.decimalPrecision ?? 0);
  const effectivePrecision = allowFraction ? precision : 0;
  if (countDecimalPlaces(value) > effectivePrecision) return { valid: false, code: allowFraction ? 'DECIMAL_PRECISION_EXCEEDED' : 'FRACTION_NOT_ALLOWED', message: allowFraction ? `Use at most ${effectivePrecision} decimal places.` : 'Fractions are not allowed for this UOM.' };
  if (options.min !== undefined && compareDecimalStrings(value, options.min) < 0) return { valid: false, code: 'BELOW_MINIMUM', message: `The value must be at least ${options.min}.` };
  if (options.max !== undefined && compareDecimalStrings(value, options.max) > 0) return { valid: false, code: 'ABOVE_MAXIMUM', message: `The value must be at most ${options.max}.` };
  return { valid: true };
}
