import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Cpu, CheckCircle2, RefreshCw, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { translatedEnum, normalizeStatusCode } from '../../lib/i18nLabels';
import { Button } from '../../components/ui';
import { gatewayBaseUrl } from '../../lib/masterDataApi';

export const ProductionVersionScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const navigate = useNavigate();
  const [pvList, setPvList] = useState<any[]>([]);
  const [itemRevisions, setItemRevisions] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPV, setSelectedPV] = useState<any>(null);

  const fetchPVs = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const headers = { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' };
      const [resp, revisionsResp, itemsResp] = await Promise.all([
        fetch(`${gatewayBaseUrl()}/api/mes/master-data/production-versions`, { headers }),
        fetch(`${gatewayBaseUrl()}/api/mes/master-data/item-revisions`, { headers }),
        fetch(`${gatewayBaseUrl()}/api/mes/master-data/items`, { headers }),
      ]);
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error(t('productionVersion.loadFailed'));
      }
      const data = await resp.json();
      setPvList(data.data || []);
      setItemRevisions(revisionsResp.ok ? ((await revisionsResp.json()).data || []) : []);
      setItems(itemsResp.ok ? ((await itemsResp.json()).data || []) : []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPVs();
  }, []);

  const handleReleasePV = async (pvId: string) => {
    setSubmitting(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/master-data/production-versions/${pvId}/release`, {
        method: 'POST',
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || t('productionVersion.releaseFailed'));
      }
      toast.success(t('productionVersion.released'));
      await fetchPVs();
    } catch (err: any) {
      toast.error(t('productionVersion.releaseError', { message: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchPVs} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-md">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-action/10 border border-action/20 rounded-md text-action">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('productionVersion.title')}</h1>
            <p className="text-xs text-slate-400">{t('productionVersion.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={fetchPVs} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button onClick={() => navigate('/master-data/production-versions/new')}>Create Production Version</Button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">{t('productionVersion.code')}</th>
              <th className="px-6 py-4">{t('productionVersion.itemCode')}</th>
              <th className="px-6 py-4">{t('productionVersion.mbomLink')}</th>
              <th className="px-6 py-4">{t('productionVersion.routingLink')}</th>
              <th className="px-6 py-4">{t('common.status')}</th>
              <th className="px-6 py-4 text-right">{t('productionVersion.validationActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {pvList.map((pv) => {
              const status = normalizeStatusCode(pv.status || pv.lifecycle_status || 'Draft');
              const revision = itemRevisions.find((row) => row.master_id === pv.item_revision_id);
              const item = items.find((row) => row.master_id === revision?.item_id);
              const productionVersionCode = pv.code || pv.version_code || '-';
              const productionVersionName = text(pv.name) || text(item?.name) || text(revision?.name) || productionVersionCode;
              const itemCode = pv.item_code || item?.code || revision?.code || '-';
              const itemName = text(item?.name) || text(revision?.name) || itemCode;
              return (
              <tr key={pv.master_id || pv.production_version_id || pv.id} onClick={() => setSelectedPV({ ...pv, revision, item, status })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedPV({ ...pv, revision, item, status }); }} tabIndex={0} className="cursor-pointer hover:bg-slate-800/40 transition">
                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-100">{productionVersionName}</div>
                  <div className="mt-1 font-mono text-xs text-action">{productionVersionCode}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-100">{itemName}</div>
                  <div className="mt-1 font-mono text-xs text-slate-400">{itemCode}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-100">{text(pv.mbom_name) || pv.mbom_code || '-'}</div>
                  <div className="mt-1 font-mono text-xs text-sky-300">{pv.mbom_code || '-'}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-100">{text(pv.routing_name) || pv.routing_code || '-'}</div>
                  <div className="mt-1 font-mono text-xs text-amber-300">{pv.routing_code || '-'}</div>
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
                  {status !== 'Released' && <button onClick={(event) => { event.stopPropagation(); navigate(`/master-data/production-versions/${pv.master_id || pv.id}/edit`); }} className="mr-2 px-3 py-1.5 border border-border rounded-md text-xs text-foreground">Edit</button>}
                  {status !== 'Released' && (
                    <button
                      onClick={(event) => { event.stopPropagation(); void handleReleasePV(pv.master_id || pv.production_version_id || pv.id); }}
                      disabled={submitting}
                      className="px-3.5 py-1.5 bg-action hover:bg-action-hover text-white rounded-lg text-xs font-semibold transition"
                    >
                      {t('productionVersion.release')}
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedPV && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="production-version-detail-title"><div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-surface shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface p-5"><div><h2 id="production-version-detail-title" className="font-mono text-xl font-bold text-action">{selectedPV.code || selectedPV.version_code}</h2><p className="text-sm text-muted-foreground">{selectedPV.item_name?.vi || selectedPV.item_name?.en || selectedPV.item?.name?.vi || selectedPV.item_code || '-'}</p></div><button type="button" onClick={() => setSelectedPV(null)} aria-label={t('common.close')} className="rounded-md p-2 hover:bg-hover"><X className="h-5 w-5" /></button></div><div className="space-y-6 p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[t('productionVersion.itemCode'), selectedPV.item_code || selectedPV.item?.code || selectedPV.revision?.code], [t('productionVersion.itemRevision'), selectedPV.revision?.revision_code || selectedPV.revision?.code || t('common.notAvailable')], [t('common.site'), selectedPV.site_code || t('common.notAvailable')], [t('common.status'), translatedEnum(t, 'status.master', selectedPV.status)]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-border bg-surface-subtle p-3"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 font-semibold text-foreground">{value || t('common.notAvailable')}</div></div>)}</div><div className="grid gap-4 lg:grid-cols-3"><RecipeLink title="MBOM" code={selectedPV.mbom_code} name={selectedPV.mbom_name} onNavigate={() => navigate('/master-data/mboms')} /><RecipeLink title={t('nav.routing')} code={selectedPV.routing_code} name={selectedPV.routing_name} onNavigate={() => navigate('/master-data/routings')} /><div className="rounded-md border border-border bg-surface-subtle p-4"><h3 className="font-bold text-foreground">EBOM</h3><p className="mt-2 text-sm text-muted-foreground">{t('productionVersion.ebomMissing')}</p></div></div></div></div></div>}
    </div>
  );
};

function RecipeLink({ title, code, name, onNavigate }: { title: string; code?: string; name?: any; onNavigate: () => void }) {
  return <div className="rounded-md border border-border bg-surface-subtle p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-bold text-foreground">{title}</h3><button type="button" onClick={onNavigate} aria-label={title} className="rounded-md p-2 hover:bg-hover"><ExternalLink className="h-4 w-4" /></button></div><div className="mt-2 font-mono font-semibold text-action">{code || '-'}</div><div className="mt-1 text-sm text-muted-foreground">{typeof name === 'string' ? name : name?.vi || name?.en || '—'}</div></div>;
}
