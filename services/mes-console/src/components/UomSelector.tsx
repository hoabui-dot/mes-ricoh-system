import React from 'react';
import { SelectBase, type SelectBaseProps } from './ui';
import { useLocalizedText } from '@mom-platform/i18n-ui-shared';

export type UomRecord = { master_id: string; code: string; name?: unknown; lifecycle_status?: string; uom_class?: string; allow_fraction?: boolean; decimal_precision?: number };

export function uomLabel(uom: UomRecord | undefined, text: (value: any) => string, fallback = '-') {
  if (!uom) return fallback;
  return `${text(uom.name) || uom.code} (${uom.code})`;
}

export function UomSelector({ uoms, value, onValueChange, includeInactive = false, type, ...props }: { uoms: UomRecord[]; value: string; onValueChange: (value: string) => void; includeInactive?: boolean; type?: string } & Omit<SelectBaseProps, 'value' | 'onValueChange' | 'options'>) {
  const text = useLocalizedText();
  const options = uoms.filter((uom) => (includeInactive || String(uom.lifecycle_status || 'Released') === 'Released') && (!type || uom.uom_class === type)).map((uom) => ({ value: uom.master_id, label: uomLabel(uom, text, uom.code), hint: uom.code }));
  return <SelectBase {...props} value={value} onValueChange={onValueChange} options={options} />;
}
