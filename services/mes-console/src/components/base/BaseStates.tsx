import React from 'react';
import { AlertTriangle, Ban, Loader2, RefreshCw } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button } from '../ui/button';

export function BaseEmptyState({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-border bg-surface-subtle px-6 py-10 text-center"><p className="font-semibold text-foreground">{title}</p>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>;
}

export function BaseLoading({ label }: { label?: React.ReactNode }) {
  const { t } = useI18n();
  label = label || t('common.loading');
  return <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

export function BaseErrorState({ title, message, onRetry }: { title?: React.ReactNode; message?: React.ReactNode; onRetry?: () => void }) {
  const { t } = useI18n();
  return <div role="alert" className="rounded-md border border-danger/45 bg-danger/10 px-6 py-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-foreground" /><div className="min-w-0 flex-1"><p className="font-semibold text-foreground">{title || t('common.error')}</p>{message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}{onRetry && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}><RefreshCw className="h-4 w-4" />{t('common.retry')}</Button>}</div></div></div>;
}

export function BaseForbiddenState({ title, description }: { title?: React.ReactNode; description?: React.ReactNode }) {
  const { t } = useI18n();
  return <div role="alert" className="rounded-md border border-warning/45 bg-warning/10 px-6 py-5"><div className="flex items-start gap-3"><Ban className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" /><div><p className="font-semibold text-foreground">{title || t('common.forbidden')}</p>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div></div></div>;
}

export function BaseTabs({ tabs, value, onValueChange }: { tabs: Array<{ value: string; label: React.ReactNode }>; value: string; onValueChange: (value: string) => void }) {
  return <div role="tablist" className="flex flex-wrap gap-1 border-b border-border">{tabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} onClick={() => onValueChange(tab.value)} className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${value === tab.value ? 'border-action text-action' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab.label}</button>)}</div>;
}
