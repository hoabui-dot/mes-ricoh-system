import React from 'react';
import { Input } from './ui';
import { formatQuantityForDisplay, isNumericEditingValue, type UomNumericDefinition } from '../lib/numeric/uomNumeric';

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  uom?: UomNumericDefinition;
  label: React.ReactNode;
  required?: boolean;
  min?: string;
  max?: string;
  allowNegative?: boolean;
  allowZero?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
};

export const UomNumberInput: React.FC<Props> = ({ value, onValueChange, uom, label, required = false, min, max, allowNegative = false, allowZero = true, disabled, error, className }) => {
  // Do not validate during render. UOM data is loaded asynchronously and an
  // incomplete first render must not show a false UOM_REQUIRED error. Submit
  // handlers/backend validation own the validation result passed through error.
  const message = error || '';
  const precision = Number(uom?.decimal_precision ?? uom?.decimalPrecision ?? 0);
  return <label className="block space-y-1 text-sm font-medium">
    <span className="flex items-center justify-between gap-2"><span>{label}{required ? ' *' : ''}</span>{uom?.code && <span className="font-mono text-xs text-muted-foreground">{uom.code} · max {uom?.allow_fraction === false ? 0 : precision} decimals</span>}</span>
    <Input type="text" inputMode="decimal" value={value} disabled={disabled} aria-invalid={Boolean(message)} aria-describedby={message ? `${String(label).replace(/\W+/g, '-')}-error` : undefined} min={undefined} max={undefined} className={className} onWheel={(event) => event.currentTarget.blur()} onChange={(event) => { const raw = event.target.value; if (isNumericEditingValue(raw)) onValueChange(raw); }} onBlur={() => { if (value) onValueChange(formatQuantityForDisplay(value)); }} />
    {message && <span id={`${String(label).replace(/\W+/g, '-')}-error`} className="text-xs font-normal text-destructive">{message}</span>}
  </label>;
};
