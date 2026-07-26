import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Package, Plus, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { Button, Card, Confirmation, SelectBase, InfoTooltip } from '../../components/ui';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { generateCodePreview } from '../../lib/codePreview';
import { normalizeStatusCode, translatedEnum } from '../../lib/i18nLabels';
import { fetchResource, postResource, putResource, releaseResource, gatewayBaseUrl } from '../../lib/masterDataApi';
import { RevisionIdentity } from '../../components/RevisionIdentity';

const ITEM_TYPES = ['FG', 'SFG', 'RM'] as const;
const RELEASABLE_REVISION_STATUSES = new Set(['Draft', 'InReview', 'Inactive']);

function isReleasableRevision(revision: any) {
  return RELEASABLE_REVISION_STATUSES.has(normalizeStatusCode(revision.lifecycle_status || revision.status || 'Draft'));
}

export const ItemsScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const [items, setItems] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState<LocalizedValues>(emptyLocalized());
  const [itemType, setItemType] = useState('FG');
  const [submitting, setSubmitting] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [baseUomId, setBaseUomId] = useState('');
  const [uomName, setUomName] = useState('');
  const [uomCode, setUomCode] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null);
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
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const selectedUom = uoms.find((uom) => uom.master_id === baseUomId);
  const ensureBaseUom = async () => {
    const code = uomCode.trim().toUpperCase();
    const name = uomName.trim();
    if (!code || !name) throw new Error(t('items.uomRequired'));
    const existing = uoms.find((uom) => String(uom.code || '').toUpperCase() === code);
    if (existing) return existing.master_id;
    const created = await postResource('uoms', { code, name, uom_class: 'Quantity', decimal_precision: 3 }, user);
    const id = created.master_id || created.data?.master_id;
    if (!id) throw new Error(t('items.uomCreateFailed'));
    return id;
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCode || !itemName.vi.trim() || !uomCode.trim() || !uomName.trim()) {
      toast.error(t('items.required'));
      return;
    }
    setSubmitting(true);
    try {
      const resolvedUomId = await ensureBaseUom();
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/master-data/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles?.[0] || 'PROD_MANAGER',
        },
        body: JSON.stringify({ code: itemCode, name: itemName, item_type: itemType, base_uom_id: resolvedUomId }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || t('items.createFailed'));
      }
      toast.success(t('items.created', { code: itemCode }));
      setShowCreateModal(false);
      setItemCode('');
      setItemName(emptyLocalized());
      setUomCode('');
      setUomName('');
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
      const resolvedUomId = await ensureBaseUom();
      await putResource('items', editingItem.master_id, { name: itemName, item_type: itemType, base_uom_id: resolvedUomId }, user);
      toast.success(t('common.save')); setEditingItem(null); setSelectedItem(null); await fetchItems();
    } catch (error: any) { toast.error(error.message); } finally { setSubmitting(false); }
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
            onClick={() => { setItemCode(generateCodePreview('ITEM')); setItemName(emptyLocalized()); setBaseUomId(''); setUomCode(''); setUomName(''); setShowCreateModal(true); }}
          >
            <Plus className="w-4 h-4" />
            <span>{t('items.create')}</span>
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="mes-table-wrap">
        <table className="mes-table">
          <thead>
            <tr>
              <th className="px-6 py-4">{t('items.itemCode')}</th>
              <th className="px-6 py-4">{t('items.itemName')}</th>
              <th className="px-6 py-4">{t('items.itemType')}</th>
              <th className="px-6 py-4">{t('items.uom')}</th>
              <th className="px-6 py-4">{t('items.releaseStatus')}</th>
              <th className="px-6 py-4 text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {items.map((item) => {
              const itemId = item.master_id || item.item_id;
              const itemRevisions = revisions.filter((revision) => revision.item_id === itemId);
              const revisionToRelease = itemRevisions.find(isReleasableRevision);
              const currentRevision = itemRevisions.find((revision) => revision.is_default) || itemRevisions[0];
              return (
              <tr key={itemId} onClick={() => setSelectedItem({ item, revisions: itemRevisions })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedItem({ item, revisions: itemRevisions }); }} tabIndex={0} className="cursor-pointer hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-amber-300">{item.code || item.item_code || '-'}</td>
                <td className="px-6 py-4 text-slate-100 font-medium">{text(item.name) || item.item_name || '-'}</td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-slate-300">
                    {itemTypeLabel(item.item_type)}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-400">{selectedUom?.master_id === item.base_uom_id ? `${selectedUom.name} (${selectedUom.code})` : uoms.find((u) => u.master_id === item.base_uom_id) ? `${uoms.find((u) => u.master_id === item.base_uom_id).name} (${uoms.find((u) => u.master_id === item.base_uom_id).code})` : item.uom || t('uom.pcs')}</td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-800 text-amber-200 rounded-full text-xs font-semibold flex items-center space-x-1 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{translatedEnum(t, 'status.master', currentRevision?.lifecycle_status || item.lifecycle_status || 'Draft')}</span>
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button
                    onClick={(event) => { event.stopPropagation(); revisionToRelease ? handleReleaseRevision(revisionToRelease.master_id) : toast.error(t('items.noRevision')); }}
                    disabled={submitting || !revisionToRelease}
                    variant="secondary"
                    size="sm"
                  >
                    {t('items.releaseRevision')}
                  </Button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
            <fieldset className="space-y-3 rounded-md border border-border bg-surface-subtle p-4"><legend className="px-1 text-sm font-semibold text-foreground">{t('items.baseUom')} *</legend><p className="text-xs text-muted-foreground">{t('items.uomHint')}</p><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs font-semibold uppercase text-muted-foreground">{t('items.uomName')}</span><input required value={uomName} onChange={(event) => setUomName(event.target.value)} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /></label><label className="space-y-1"><span className="text-xs font-semibold uppercase text-muted-foreground">{t('items.uomSign')}</span><input required value={uomCode} onChange={(event) => setUomCode(event.target.value.toUpperCase())} maxLength={20} className="w-full rounded-md border border-border bg-background p-3 font-mono uppercase text-foreground" /></label></div>{selectedUom && <div className="text-xs text-muted-foreground">{t('items.uomExisting')}: {selectedUom.name} ({selectedUom.code})</div>}</fieldset>
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
      {selectedItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true"><Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto"><div className="flex items-start justify-between border-b border-border p-5"><div><h2 className="text-xl font-bold text-foreground">{selectedItem.item.code}</h2><p className="text-sm text-muted-foreground">{text(selectedItem.item.name)}</p></div><button type="button" onClick={() => setSelectedItem(null)} aria-label={t('common.close')} className="rounded-md p-2 hover:bg-hover"><X className="h-5 w-5" /></button></div><div className="grid gap-3 p-5 sm:grid-cols-3"><div><div className="text-xs uppercase text-muted-foreground">{t('items.itemType')}</div><div className="font-semibold">{itemTypeLabel(selectedItem.item.item_type)}</div></div><div><div className="text-xs uppercase text-muted-foreground">{t('items.uom')}</div><div className="font-semibold">{uoms.find((u) => u.master_id === selectedItem.item.base_uom_id) ? `${uoms.find((u) => u.master_id === selectedItem.item.base_uom_id).name} (${uoms.find((u) => u.master_id === selectedItem.item.base_uom_id).code})` : t('uom.pcs')}</div></div><div><div className="text-xs uppercase text-muted-foreground">{t('common.status')}</div><div className="font-semibold">{translatedEnum(t, 'status.master', selectedItem.item.lifecycle_status || 'Draft')}</div></div></div><div className="flex gap-2 border-t border-border p-5"><Button variant="secondary" disabled={selectedItem.item.lifecycle_status !== 'Draft'} onClick={() => { const itemUom = uoms.find((u) => u.master_id === selectedItem.item.base_uom_id); setEditingItem(selectedItem.item); setItemCode(selectedItem.item.code); setItemName(selectedItem.item.name || emptyLocalized()); setItemType(selectedItem.item.item_type); setBaseUomId(selectedItem.item.base_uom_id || ''); setUomCode(itemUom?.code || ''); setUomName(itemUom?.name || ''); }}>{t('common.edit')}</Button><Button variant="secondary" onClick={() => setDeactivateTarget(selectedItem.item)}>{t('common.deactivate')}</Button></div><div className="space-y-3 border-t border-border p-5"><h3 className="font-bold text-foreground">{t('items.revisions')}</h3>{selectedItem.revisions.length ? selectedItem.revisions.map((revision: any) => <div key={revision.master_id} className="rounded-md border border-border bg-surface-subtle p-4"><RevisionIdentity revision={revision} t={t} hasProductionConfiguration={Boolean(revision.has_production_configuration)} /><div className="mt-2 text-sm text-muted-foreground">{text(revision.name || revision.item_name) || t('common.notAvailable')}</div></div>) : <p className="text-sm text-muted-foreground">{t('common.notAvailable')}</p>}</div></Card></div>}
      {editingItem && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4"><Card className="w-full max-w-xl"><form onSubmit={handleEditItem} className="space-y-4 p-6"><h3 className="text-lg font-bold text-foreground">{t('common.edit')} {editingItem.code}</h3><LocalizedTextFields label={t('items.itemName')} value={itemName} onChange={setItemName} required /><fieldset className="space-y-3 rounded-md border border-border bg-surface-subtle p-4"><legend className="px-1 text-sm font-semibold text-foreground">{t('items.baseUom')} *</legend><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs uppercase text-muted-foreground">{t('items.uomName')}</span><input required value={uomName} onChange={(event) => setUomName(event.target.value)} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /></label><label className="space-y-1"><span className="text-xs uppercase text-muted-foreground">{t('items.uomSign')}</span><input required value={uomCode} onChange={(event) => setUomCode(event.target.value.toUpperCase())} className="w-full rounded-md border border-border bg-background p-3 font-mono uppercase text-foreground" /></label></div></fieldset><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditingItem(null)}>{t('common.cancel')}</Button><Button type="submit" disabled={submitting}>{t('common.save')}</Button></div></form></Card></div>}
      <Confirmation open={Boolean(deactivateTarget)} title={t('common.deactivate')} description={deactivateTarget ? `${t('common.confirm')} ${deactivateTarget.code}?` : ''} confirmLabel={t('common.deactivate')} cancelLabel={t('common.cancel')} destructive onClose={() => setDeactivateTarget(null)} onConfirm={() => { const target = deactivateTarget; setDeactivateTarget(null); if (target) void deactivateItem(target); }} />
    </div>
  );
};
