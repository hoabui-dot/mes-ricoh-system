import React from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export function BaseEmptyState({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-border bg-surface-subtle px-6 py-10 text-center"><p className="font-semibold text-foreground">{title}</p>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>;
}

export function BaseLoading({ label }: { label?: React.ReactNode }) {
  const { t } = useI18n();
  label = label || t('common.loading');
  return <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

export function BaseTabs({ tabs, value, onValueChange }: { tabs: Array<{ value: string; label: React.ReactNode }>; value: string; onValueChange: (value: string) => void }) {
  return <div role="tablist" className="flex flex-wrap gap-1 border-b border-border">{tabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} onClick={() => onValueChange(tab.value)} className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${value === tab.value ? 'border-action text-action' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab.label}</button>)}</div>;
}
