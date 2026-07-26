import React from 'react';
import { translatedEnum } from '../lib/i18nLabels';

export function RevisionIdentity({ revision, t, compact = false, hasProductionConfiguration = true }: { revision: any; t: (key: string, params?: Record<string, any>) => string; compact?: boolean; hasProductionConfiguration?: boolean }) {
  if (!revision) return <span className="text-muted-foreground">{t('common.notAvailable')}</span>;
  const from = revision.effective_from ? new Date(revision.effective_from).toLocaleDateString() : t('common.notAvailable');
  const to = revision.effective_to ? new Date(revision.effective_to).toLocaleDateString() : t('common.ongoing');
  const status = translatedEnum(t, 'status.master', revision.lifecycle_status || revision.revision_status || 'Draft');
  return <span className={compact ? 'inline-flex flex-wrap items-center gap-1' : 'space-y-1'}>
    <span className="inline-flex flex-wrap items-center gap-1"><span className="font-mono font-semibold">{revision.revision_code || revision.code || t('common.notAvailable')}</span><span className="rounded-full border border-border px-1.5 py-0.5 text-[11px]">[{status}]</span><span className="text-xs text-muted-foreground">• {from} → {to}</span></span>
    {!hasProductionConfiguration && <span className="block text-xs font-medium text-amber-600">{t('revision.noProductionConfiguration')}</span>}
  </span>;
}
