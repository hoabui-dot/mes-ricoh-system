import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ClipboardList, Clock3, LogOut, Package, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { useKioskSocket } from '../context/KioskSocketContext';
import { cacheWorkOrders, getCachedWorkOrders } from '../lib/db';
import { ErrorBoundaryCard } from '../components/ErrorBoundaryCard';
import { LanguageSelect } from '../components/LanguageSelect';
import { formatCacheAge, formatDateTime, stateTone, workOrderStateKey } from '../lib/presentation';
import type { KioskWorkOrderListResponse, KioskWorkOrderSummary } from '../types/kiosk';
import { bearerHeaders, clearKioskBrowserSession } from '../lib/auth';
import { gatewayUrl } from '../lib/runtimeConfig';

const countItems = [
  ['total', 'kiosk.count.total'],
  ['waiting', 'kiosk.count.waiting'],
  ['ready', 'kiosk.count.ready'],
  ['in_progress', 'kiosk.count.inProgress'],
  ['completed', 'kiosk.count.completed'],
  ['failed', 'kiosk.count.failed'],
  ['blocked', 'kiosk.count.blocked'],
] as const;

export const WOListScreen: React.FC = () => {
  const { terminalId = 'KIOSK-DEMO-01' } = useParams();
  const navigate = useNavigate();
  const { lastEvent, refreshVersion, disconnectSocket } = useKioskSocket();
  const { locale, resolveText, t, formatNumber } = useI18n();
  const [workOrders, setWorkOrders] = useState<KioskWorkOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [cachedAt, setCachedAt] = useState<string>();

  const fetchWorkOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        gatewayUrl(`/api/mes/execution/kiosk/terminals/${encodeURIComponent(terminalId)}/work-orders?page=1&page_size=50`),
        { headers: bearerHeaders() },
      );
      if (!response.ok) throw { status: response.status };
      const result = (await response.json()) as KioskWorkOrderListResponse;
      setWorkOrders(result.data || []);
      setCachedAt(undefined);
      await cacheWorkOrders(result.data || []);
    } catch (requestError) {
      const cached = await getCachedWorkOrders();
      if (cached.length === 0) {
        setError(requestError);
      } else {
        setWorkOrders(cached);
        setCachedAt(cached.reduce((latest, item) => item.cached_at > latest ? item.cached_at : latest, cached[0].cached_at));
      }
    } finally {
      setLoading(false);
    }
  }, [terminalId]);

  useEffect(() => {
    void fetchWorkOrders();
  }, [fetchWorkOrders]);

  useEffect(() => {
    if (lastEvent) toast.info(t('kiosk.eventRefresh'));
  }, [lastEvent, t]);

  useEffect(() => {
    if (refreshVersion > 0) void fetchWorkOrders();
  }, [fetchWorkOrders, refreshVersion]);

  const handleLogout = async () => {
    try {
      await fetch(gatewayUrl(`/api/mes/kiosk-gateway/terminals/${encodeURIComponent(terminalId)}/logout`), {
        method: 'POST',
        headers: bearerHeaders(),
      });
    } catch {
      // Local logout must still complete when the gateway is temporarily unavailable.
    } finally {
      disconnectSocket();
      await clearKioskBrowserSession();
      navigate(`/kiosk/${terminalId}/login`, { replace: true });
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={() => void fetchWorkOrders()} />;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-indigo-500/30 bg-indigo-950 text-indigo-300">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-100">{t('kiosk.list.title')}</h1>
            <p className="truncate text-sm text-slate-400">{t('kiosk.terminal', { terminalId })}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSelect />
          <button
            type="button"
            onClick={() => void fetchWorkOrders()}
            aria-label={t('kiosk.refresh')}
            title={t('kiosk.refresh')}
            className="flex h-12 w-12 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex min-h-12 items-center gap-2 rounded border border-rose-800 bg-rose-950/50 px-4 text-sm font-semibold text-rose-200 hover:bg-rose-900"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            <span>{t('kiosk.logout')}</span>
          </button>
        </div>
      </header>

      {cachedAt && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-y border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          <Clock3 className="h-5 w-5" aria-hidden="true" />
          <strong>{t('kiosk.cached.title')}</strong>
          <span>{t('kiosk.cached.age', { age: formatCacheAge(locale, cachedAt) })}</span>
        </div>
      )}

      {loading && workOrders.length === 0 ? (
        <div role="status" aria-live="polite" className="flex min-h-80 items-center justify-center text-slate-300">
          <div className="space-y-3 text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-indigo-400" aria-hidden="true" />
            <p>{t('kiosk.loading.list')}</p>
          </div>
        </div>
      ) : workOrders.length === 0 ? (
        <div className="flex min-h-80 items-center justify-center border-y border-slate-800 text-center">
          <div className="max-w-md space-y-2 px-4">
            <Package className="mx-auto h-10 w-10 text-slate-500" aria-hidden="true" />
            <h2 className="text-lg font-semibold">{t('kiosk.empty.title')}</h2>
            <p className="text-sm text-slate-400">{t('kiosk.empty.body')}</p>
          </div>
        </div>
      ) : (
        <section aria-label={t('kiosk.list.title')} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {workOrders.map((workOrder) => {
            const lineName = resolveText(workOrder.selected_production_line_name_i18n);
            const line = [workOrder.selected_production_line_code, lineName].filter(Boolean).join(' · ') || t('kiosk.notAvailable');
            return (
              <article key={workOrder.wo_id} className="space-y-4 rounded border border-slate-800 bg-slate-900 p-5 shadow-lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 shrink-0 text-indigo-300" aria-hidden="true" />
                      <h2 className="font-mono text-lg font-bold text-slate-100">{workOrder.wo_code}</h2>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-300">{workOrder.item_name || workOrder.item_code}</p>
                    <p className="text-xs text-slate-500">{workOrder.item_code}</p>
                  </div>
                  <span className={`rounded border px-3 py-1 text-xs font-semibold ${stateTone(workOrder.status)}`}>
                    {t(workOrderStateKey(workOrder.status))}
                  </span>
                </div>

                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">{t('kiosk.line')}</dt><dd className="font-mono text-slate-200">{line}</dd></div>
                  <div><dt className="text-xs text-slate-500">{t('kiosk.quantity')}</dt><dd className="font-mono text-slate-200">{formatNumber(workOrder.quantity)} {workOrder.uom_code || t('kiosk.notAvailable')}</dd></div>
                </dl>

                {workOrder.job_counts.failed > 0 && (
                  <div className="flex items-center gap-2 border-y border-rose-900 py-2 text-sm font-semibold text-rose-300">
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    {t('kiosk.failureWarning', { count: workOrder.job_counts.failed })}
                  </div>
                )}

                <dl className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {countItems.map(([field, key]) => (
                    <div key={field} className="min-w-0 text-center">
                      <dt className="truncate text-xs text-slate-500">{t(key)}</dt>
                      <dd className="mt-1 font-mono text-base font-bold text-slate-100">{workOrder.job_counts[field]}</dd>
                    </div>
                  ))}
                </dl>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    [t('kiosk.progress.overall'), workOrder.progress_percent],
                    [t('kiosk.progress.manual'), workOrder.manual_progress_percent],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <div className="mb-1 flex justify-between text-xs text-slate-400"><span>{label}</span><span>{value}%</span></div>
                      <div className="h-2 overflow-hidden rounded bg-slate-800" role="progressbar" aria-label={String(label)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(value)}>
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, Number(value)))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">{t('kiosk.updated')}: <time dateTime={workOrder.updated_at}>{formatDateTime(locale, workOrder.updated_at) || t('kiosk.notAvailable')}</time></p>
                  <button
                    type="button"
                    onClick={() => navigate(`/kiosk/${terminalId}/wo/${workOrder.wo_id}`)}
                    className="flex min-h-12 items-center justify-center gap-2 rounded bg-indigo-600 px-5 font-semibold text-white hover:bg-indigo-500"
                  >
                    <Play className="h-5 w-5" aria-hidden="true" />
                    <span>{t('kiosk.open')}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
};
