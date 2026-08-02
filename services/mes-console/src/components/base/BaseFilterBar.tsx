import React from 'react';
import { RotateCcw } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SelectBase } from '../ui/select';

export type BaseFilterOption = {
  value: string;
  label: React.ReactNode;
};

export type BaseFilterField<TFilters extends Record<string, string>> = {
  key: keyof TFilters & string;
  label: React.ReactNode;
  type?: 'text' | 'select';
  options?: BaseFilterOption[];
  placeholder?: string;
  dependentKeys?: Array<keyof TFilters & string>;
};

export type BaseFilterBarProps<TFilters extends Record<string, string>> = {
  filters: TFilters;
  fields: Array<BaseFilterField<TFilters>>;
  onFiltersChange: (filters: TFilters) => void;
  onReset: () => void;
};

export function BaseFilterBar<TFilters extends Record<string, string>>({ filters, fields, onFiltersChange, onReset }: BaseFilterBarProps<TFilters>) {
  const { t } = useI18n();
  const update = (field: BaseFilterField<TFilters>, value: string) => {
    const next = { ...filters, [field.key]: value } as TFilters;
    for (const dependentKey of field.dependentKeys || []) next[dependentKey] = '' as TFilters[typeof dependentKey];
    onFiltersChange(next);
  };
  return (
    <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3">
      {fields.map((field) => (
        <label key={field.key} className="min-w-44 flex-1 space-y-1 text-sm">
          <span className="font-semibold text-muted-foreground">{field.label}</span>
          {field.type === 'select' ? (
            <SelectBase value={filters[field.key] || ''} onValueChange={(value) => update(field, value)} options={field.options || []} placeholder={field.placeholder || String(field.label)} aria-label={String(field.label)} />
          ) : (
            <Input value={filters[field.key] || ''} onChange={(event) => update(field, event.target.value)} placeholder={field.placeholder} aria-label={String(field.label)} />
          )}
        </label>
      ))}
      <Button type="button" variant="outline" onClick={onReset}>
        <RotateCcw className="h-4 w-4" />
        {t('common.reset')}
      </Button>
    </div>
  );
}
