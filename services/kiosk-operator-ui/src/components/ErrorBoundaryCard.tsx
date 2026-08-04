import React from 'react';
import { AlertOctagon, RefreshCw, ShieldAlert } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';

interface ErrorBoundaryCardProps {
  error: any;
  onRetry?: () => void;
}

export const ErrorBoundaryCard: React.FC<ErrorBoundaryCardProps> = ({ error, onRetry }) => {
  const incidentId = React.useMemo(() => crypto.randomUUID().slice(0, 8), []);
  const { t } = useI18n();

  const isCircuitBreaker = error?.status === 503 || error?.message?.includes('circuit breaker');
  const isUnauthorized = error?.status === 401 || error?.status === 403;

  if (isUnauthorized) {
    return (
      <div role="alert" className="min-h-[400px] flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-100">{t('kiosk.error.unauthorized.title')}</h2>
          <p className="text-sm text-slate-400">{t('kiosk.error.unauthorized.body')}</p>
          <button
            onClick={() => (window.location.href = `/kiosk/${localStorage.getItem('kiosk_terminal_id') || 'KIOSK-DEMO-01'}/login`)}
            className="min-h-12 w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
          >
            {t('kiosk.error.login')}
          </button>
        </div>
      </div>
    );
  }

  if (isCircuitBreaker) {
    return (
      <div role="alert" className="min-h-[400px] flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <AlertOctagon className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
          <h2 className="text-xl font-bold text-amber-100">{t('kiosk.error.busy.title')}</h2>
          <p className="text-sm text-amber-200/80">{t('kiosk.error.busy.body')}</p>
          <div className="text-xs font-mono text-slate-500 bg-slate-950 p-2 rounded">
            {t('kiosk.error.incident')}: {incidentId}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex min-h-12 w-full items-center justify-center space-x-2 rounded bg-amber-600 px-4 py-3 font-semibold text-white transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t('kiosk.error.retry')}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="min-h-[400px] flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
        <AlertOctagon className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-100">{t('kiosk.error.system.title')}</h2>
        <p className="text-sm text-slate-400">{t('kiosk.error.system.body')}</p>
        <div className="text-xs font-mono text-rose-400 bg-slate-950 p-2 rounded border border-rose-900/50">
          {t('kiosk.error.incident')}: INC-{incidentId}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex min-h-12 w-full items-center justify-center space-x-2 rounded bg-slate-800 px-4 py-3 font-semibold text-slate-200 transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t('kiosk.error.retry')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
