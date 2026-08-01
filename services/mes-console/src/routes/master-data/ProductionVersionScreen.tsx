import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { BaseDataTable, type BaseDataTableColumn, BaseModal } from '../../components/base';
import { Button } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { translatedEnum, normalizeStatusCode } from '../../lib/i18nLabels';
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
      setPvList((await resp.json()).data || []);
      setItemRevisions(revisionsResp.ok ? ((await revisionsResp.json()).data || []) : []);
      setItems(itemsResp.ok ? ((await itemsResp.json()).data || []) : []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchPVs(); }, [user?.userId]);

  const handleReleasePV = async (pvId: string) => {
    setSubmitting(true);
    try {
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/master-data/production-versions/${pvId}/release`, { method: 'POST', headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' } });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        const failures = Array.isArray(payload.failures) ? payload.failures.map((failure: any) => `${failure.code || failure.rule || 'VALIDATION'}${failure.params ? ` (${Object.entries(failure.params).map(([key, value]) => `${key}=${value}`).join(', ')})` : ''}`).join('; ') : '';
        throw new Error(failures || payload.message || payload.error || t('productionVersion.releaseFailed'));
      }
      toast.success(t('productionVersion.released'));
      await fetchPVs();
    } catch (err: any) {
      toast.error(t('productionVersion.releaseError', { message: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  const rows = useMemo(() => pvList.map((pv) => {
    const status = normalizeStatusCode(pv.status || pv.lifecycle_status || 'Draft');
    const revision = itemRevisions.find((row) => row.master_id === pv.item_revision_id);
    const item = items.find((row) => row.master_id === revision?.item_id);
    const code = pv.code || pv.version_code || '-';
    return { ...pv, status, revision, item, displayName: text(pv.name_i18n) || text(pv.name) || text(item?.name) || text(revision?.name) || code, itemCode: pv.item_code || item?.code || revision?.code || '-', itemName: text(item?.name) || text(revision?.name) || pv.item_code || '-' };
  }), [items, itemRevisions, pvList, text]);

  const columns: BaseDataTableColumn<any>[] = [
    { accessorKey: 'displayName', header: t('productionVersion.code'), cell: ({ row }) => <div><div className="font-semibold text-slate-100">{row.original.displayName}</div><div className="mt-1 font-mono text-xs text-action">{row.original.code || row.original.version_code || '-'}</div></div> },
    { accessorKey: 'itemName', header: t('productionVersion.itemCode'), cell: ({ row }) => <div><div className="font-medium text-slate-100">{row.original.itemName}</div><div className="mt-1 font-mono text-xs text-slate-400">{row.original.itemCode}</div></div> },
    { accessorKey: 'mbom_code', header: t('productionVersion.mbomLink'), cell: ({ row }) => <div><div className="font-medium text-slate-100">{text(row.original.mbom_name) || row.original.mbom_code || '-'}</div><div className="mt-1 font-mono text-xs text-sky-300">{row.original.mbom_code || '-'}</div></div> },
    { accessorKey: 'routing_code', header: t('productionVersion.routingLink'), cell: ({ row }) => <div><div className="font-medium text-slate-100">{text(row.original.routing_name) || row.original.routing_code || '-'}</div><div className="mt-1 font-mono text-xs text-amber-300">{row.original.routing_code || '-'}</div></div> },
    { accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={String(getValue() || '')}>{translatedEnum(t, 'status.master', String(getValue() || ''))}</StatusBadge> },
    { id: 'actions', header: t('productionVersion.validationActions'), enableSorting: false, cell: ({ row }) => <div className="flex justify-end gap-2">{row.original.status !== 'Released' && <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); navigate(`/master-data/production-versions/${row.original.master_id || row.original.id}/edit`); }}>{t('common.edit')}</Button>}{row.original.status !== 'Released' && <Button type="button" size="sm" disabled={submitting} onClick={(event) => { event.stopPropagation(); void handleReleasePV(row.original.master_id || row.original.production_version_id || row.original.id); }}>{t('productionVersion.release')}</Button>}</div> },
  ];

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchPVs} />;
  return <div className="mes-page"><div className="mes-page-header"><div className="flex items-center gap-3"><div className="mes-icon-tile"><Cpu className="h-6 w-6" /></div><div><h1 className="text-xl font-bold text-foreground">{t('productionVersion.title')}</h1><p className="text-xs text-muted-foreground">{t('productionVersion.subtitle')}</p></div></div><div className="flex items-center gap-3"><Button type="button" variant="secondary" size="icon" onClick={() => void fetchPVs()} title={t('common.refresh')}><RefreshCw className={loading ? 'animate-spin' : ''} /></Button><Button type="button" onClick={() => navigate('/master-data/production-versions/new')}>{t('common.create')}</Button></div></div><BaseDataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.master_id || row.production_version_id || row.id} onRowClick={(row) => setSelectedPV(row)} stickyHeader />{selectedPV && <ProductionVersionDetail pv={selectedPV} text={text} t={t} navigate={navigate} onClose={() => setSelectedPV(null)} />}</div>;
};

function ProductionVersionDetail({ pv, text, t, navigate, onClose }: { pv: any; text: (value: any) => string; t: (key: string, params?: Record<string, any>) => string; navigate: (path: string) => void; onClose: () => void }) {
  const title = pv.displayName || text(pv.name_i18n) || text(pv.name) || pv.code || pv.version_code;
  return <BaseModal open title={<div><div>{title}</div><div className="font-mono text-sm font-normal text-action">{pv.code || pv.version_code}</div></div>} onClose={onClose} size="xl" placement="center" contentClassName="space-y-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[t('productionVersion.itemCode'), pv.itemCode || pv.item?.code || pv.revision?.code], [t('productionVersion.itemRevision'), pv.revision?.revision_code || pv.revision?.code || t('common.notAvailable')], [t('common.site'), pv.site_code || t('common.notAvailable')], [t('common.status'), translatedEnum(t, 'status.master', pv.status)]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-border bg-surface-subtle p-3"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 font-semibold text-foreground">{value || t('common.notAvailable')}</div></div>)}</div><div className="grid gap-4 lg:grid-cols-3"><RecipeLink title="MBOM" code={pv.mbom_code} name={pv.mbom_name} onNavigate={() => navigate('/master-data/mboms')} /><RecipeLink title={t('nav.routing')} code={pv.routing_code} name={pv.routing_name} onNavigate={() => navigate('/master-data/routings')} /><RecipeLink title="EBOM" code={pv.ebom_code} name={pv.ebom_name} onNavigate={() => navigate('/master-data/eboms')} /></div></BaseModal>;
}

function RecipeLink({ title, code, name, onNavigate }: { title: string; code?: string; name?: any; onNavigate: () => void }) {
  return <div className="rounded-md border border-border bg-surface-subtle p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-bold text-foreground">{title}</h3><button type="button" onClick={onNavigate} aria-label={title} className="rounded-md p-2 hover:bg-hover"><ExternalLink className="h-4 w-4" /></button></div><div className="mt-2 font-mono font-semibold text-action">{code || '-'}</div><div className="mt-1 text-sm text-muted-foreground">{typeof name === 'string' ? name : name?.vi || name?.en || '—'}</div></div>;
}
