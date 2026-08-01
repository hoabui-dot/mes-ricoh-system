import React from 'react';
import { translatedEnum } from '../lib/i18nLabels';

export function RevisionIdentity({ revision, t, compact = false, hasProductionConfiguration = true }: { revision: any; t: (key: string, params?: Record<string, any>) => string; compact?: boolean; hasProductionConfiguration?: boolean }) {
  if (!revision) return <span className="text-muted-foreground">{t('common.notAvailable')}</span>;
  const timeZone = revision.site_timezone || 'Asia/Ho_Chi_Minh';
  const format = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium', timeZone }).format(new Date(value));
  const from = revision.effective_from ? format(revision.effective_from) : t('common.notAvailable');
  const to = revision.effective_to ? format(revision.effective_to) : t('common.ongoing');
  const status = translatedEnum(t, 'status.master', revision.lifecycle_status || revision.revision_status || 'Draft');
  return <span className={compact ? 'inline-flex flex-wrap items-center gap-1' : 'space-y-1'}>
    <span className="inline-flex flex-wrap items-center gap-1"><span className="font-mono font-semibold">{revision.revision_code || revision.code || t('common.notAvailable')}</span><span className="rounded-full border border-border px-1.5 py-0.5 text-[11px]">[{status}]</span><span className="rounded-full border border-amber-700/50 px-1.5 py-0.5 text-[11px] text-amber-300">{t(`items.temporal.${revision.temporal_status || 'Current'}`)}</span><span className="text-xs text-muted-foreground">• {from} → {to} ({timeZone})</span></span>
    {!hasProductionConfiguration && <span className="block text-xs font-medium text-amber-600">{t('revision.noProductionConfiguration')}</span>}
  </span>;
}
