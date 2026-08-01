import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Package, Plus, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { Button, Card, Confirmation, SelectBase, InfoTooltip } from '../../components/ui';
import { BaseDataTable, type BaseDataTableColumn } from '../../components/base';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { generateCodePreview } from '../../lib/codePreview';
import { normalizeStatusCode, translatedEnum } from '../../lib/i18nLabels';
import { fetchResource, postResource, putResource, releaseResource, gatewayBaseUrl } from '../../lib/masterDataApi';
import { RevisionIdentity } from '../../components/RevisionIdentity';
import { UomSelector, uomLabel } from '../../components/UomSelector';
import { EffectiveDateTimePicker, isoToSiteDateTime, siteDateTimeToIso } from '../../components/EffectiveDateTimePicker';

const ITEM_TYPES = ['FG', 'SFG', 'RM'] as const;
const RELEASABLE_REVISION_STATUSES = new Set(['Draft', 'InReview', 'Inactive']);

function isReleasableRevision(revision: any) {
  return RELEASABLE_REVISION_STATUSES.has(normalizeStatusCode(revision.lifecycle_status || revision.status || 'Draft'));
}

function revisionErrorMessage(t: (key: string, params?: Record<string, any>) => string, error: any) {
  const code = String(error?.code || '');
  const translated = t(`items.revisionErrors.${code}`);
  return translated === `items.revisionErrors.${code}` ? String(error?.message || t('items.revisionError')) : translated;
}

function latestRevision(revisions: any[]) {
  const now = Date.now();
  const effective = revisions.filter((revision) => {
    const from = new Date(String(revision.effective_from || '')).getTime();
    const to = revision.effective_to ? new Date(String(revision.effective_to)).getTime() : Number.POSITIVE_INFINITY;
    return Number.isFinite(from) && from <= now && now < to;
  });
  return [...(effective.length ? effective : revisions)].sort((left, right) => new Date(String(right.effective_from || 0)).getTime() - new Date(String(left.effective_from || 0)).getTime())[0];
}

export const ItemsScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const [items, setItems] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [materialGroups, setMaterialGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState<LocalizedValues>(emptyLocalized());
  const [itemType, setItemType] = useState('FG');
  const [materialGroupId, setMaterialGroupId] = useState('');
  const setItemGroup = (legacyCode: string) => setMaterialGroupId(materialGroups.find((group) => group.code === legacyCode)?.master_id || '');
  const [submitting, setSubmitting] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [baseUomId, setBaseUomId] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null);
  const [revisionTarget, setRevisionTarget] = useState<any>(null);
  const [revisionName, setRevisionName] = useState<LocalizedValues>(emptyLocalized());
  const [revisionUomId, setRevisionUomId] = useState('');
  const initialRevisionDateTime = isoToSiteDateTime(new Date(Date.now() + 60_000).toISOString(), 'Asia/Ho_Chi_Minh');
  const [revisionEffectiveDate, setRevisionEffectiveDate] = useState(initialRevisionDateTime.date);
  const [revisionEffectiveTime, setRevisionEffectiveTime] = useState(initialRevisionDateTime.time);
  const [revisionSiteTimezone, setRevisionSiteTimezone] = useState('Asia/Ho_Chi_Minh');
  const [revisionChangeReason, setRevisionChangeReason] = useState('');
  const itemTypeLabel = (type: string) => `${t(`item.type.${type}`)} (${type})`;

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const [resp, revisionsResp, uomRows] = await Promise.all([
        fetch(`${gatewayBaseUrl()}/api/mes/master-data/items`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
        }),
        fetch(`${gatewayBaseUrl()}/api/mes/master-data/item-revisions?limit=500`, {
          headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
        }),
        fetch(`${gatewayBaseUrl()}/api/mes/master-data/uoms?limit=500`, {
          headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles?.[0] || 'PROD_MANAGER' },
        }),
      ]);
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error(t('items.loadFailed'));
      }
      const data = await resp.json();
      setItems(data.data || []);
      setRevisions(revisionsResp.ok ? ((await revisionsResp.json()).data || []) : []);
      setUoms(uomRows.ok ? ((await uomRows.json()).data || []) : []);
      setMaterialGroups(await fetchResource('material-groups', user, '?limit=500'));
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);


  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCode || !itemName.vi.trim() || !baseUomId || !materialGroupId) {
      toast.error(t('items.required'));
      return;
    }
    setSubmitting(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/master-data/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles?.[0] || 'PROD_MANAGER',
        },
        body: JSON.stringify({ code: itemCode, name: itemName, item_type: itemType, material_group_id: materialGroupId, base_uom_id: baseUomId }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || t('items.createFailed'));
      }
      toast.success(t('items.created', { code: itemCode }));
      setShowCreateModal(false);
      setItemCode('');
      setItemName(emptyLocalized());
      setMaterialGroupId('');
      setBaseUomId('');
      await fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !itemName.vi.trim() || !baseUomId) return toast.error(t('items.required'));
    setSubmitting(true);
    try {
      await putResource('items', editingItem.master_id, { name: itemName, item_type: itemType, material_group_id: materialGroupId, base_uom_id: baseUomId }, user);
      toast.success(t('common.save')); setEditingItem(null); setSelectedItem(null); await fetchItems();
    } catch (error: any) { toast.error(error.message); } finally { setSubmitting(false); }
  };

  const openNewRevision = (item: any, revision: any) => {
    setRevisionTarget({ item, revision });
    setRevisionName(revision.name || item.name || emptyLocalized());
    setRevisionUomId(revision.base_uom_id || item.base_uom_id || '');
    setMaterialGroupId(revision.material_group_id || item.material_group_id || '');
    const siteTimezone = revision.site_timezone || item.site_timezone || 'Asia/Ho_Chi_Minh';
    const initial = isoToSiteDateTime(new Date(Date.now() + 60_000).toISOString(), siteTimezone);
    setRevisionSiteTimezone(siteTimezone);
    setRevisionEffectiveDate(initial.date);
    setRevisionEffectiveTime(initial.time);
    setRevisionChangeReason('');
  };

  const handleCreateRevision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!revisionTarget || !revisionName.vi.trim() || !revisionUomId || !materialGroupId || !revisionChangeReason.trim()) {
      toast.error(t('items.revisionRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const effectiveFrom = siteDateTimeToIso(revisionEffectiveDate, revisionEffectiveTime, revisionSiteTimezone);
      if (!effectiveFrom) { toast.error(t('items.revisionEffectiveDateTimeInvalid')); return; }
      await postResource(`items/${revisionTarget.item.master_id}/revisions`, {
        name: revisionName,
        base_uom_id: revisionUomId,
        material_group_id: materialGroupId,
        effective_from: effectiveFrom,
        change_reason: revisionChangeReason,
      }, user);
      toast.success(t('items.revisionCreated'));
      setRevisionTarget(null);
      setSelectedItem(null);
      await fetchItems();
    } catch (err: any) {
      toast.error(t('items.revisionError', { message: revisionErrorMessage(t, err) }));
    } finally {
      setSubmitting(false);
    }
  };

  const deactivateItem = async (item: any) => {
    try { await putResource('items', item.master_id, { lifecycle_status: 'Inactive' }, user); toast.success(t('common.save')); setSelectedItem(null); await fetchItems(); }
    catch (error: any) { toast.error(error.message); }
  };

  const handleReleaseRevision = async (revId: string) => {
    setSubmitting(true);
    try {
      await releaseResource('item-revisions', revId, user);
      toast.success(t('items.releasedRevision'));
      await fetchItems();
    } catch (err: any) {
      toast.error(t('items.releaseError', { message: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  const itemRows = items.map((item) => {
    const itemId = item.master_id || item.item_id;
    const itemRevisions = revisions.filter((revision) => revision.item_id === itemId);
    return { item, itemId, itemRevisions, revisionToRelease: itemRevisions.find(isReleasableRevision), currentRevision: latestRevision(itemRevisions) };
  });
  const columns: BaseDataTableColumn<any>[] = [
    { accessorKey: 'item.code', header: t('items.itemCode'), cell: ({ row }) => <span className="font-mono font-bold text-amber-300">{row.original.item.code || row.original.item.item_code || '-'}</span> },
    { accessorKey: 'item.name', header: t('items.itemName'), cell: ({ row }) => <span className="font-medium text-foreground">{text(row.original.item.name) || row.original.item.item_name || '-'}</span> },
    { id: 'itemType', header: t('items.itemType'), cell: ({ row }) => <span className="rounded-md border border-border bg-surface-subtle px-2.5 py-1 text-xs font-mono">{itemTypeLabel(row.original.item.item_type)}</span> },
    { accessorKey: 'item.item_group', header: t('items.itemGroup'), cell: ({ row }) => { const group = materialGroups.find((item) => item.master_id === row.original.item.material_group_id); return group ? `${text(group.name)} (${group.code})` : row.original.item.item_group || '-'; } },
    { id: 'uom', header: t('items.uom'), cell: ({ row }) => uomLabel(uoms.find((u) => u.master_id === row.original.item.base_uom_id), text, row.original.item.uom_code || t('common.notAvailable')) },
    { id: 'releaseStatus', header: t('items.releaseStatus'), cell: ({ row }) => <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-amber-200"><CheckCircle2 className="h-3.5 w-3.5" />{translatedEnum(t, 'status.master', row.original.currentRevision?.lifecycle_status || row.original.item.lifecycle_status || 'Draft')} · {t(`items.temporal.${row.original.currentRevision?.temporal_status || 'Current'}`)}</span> },
    { id: 'actions', header: t('common.actions'), enableSorting: false, cell: ({ row }) => <div className="text-right"><Button type="button" onClick={(event) => { event.stopPropagation(); row.original.revisionToRelease ? handleReleaseRevision(row.original.revisionToRelease.master_id) : toast.error(t('items.noRevision')); }} disabled={submitting || !row.original.revisionToRelease} variant="secondary" size="sm">{t('items.releaseRevision')}</Button></div> },
  ];

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchItems} />;

  return (
    <div className="mes-page">
      <div className="mes-page-header">
        <div className="flex items-center space-x-3">
          <div className="mes-icon-tile">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('items.title')}</h1>
            <p className="text-xs text-slate-400">{t('items.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button onClick={fetchItems} variant="secondary" size="icon">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => { setItemCode(generateCodePreview('ITEM')); setItemName(emptyLocalized()); setMaterialGroupId(materialGroups[0]?.master_id || ''); setBaseUomId(''); setShowCreateModal(true); }}
          >
            <Plus className="w-4 h-4" />
            <span>{t('items.create')}</span>
          </Button>
        </div>
      </div>

      <BaseDataTable data={itemRows} columns={columns} loading={loading} getRowId={(row) => row.itemId} onRowClick={(row) => setSelectedItem({ item: row.item, revisions: row.itemRevisions })} stickyHeader />

      {/* Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <Card className="max-w-2xl w-full">
          <form onSubmit={handleCreateItem} className="p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-100">{t('items.create')}</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">{t('items.itemCode')} *</label>
              <input readOnly required value={itemCode} className="w-full cursor-not-allowed rounded-md border border-slate-700 bg-slate-950/60 p-3 font-mono text-amber-300" />
              <p className="mt-1 text-xs text-slate-400">{t('items.codePreviewHelp')}</p>
            </div>
            <LocalizedTextFields label={t('items.itemName')} value={itemName} onChange={setItemName} required />
            <SelectBase label={t('items.itemGroup')} required value={materialGroupId} onValueChange={setMaterialGroupId} placeholder={t('items.itemGroup')} options={materialGroups.map((group) => ({ value: group.master_id, label: text(group.name), secondaryLabel: group.code }))} />
            <fieldset className="space-y-3 rounded-md border border-border bg-surface-subtle p-4"><legend className="px-1 text-sm font-semibold text-foreground">{t('items.baseUom')} *</legend><p className="text-xs text-muted-foreground">{t('items.uomHint')}</p><UomSelector uoms={uoms} value={baseUomId} onValueChange={setBaseUomId} placeholder={t('items.baseUom')} /></fieldset>
            <div>
              <div className="mb-1 flex items-center gap-2"><label className="block text-xs font-semibold text-slate-300 uppercase">{t('items.itemType')}</label><InfoTooltip label={t('items.itemTypeHelp')} content={t(`item.typeDescription.${itemType}`)} /></div>
              <SelectBase
                value={itemType}
                onValueChange={setItemType}
                options={ITEM_TYPES.map((type) => ({ value: type, label: itemTypeLabel(type) }))}
              />
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <Button
                type="button"
                onClick={() => setShowCreateModal(false)}
                variant="secondary"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{t('common.save')}</span>
              </Button>
            </div>
          </form>
          </Card>
        </div>
      )}
      {selectedItem && (() => { const currentRevision = latestRevision(selectedItem.revisions); const canEdit = currentRevision?.lifecycle_status !== 'Released' && selectedItem.item.lifecycle_status !== 'Inactive'; return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true"><Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto"><div className="flex items-start justify-between border-b border-border p-5"><div><h2 className="text-xl font-bold text-foreground">{selectedItem.item.code}</h2><p className="text-sm text-muted-foreground">{text(selectedItem.item.name)}</p></div><button type="button" onClick={() => setSelectedItem(null)} aria-label={t('common.close')} className="rounded-md p-2 hover:bg-hover"><X className="h-5 w-5" /></button></div><div className="grid gap-3 p-5 sm:grid-cols-4"><div><div className="text-xs uppercase text-muted-foreground">{t('items.itemType')}</div><div className="font-semibold">{itemTypeLabel(selectedItem.item.item_type)}</div></div><div><div className="text-xs uppercase text-muted-foreground">{t('items.itemGroup')}</div><div className="font-semibold">{selectedItem.item.item_group || 'General'}</div></div><div><div className="text-xs uppercase text-muted-foreground">{t('items.uom')}</div><div className="font-semibold">{uomLabel(uoms.find((u) => u.master_id === selectedItem.item.base_uom_id), text, selectedItem.item.uom_code || t('common.notAvailable'))}</div></div><div><div className="text-xs uppercase text-muted-foreground">{t('common.status')}</div><div className="font-semibold">{translatedEnum(t, 'status.master', selectedItem.item.lifecycle_status || 'Draft')}</div></div></div><div className="flex flex-wrap gap-2 border-t border-border p-5"><Button variant="secondary" disabled={!canEdit} onClick={() => { setEditingItem(selectedItem.item); setItemCode(selectedItem.item.code); setItemName(selectedItem.item.name || emptyLocalized()); setItemType(selectedItem.item.item_type); setItemGroup(selectedItem.item.item_group || 'General'); setBaseUomId(selectedItem.item.base_uom_id || ''); }}>{t('common.edit')}</Button>{currentRevision?.lifecycle_status === 'Released' && <Button variant="secondary" onClick={() => openNewRevision(selectedItem.item, currentRevision)}>{t('items.newRevision')}</Button>}<Button variant="secondary" disabled={selectedItem.item.lifecycle_status === 'Inactive'} onClick={() => setDeactivateTarget(selectedItem.item)}>{t('common.deactivate')}</Button></div><div className="space-y-3 border-t border-border p-5"><h3 className="font-bold text-foreground">{t('items.revisions')}</h3>{selectedItem.revisions.length ? selectedItem.revisions.map((revision: any) => <div key={revision.master_id} className="rounded-md border border-border bg-surface-subtle p-4"><RevisionIdentity revision={revision} t={t} hasProductionConfiguration={Boolean(revision.has_production_configuration)} /><div className="mt-2 text-sm text-muted-foreground">{text(revision.name || revision.item_name) || t('common.notAvailable')}</div>{revision.lifecycle_status === 'Released' && <div className="mt-1 text-xs text-emerald-600">{t('items.revisionReady')}</div>}</div>) : <p className="text-sm text-muted-foreground">{t('common.notAvailable')}</p>}</div></Card></div>; })()}
      {editingItem && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4"><Card className="w-full max-w-xl"><form onSubmit={handleEditItem} className="space-y-4 p-6"><h3 className="text-lg font-bold text-foreground">{t('common.edit')} {editingItem.code}</h3><LocalizedTextFields label={t('items.itemName')} value={itemName} onChange={setItemName} required /><SelectBase label={t('items.itemGroup')} required value={materialGroupId} onValueChange={setMaterialGroupId} options={materialGroups.map((group) => ({ value: group.master_id, label: text(group.name), secondaryLabel: group.code }))} /><fieldset className="space-y-3 rounded-md border border-border bg-surface-subtle p-4"><legend className="px-1 text-sm font-semibold text-foreground">{t('items.baseUom')} *</legend><UomSelector uoms={uoms} value={baseUomId} onValueChange={setBaseUomId} placeholder={t('items.baseUom')} /></fieldset><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditingItem(null)}>{t('common.cancel')}</Button><Button type="submit" disabled={submitting}>{t('common.save')}</Button></div></form></Card></div>}
      {revisionTarget && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4"><Card className="w-full max-w-2xl"><form onSubmit={handleCreateRevision} className="space-y-4 p-6"><h3 className="text-lg font-bold text-foreground">{t('items.newRevision')} {revisionTarget.item.code}</h3><p className="text-sm text-muted-foreground">{t('items.newRevisionHelp')}</p><LocalizedTextFields label={t('items.itemName')} value={revisionName} onChange={setRevisionName} required /><SelectBase label={t('items.itemGroup')} required value={materialGroupId} onValueChange={setMaterialGroupId} options={materialGroups.map((group) => ({ value: group.master_id, label: text(group.name), secondaryLabel: group.code }))} /><label className="block space-y-1 text-sm"><span>{t('items.baseUom')} *</span><UomSelector uoms={uoms} value={revisionUomId} onValueChange={setRevisionUomId} placeholder={t('items.baseUom')} /></label><EffectiveDateTimePicker date={revisionEffectiveDate} time={revisionEffectiveTime} timeZone={revisionSiteTimezone} onDateChange={setRevisionEffectiveDate} onTimeChange={setRevisionEffectiveTime} labels={{ date: t('items.effectiveFromDate'), time: t('items.effectiveFromTime') }} /><label className="block space-y-1 text-sm"><span>{t('items.changeReason')} *</span><input required value={revisionChangeReason} onChange={(event) => setRevisionChangeReason(event.target.value)} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /></label><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setRevisionTarget(null)}>{t('common.cancel')}</Button><Button type="submit" disabled={submitting}>{t('common.save')}</Button></div></form></Card></div>}
      <Confirmation open={Boolean(deactivateTarget)} title={t('common.deactivate')} description={deactivateTarget ? `${t('common.confirm')} ${deactivateTarget.code}?` : ''} confirmLabel={t('common.deactivate')} cancelLabel={t('common.cancel')} destructive onClose={() => setDeactivateTarget(null)} onConfirm={() => { const target = deactivateTarget; setDeactivateTarget(null); if (target) void deactivateItem(target); }} />
    </div>
  );
};
