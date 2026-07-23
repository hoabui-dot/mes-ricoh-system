import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { GitCommit, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum, normalizeStatusCode } from '../../lib/i18nLabels';

export const RoutingScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [routings, setRoutings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchRoutings = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/routings`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error(t('routing.loadFailed'));
      }
      const data = await resp.json();
      setRoutings(data.data || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutings();
  }, []);

  const handleReleaseRouting = async (routingId: string) => {
    setSubmitting(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/routings/${routingId}/release`, {
        method: 'POST',
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || t('routing.releaseFailed'));
      }
      toast.success(t('routing.released'));
      await fetchRoutings();
    } catch (err: any) {
      toast.error(t('routing.releaseError', { message: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchRoutings} />;

  return (
    <div className="mes-page">
      <div className="mes-page-header">
        <div className="flex items-center space-x-3">
          <div className="mes-icon-tile">
            <GitCommit className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('routing.title')}</h1>
            <p className="text-xs text-slate-400">{t('routing.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button onClick={fetchRoutings} variant="secondary" size="icon">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="mes-table-wrap">
        <table className="mes-table">
          <thead>
            <tr>
              <th className="px-6 py-4">{t('routing.code')}</th>
              <th className="px-6 py-4">{t('routing.product')}</th>
              <th className="px-6 py-4">{t('routing.sequence')}</th>
              <th className="px-6 py-4">{t('common.status')}</th>
              <th className="px-6 py-4 text-right">{t('routing.validationActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {routings.map((rt, index) => {
              const routingId = typeof rt.routing_id === 'string' ? rt.routing_id : '';
              const routingCode = rt.routing_code || (routingId ? routingId.slice(0, 8) : `ROUTING-${index + 1}`);
              const itemCode = rt.item_code || rt.item_revision_code || rt.item_id || '-';
              const status = normalizeStatusCode(rt.status || rt.lifecycle_status || 'Draft');

              return (
              <tr key={routingId || `${routingCode}-${index}`} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-amber-400">{routingCode}</td>
                <td className="px-6 py-4 text-slate-100 font-medium">{itemCode}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-1">
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-MIX</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-PREP</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-CUT</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-MOLD</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-QC</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    status === 'Released'
                      ? 'bg-emerald-950/60 border border-emerald-800 text-amber-200'
                      : 'bg-amber-950/60 border border-amber-800 text-amber-300'
                  }`}>
                    {translatedEnum(t, 'status.master', status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {status !== 'Released' && routingId && (
                    <Button
                      onClick={() => handleReleaseRouting(routingId)}
                      disabled={submitting}
                      size="sm"
                    >
                      {t('routing.release')}
                    </Button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
