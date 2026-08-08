import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Cpu, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { useAuth } from '../../context/AuthContext';
import { BaseAuditTimeline, BaseBlockerList, BaseDataTable, BaseDependencyPanel, BaseFilterBar, type BaseDataTableColumn } from '../../components/base';
import { BaseModal } from '../../components/base';
import { Button } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { translatedEnum, normalizeStatusCode } from '../../lib/i18nLabels';
import { fetchProductionVersionLineEligibility, fetchProductionVersionReadinessPreview, fetchResourceEnvelope, normalizeApiError, releaseResource, validateProductionVersion } from '../../lib/masterDataApi';
import { mesQueryKeys } from '../../lib/queryKeys';
import type { BackendBlocker, ItemRevisionRow, ItemRow, MesUserContext, ProductionVersionLineEligibility, ProductionVersionReadinessLine, ProductionVersionRow } from '../../lib/apiTypes';

type ProductionVersionFilters = {
  lifecycle_status: string;
  item_revision_id: string;
};

type ProductionVersionDisplayRow = ProductionVersionRow & {
  status: string;
  revision?: ItemRevisionRow;
  item?: ItemRow;
  displayName: string;
  itemCode: string;
  itemName: string;
};

const initialFilters = (): ProductionVersionFilters => ({ lifecycle_status: '', item_revision_id: '' });

export const ProductionVersionScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const displayText = (value: unknown) => text(value as never);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPV, setSelectedPV] = useState<ProductionVersionDisplayRow | null>(null);
  const filters: ProductionVersionFilters = {
    lifecycle_status: searchParams.get('lifecycle_status') || '',
    item_revision_id: searchParams.get('item_revision_id') || '',
  };
  const hasFilters = Boolean(filters.lifecycle_status || filters.item_revision_id);
  const queryFilters = { limit: 200, lifecycle_status: filters.lifecycle_status, item_revision_id: filters.item_revision_id };
  const pvQuery = useQuery({
    queryKey: mesQueryKeys.productionVersions.list(queryFilters),
    queryFn: () => fetchResourceEnvelope<ProductionVersionRow>('production-versions', user, queryFilters),
  });
  const revisionsQuery = useQuery({
    queryKey: mesQueryKeys.itemRevisions.selector({ limit: 500 }),
    queryFn: () => fetchResourceEnvelope<ItemRevisionRow>('item-revisions', user, { limit: 500 }),
  });
  const itemsQuery = useQuery({
    queryKey: mesQueryKeys.items.list({ limit: 500 }),
    queryFn: () => fetchResourceEnvelope<ItemRow>('items', user, { limit: 500 }),
  });
  const releaseMutation = useMutation({
    mutationFn: (pvId: string) => releaseResource('production-versions', pvId, user),
    onSuccess: async () => {
      toast.success(t('productionVersion.released'));
      await pvQuery.refetch();
    },
    onError: (err) => {
      const error = normalizeApiError(err, t('productionVersion.releaseFailed'));
      toast.error(t('productionVersion.releaseError', { message: error.message }));
    },
  });

  const itemRevisions = revisionsQuery.data?.data || [];
  const items = itemsQuery.data?.data || [];
  const rows = useMemo<ProductionVersionDisplayRow[]>(() => (pvQuery.data?.data || []).map((pv) => {
    const status = normalizeStatusCode(pv.status || pv.lifecycle_status || 'Draft');
    const revision = itemRevisions.find((row) => row.master_id === pv.item_revision_id);
    const item = items.find((row) => row.master_id === revision?.item_id);
    const code = pv.code || pv.version_code || '-';
    return { ...pv, status, revision, item, displayName: displayText(pv.name_i18n) || displayText(pv.name) || displayText(item?.name) || displayText(revision?.name) || code, itemCode: pv.item_code || item?.code || revision?.code || '-', itemName: displayText(item?.name) || displayText(revision?.name) || pv.item_code || '-' };
  }), [items, itemRevisions, pvQuery.data?.data, text]);

  const columns: BaseDataTableColumn<ProductionVersionDisplayRow>[] = [
    { accessorKey: 'displayName', header: t('productionVersion.code'), cell: ({ row }) => <div><div className="font-semibold text-slate-100">{row.original.displayName}</div><div className="mt-1 font-mono text-xs text-action">{row.original.code || row.original.version_code || '-'}</div></div> },
    { accessorKey: 'itemName', header: t('productionVersion.itemCode'), cell: ({ row }) => <div><div className="font-medium text-slate-100">{row.original.itemName}</div><div className="mt-1 font-mono text-xs text-slate-400">{row.original.itemCode}</div></div> },
    { accessorKey: 'mbom_code', header: t('productionVersion.mbomLink'), cell: ({ row }) => <div><div className="font-medium text-slate-100">{displayText(row.original.mbom_name) || row.original.mbom_code || '-'}</div><div className="mt-1 font-mono text-xs text-sky-300">{row.original.mbom_code || '-'}</div></div> },
    { accessorKey: 'routing_code', header: t('productionVersion.routingLink'), cell: ({ row }) => <div><div className="font-medium text-slate-100">{displayText(row.original.routing_name) || row.original.routing_code || '-'}</div><div className="mt-1 font-mono text-xs text-amber-300">{row.original.routing_code || '-'}</div></div> },
    { id: 'lineEligibility', header: t('productionVersion.lineEligibility'), cell: ({ row }) => <LineEligibilitySummary pv={row.original} text={displayText} t={t} /> },
    { accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge kind="lifecycle" status={String(getValue() || '')}>{translatedEnum(t, 'status.master', String(getValue() || ''))}</StatusBadge> },
    { id: 'actions', header: t('productionVersion.validationActions'), enableSorting: false, cell: ({ row }) => <div className="flex justify-end gap-2">{row.original.status !== 'Released' && <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); navigate(`/master-data/production-versions/${row.original.master_id || row.original.id}/edit`); }}>{t('common.edit')}</Button>}{row.original.status !== 'Released' && <Button type="button" size="sm" disabled={releaseMutation.isPending} onClick={(event) => { event.stopPropagation(); releaseMutation.mutate(String(row.original.master_id || row.original.production_version_id || row.original.id)); }}>{t('productionVersion.release')}</Button>}</div> },
  ];

  const setFilters = (next: ProductionVersionFilters) => {
    const params = new URLSearchParams();
    if (next.lifecycle_status) params.set('lifecycle_status', next.lifecycle_status);
    if (next.item_revision_id) params.set('item_revision_id', next.item_revision_id);
    setSearchParams(params, { replace: true });
  };
  const error = pvQuery.error ? normalizeApiError(pvQuery.error, t('productionVersion.loadFailed')).message : undefined;
  return <div className="mes-page"><div className="mes-page-header"><div className="flex items-center gap-3"><div className="mes-icon-tile"><Cpu className="h-6 w-6" /></div><div><h1 className="text-xl font-bold text-foreground">{t('productionVersion.title')}</h1><p className="text-xs text-muted-foreground">{t('productionVersion.subtitle')}</p></div></div><div className="flex items-center gap-3"><Button type="button" variant="secondary" size="icon" onClick={() => void pvQuery.refetch()} title={t('common.refresh')}><RefreshCw className={pvQuery.isFetching ? 'animate-spin' : ''} /></Button><Button type="button" onClick={() => navigate('/master-data/production-versions/new')}>{t('common.create')}</Button></div></div><BaseFilterBar filters={filters} onFiltersChange={setFilters} onReset={() => setFilters(initialFilters())} fields={[{ key: 'lifecycle_status', label: t('filters.status'), type: 'select', options: [{ value: '', label: t('common.all') }, ...['Draft', 'InReview', 'Released', 'Inactive', 'Obsolete'].map((value) => ({ value, label: translatedEnum(t, 'status.master', value) }))] }, { key: 'item_revision_id', label: t('productionVersion.itemRevision'), type: 'select', options: [{ value: '', label: t('common.all') }, ...itemRevisions.map((revision) => ({ value: String(revision.master_id), label: `${revision.item_code || revision.code || ''} ${revision.revision_code || ''}`.trim() || String(revision.master_id) }))] }]} /><BaseDataTable data={rows} columns={columns} loading={pvQuery.isLoading} error={error} onRetry={() => void pvQuery.refetch()} filtered={hasFilters} getRowId={(row) => String(row.master_id || row.production_version_id || row.id)} onRowClick={(row) => setSelectedPV(row)} stickyHeader />{selectedPV && <ProductionVersionDetail pv={selectedPV} user={user} text={displayText} t={t} navigate={navigate} onClose={() => setSelectedPV(null)} />}</div>;
};

function ProductionVersionDetail({ pv, user, text, t, navigate, onClose }: { pv: ProductionVersionDisplayRow; user?: MesUserContext | null; text: (value: unknown) => string; t: (key: string, params?: Record<string, string | number | undefined>) => string; navigate: (path: string) => void; onClose: () => void }) {
  const title = pv.displayName || text(pv.name_i18n) || text(pv.name) || pv.code || pv.version_code;
  const pvId = String(pv.master_id || pv.production_version_id || pv.id);
  const eligibilityQuery = useQuery({
    queryKey: mesQueryKeys.productionVersions.lineEligibility(pvId),
    queryFn: () => fetchProductionVersionLineEligibility(pvId, user),
  });
  const readinessQuery = useQuery({
    queryKey: mesQueryKeys.productionVersions.readinessPreview(pvId),
    queryFn: () => fetchProductionVersionReadinessPreview(pvId, user),
  });
  const validationMutation = useMutation({
    mutationFn: () => validateProductionVersion(pvId, user),
    onSuccess: (result) => toast.success(Boolean(result.valid) ? t('productionVersion.validationPassed') : t('productionVersion.validationReturned')),
    onError: (err) => toast.error(normalizeApiError(err, t('productionVersion.validationFailed')).message),
  });
  const eligibility = eligibilityQuery.data || [];
  const readinessLines = readinessQuery.data?.lines || [];
  const blockers = readinessLines.flatMap((line) => (line.blockers || []).map((blocker) => ({ ...blocker, severity: 'blocking', entity_type: text(line.line_name || line.production_line_name) || line.line_code || line.production_line_code || undefined } as BackendBlocker)));
  return <BaseModal open title={<div><div>{title}</div><div className="font-mono text-sm font-normal text-action">{pv.code || pv.version_code}</div></div>} onClose={onClose} size="xl" placement="center" contentClassName="space-y-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[t('productionVersion.itemCode'), pv.itemCode || pv.item?.code || pv.revision?.code], [t('productionVersion.itemRevision'), pv.revision?.revision_code || pv.revision?.code || t('common.notAvailable')], [t('common.site'), pv.site_code || t('common.notAvailable')], [t('common.status'), translatedEnum(t, 'status.master', pv.status)]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-border bg-surface-subtle p-3"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 font-semibold text-foreground">{value || t('common.notAvailable')}</div></div>)}</div><BaseDependencyPanel title={t('productionVersion.recipeStructure')}><div className="grid gap-4 lg:grid-cols-2"><RecipeLink title="MBOM" code={pv.mbom_code} name={pv.mbom_name} onNavigate={() => navigate('/master-data/mboms')} /><RecipeLink title={t('nav.routing')} code={pv.routing_code} name={pv.routing_name} onNavigate={() => navigate('/master-data/routings')} /></div></BaseDependencyPanel><BaseDependencyPanel title={t('productionVersion.lineEligibility')}><div data-testid="pv-line-eligibility-panel" className="space-y-3"><LineEligibilitySummary pv={{ ...pv, line_eligibility_summary: eligibility }} text={text} t={t} /><LineEligibilityTable lines={eligibility} readinessLines={readinessLines} text={text} t={t} />{eligibilityQuery.isLoading || readinessQuery.isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}<BaseBlockerList blockers={blockers} title={t('productionVersion.readinessBlockers')} /></div></BaseDependencyPanel><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => void readinessQuery.refetch()}>{t('productionVersion.refreshReadiness')}</Button><Button type="button" variant="outline" disabled={validationMutation.isPending} onClick={() => validationMutation.mutate()}>{t('productionVersion.validate')}</Button><Button type="button" onClick={() => navigate('/work-orders/new')}>{t('productionVersion.createWorkOrder')}</Button></div><BaseAuditTimeline title={t('common.audit')} events={[{ id: 'status', label: <StatusBadge kind="lifecycle" status={pv.status} />, at: String(pv.updated_at || pv.created_at || ''), actor: String(pv.updated_by || pv.created_by || '') }]} /></BaseModal>;
}

function LineEligibilitySummary({ pv, text, t }: { pv: Pick<ProductionVersionRow, 'line_eligibility_count' | 'primary_line_code' | 'primary_line_name' | 'backup_line_count' | 'line_eligibility_summary'>; text: (value: unknown) => string; t: (key: string, params?: Record<string, string | number | undefined>) => string }) {
  const rows = pv.line_eligibility_summary || [];
  const primary = rows.find((line) => line.is_primary);
  const primaryName = text(pv.primary_line_name || primary?.production_line_name || primary?.line_name) || pv.primary_line_code || primary?.production_line_code || primary?.line_code || t('common.notAvailable');
  const count = Number(pv.line_eligibility_count ?? rows.length ?? 0);
  const backupCount = Number(pv.backup_line_count ?? rows.filter((line) => !line.is_primary).length ?? 0);
  return <div data-testid="pv-line-eligibility-summary" className="space-y-1 text-sm"><div className="font-semibold text-foreground">{primaryName}</div><div className="text-xs text-muted-foreground">{t('productionVersion.eligibilitySummary', { count, backupCount })}</div></div>;
}

function LineEligibilityTable({ lines, readinessLines, text, t }: { lines: ProductionVersionLineEligibility[]; readinessLines: ProductionVersionReadinessLine[]; text: (value: unknown) => string; t: (key: string, params?: Record<string, string | number | undefined>) => string }) {
  const readinessByLine = new Map(readinessLines.map((line) => [line.production_line_id, line]));
  return <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-surface text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{t('productionVersion.productionLine')}</th><th className="px-3 py-2">{t('productionVersion.role')}</th><th className="px-3 py-2">{t('productionVersion.priority')}</th><th className="px-3 py-2">{t('productionVersion.efficiency')}</th><th className="px-3 py-2">{t('productionVersion.selection')}</th><th className="px-3 py-2">{t('productionVersion.readiness')}</th><th className="px-3 py-2">{t('productionVersion.effectivePeriod')}</th></tr></thead><tbody className="divide-y divide-border">{lines.map((line) => { const readiness = readinessByLine.get(line.production_line_id); return <tr key={line.eligibility_id || line.production_line_id}><td className="px-3 py-2"><div className="font-medium text-foreground">{text(line.production_line_name || line.line_name) || line.production_line_code || line.line_code}</div><div className="font-mono text-xs text-muted-foreground">{line.production_line_code || line.line_code}</div></td><td className="px-3 py-2"><StatusBadge kind="lineSelection" status={line.is_primary ? 'Primary' : 'Backup'}>{line.is_primary ? t('productionVersion.primary') : t('productionVersion.backup')}</StatusBadge></td><td className="px-3 py-2">{line.priority_no}</td><td className="px-3 py-2">{line.efficiency_factor || 1}</td><td className="px-3 py-2 text-xs">{line.selection_mode || '-'}<br />{line.selection_policy || '-'}</td><td className="px-3 py-2"><StatusBadge kind="readiness" status={readiness?.readiness_status || 'Unknown'}>{readiness?.readiness_status || t('common.notAvailable')}</StatusBadge></td><td className="px-3 py-2 text-xs text-muted-foreground">{line.effective_from || '-'}<br />{line.effective_to || t('productionVersion.noEndDate')}</td></tr>; })}{!lines.length ? <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">{t('productionVersion.noLineEligibility')}</td></tr> : null}</tbody></table></div>;
}

function RecipeLink({ title, code, name, onNavigate }: { title: string; code?: string; name?: unknown; onNavigate: () => void }) {
  const displayName = typeof name === 'string' ? name : name && typeof name === 'object' ? String((name as Record<string, unknown>).vi || (name as Record<string, unknown>).en || '-') : '-';
  return <div className="rounded-md border border-border bg-background p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-bold text-foreground">{title}</h3><button type="button" onClick={onNavigate} aria-label={title} className="rounded-md p-2 hover:bg-hover"><ExternalLink className="h-4 w-4" /></button></div><div className="mt-2 font-mono font-semibold text-action">{code || '-'}</div><div className="mt-1 text-sm text-muted-foreground">{displayName}</div></div>;
}
