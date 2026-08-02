import React, { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import type { BackendBlocker } from '../../lib/apiTypes';
import { Button } from '../ui/button';
import { StatusBadge } from '../StatusBadge';

export function BaseBlockerList({ blockers, title }: { blockers: BackendBlocker[]; title?: React.ReactNode }) {
  const { t } = useI18n();
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  if (!blockers.length) return null;
  return (
    <section className="rounded-md border border-warning/45 bg-warning/10 p-4" aria-label={String(title || t('blockers.title'))}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-warning-foreground" />
          {title || t('blockers.title')}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDiagnosticOpen((current) => !current)}>
          <Info className="h-4 w-4" />
          {diagnosticOpen ? t('blockers.hideDetails') : t('blockers.showDetails')}
        </Button>
      </div>
      <div className="space-y-2">
        {blockers.map((blocker, index) => {
          const key = `blockers.${blocker.code}`;
          const translated = t(key);
          const label = translated === key ? blocker.message || blocker.code : translated;
          return (
            <div key={`${blocker.code}-${index}`} className="rounded border border-border bg-background p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="readiness" status={blocker.severity === 'blocking' || blocker.severity === 'error' ? 'Blocked' : 'ReadyWithWarnings'} />
                <span className="font-semibold text-foreground">{label}</span>
                {blocker.dimension && <span className="text-xs text-muted-foreground">{blocker.dimension}</span>}
                {blocker.operation_code && <span className="font-mono text-xs text-muted-foreground">{blocker.operation_code}</span>}
                {blocker.route && <Link to={blocker.route} className="text-xs font-semibold text-action hover:underline">{t('common.detail')}</Link>}
              </div>
              {diagnosticOpen && <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface-subtle p-2 text-xs text-muted-foreground">{JSON.stringify(blocker.details || blocker, null, 2)}</pre>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
