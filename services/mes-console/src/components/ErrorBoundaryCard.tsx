import React from 'react';
import { AlertOctagon, RefreshCw, ShieldAlert } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Card } from './ui';

interface ErrorBoundaryCardProps {
  error: any;
  onRetry?: () => void;
}

export const ErrorBoundaryCard: React.FC<ErrorBoundaryCardProps> = ({ error, onRetry }) => {
  const { t } = useI18n();
  const incidentId = React.useMemo(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().slice(0, 8);
    }
    return Math.random().toString(36).substring(2, 10);
  }, []);

  const isCircuitBreaker = error?.status === 503 || error?.message?.includes('circuit breaker');
  const isUnauthorized = error?.status === 401 || error?.status === 403;

  if (isUnauthorized) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <Card className="p-8 max-w-md w-full text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-100">{t('error.unauthorized.title')}</h2>
          <p className="text-sm text-slate-400">
            {t('error.unauthorized.body')}
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="w-full bg-action hover:bg-action-hover text-white font-semibold py-3 px-4 rounded-md transition"
          >
            {t('error.loginAgain')}
          </Button>
        </Card>
      </div>
    );
  }

  if (isCircuitBreaker) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <Card className="p-8 max-w-md w-full text-center space-y-4 border-action/40">
          <AlertOctagon className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
          <h2 className="text-xl font-bold text-amber-100">{t('error.busy.title')}</h2>
          <p className="text-sm text-amber-200/80">
            {t('error.busy.body')}
          </p>
          <div className="text-xs font-mono text-slate-500 bg-slate-950 p-2 rounded">
            {t('error.incident', { incidentId })}
          </div>
          {onRetry && (
            <Button
              onClick={onRetry}
              className="w-full"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t('common.retry')}</span>
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <Card className="p-8 max-w-md w-full text-center space-y-4 border-rose-500/30">
        <AlertOctagon className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-100">{t('error.system.title')}</h2>
        <p className="text-sm text-slate-400">
          {t('error.system.body')}
        </p>
        <div className="text-xs font-mono text-rose-400 bg-slate-950 p-2 rounded border border-rose-900/50">
          {t('error.incident', { incidentId })}
        </div>
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="secondary"
            className="w-full"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t('common.reload')}</span>
          </Button>
        )}
      </Card>
    </div>
  );
};
