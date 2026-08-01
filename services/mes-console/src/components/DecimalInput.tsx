import React from 'react';
import { Input } from './ui';
import { formatQuantityForDisplay, isNumericEditingValue } from '../lib/numeric/uomNumeric';

type Props = { value: string; onValueChange: (value: string) => void; label: React.ReactNode; min?: string; max?: string; precision?: number; required?: boolean; integer?: boolean; disabled?: boolean; className?: string };

export const DecimalInput: React.FC<Props> = ({ value, onValueChange, label, min, max, precision = 6, required, integer = false, disabled, className }) => {
  const invalid = value !== '' && (!isNumericEditingValue(value) || (integer ? value.includes('.') : value.split('.')[1]?.length > precision));
  return <label className="block space-y-1 text-sm font-medium"><span className="flex items-center justify-between gap-2"><span>{label}{required ? ' *' : ''}</span><span className="text-xs font-normal text-muted-foreground">max {integer ? 0 : precision} decimals</span></span><Input type="text" inputMode={integer ? 'numeric' : 'decimal'} value={value} disabled={disabled} min={undefined} max={undefined} aria-invalid={invalid} className={className} onWheel={(event) => event.currentTarget.blur()} onChange={(event) => { if (isNumericEditingValue(event.target.value)) onValueChange(event.target.value); }} onBlur={() => { if (value && !invalid) onValueChange(formatQuantityForDisplay(value)); }} />{invalid && <span className="text-xs font-normal text-destructive">{integer ? 'Enter a whole number.' : `Use at most ${precision} decimal places.`}</span>}{min && value && Number(value) < Number(min) && <span className="text-xs font-normal text-destructive">Minimum: {min}</span>}{max && value && Number(value) > Number(max) && <span className="text-xs font-normal text-destructive">Maximum: {max}</span>}</label>;
};
