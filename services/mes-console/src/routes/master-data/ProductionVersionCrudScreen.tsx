import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Card, SelectBase } from '../../components/ui';
import { DecimalInput } from '../../components/DecimalInput';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { fetchResource, postResource, putResource } from '../../lib/masterDataApi';
import { formatNumberForDisplay } from '../../lib/numeric/uomNumeric';

function localizedText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  return String(item.vi || item.en || item.ja || item.ko || '');
}

function formatDate(value: unknown, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

type Configuration = Record<string, any>;

function ConfigurationCard({ kind, row, t, navigate, multiple, value, onChange }: { kind: 'ebom' | 'mbom' | 'routing'; row?: Configuration; t: (key: string) => string; navigate: (path: string) => void; multiple: Configuration[]; value: string; onChange: (value: string) => void }) {
  const labels = { ebom: 'EBOM', mbom: 'MBOM', routing: t('productionVersion.routingLink') };
  const route = kind === 'ebom' ? '/master-data/eboms' : kind === 'mbom' ? '/master-data/mboms' : '/master-data/routings';
  return <Card className="space-y-4 border-border bg-surface-subtle p-5">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">{labels[kind]}</h3><p className="text-xs text-muted-foreground">{t(`productionVersion.${kind}OwnershipHelp`)}</p></div>{row && <Button type="button" variant="ghost" size="icon" aria-label={t('common.detail')} title={t('common.detail')} onClick={() => navigate(`${route}/${row.master_id}`)}><ExternalLink className="h-4 w-4" /></Button>}</div>
    {multiple.length > 1 && <SelectBase value={value} onValueChange={onChange} options={multiple.map((item) => ({ value: item.master_id, label: `${localizedText(item.name) || item.code} (${item.code})`, secondaryLabel: `${t('productionVersion.version')} ${item.version_no || item.business_version || '-'} · ${formatDate(item.effective_from, '')}` }))} placeholder={t(`productionVersion.select${kind[0].toUpperCase()}${kind.slice(1)}`)} />}
    {row ? <><div><p className="font-mono font-semibold text-action">{row.code}</p><p className="text-sm text-foreground">{localizedText(row.name) || t('common.notAvailable')}</p></div><div className="grid gap-3 sm:grid-cols-2"><Info label={t('common.status')} value={row.lifecycle_status || t('common.notAvailable')} /><Info label={t('productionVersion.version')} value={formatNumberForDisplay(row.version_no || row.business_version)} /><Info label={t('productionVersion.effectivePeriod')} value={`${formatDate(row.effective_from, t('common.notAvailable'))} → ${formatDate(row.effective_to, t('productionVersion.noEndDate'))}`} />{kind === 'mbom' && <><Info label={t('common.site')} value={row.site_code || t('common.notAvailable')} /><Info label={t('productionVersion.baseQuantity')} value={`${formatNumberForDisplay(row.base_quantity)} ${row.base_uom_code || ''}`} /></>}{kind === 'routing' && <Info label={t('productionVersion.operationCount')} value={formatNumberForDisplay(row.operation_count)} />}{kind === 'ebom' && <Info label={t('productionVersion.lineCount')} value={formatNumberForDisplay(row.line_count)} />}</div></> : <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t(`productionVersion.no${kind[0].toUpperCase()}${kind.slice(1)}`)}</p>}
  </Card>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium text-foreground">{value}</p></div>; }

export const ProductionVersionCrudScreen: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [mboms, setMboms] = useState<Configuration[]>([]);
  const [routings, setRoutings] = useState<Configuration[]>([]);
  const [eboms, setEboms] = useState<Configuration[]>([]);
  const [itemId, setItemId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const revisionRequestRef = useRef(0);
  const configurationRequestRef = useRef(0);
  const [form, setForm] = useState({ item_revision_id: '', ebom_header_id: '', mbom_header_id: '', routing_header_id: '', is_default: false, name_i18n: emptyLocalized(), min_lot_size: '', max_lot_size: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchResource('items', user, '?limit=500'), id ? fetchResource('production-versions', user, '?limit=500') : Promise.resolve([])])
      .then(([itemRows, pvRows]) => {
        if (cancelled) return;
        setItems(itemRows);
        const current = pvRows.find((row: any) => row.master_id === id);
        if (current) {
          setItemId(String(current.item_id || ''));
          setForm({ item_revision_id: current.item_revision_id, ebom_header_id: current.ebom_header_id || '', mbom_header_id: current.mbom_header_id, routing_header_id: current.routing_header_id, is_default: Boolean(current.is_default), name_i18n: { ...emptyLocalized(), ...(current.name_i18n || {}) }, min_lot_size: current.min_lot_size == null ? '' : String(current.min_lot_size), max_lot_size: current.max_lot_size == null ? '' : String(current.max_lot_size) });
        } else {
          setItemId('');
          setForm({ item_revision_id: '', ebom_header_id: '', mbom_header_id: '', routing_header_id: '', is_default: false, name_i18n: emptyLocalized(), min_lot_size: '', max_lot_size: '' });
        }
      })
      .catch((error) => toast.error(error.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, user?.userId]);

  useEffect(() => {
    const token = ++revisionRequestRef.current;
    setRevisions([]); setMboms([]); setRoutings([]); setEboms([]);
    if (!itemId) { setForm((current) => ({ ...current, item_revision_id: '', ebom_header_id: '', mbom_header_id: '', routing_header_id: '' })); return undefined; }
    const at = new Date().toISOString();
    fetchResource('item-revisions', user, `?limit=500&item_id=${encodeURIComponent(itemId)}&lifecycle_status=Released&effective_at=${encodeURIComponent(at)}`)
      .then((rows) => { if (token !== revisionRequestRef.current) return; setRevisions(rows); })
      .catch((error) => toast.error(error.message));
    return undefined;
  }, [itemId, user?.userId]);

  useEffect(() => {
    const token = ++configurationRequestRef.current;
    if (!form.item_revision_id) return undefined;
    const at = encodeURIComponent(new Date().toISOString());
    Promise.all([
      fetchResource('ebom-headers', user, `?limit=500&item_revision_id=${form.item_revision_id}&lifecycle_status=Released&effective_at=${at}`),
      fetchResource('mbom-headers', user, `?limit=500&item_revision_id=${form.item_revision_id}&lifecycle_status=Released&effective_at=${at}`),
      fetchResource('routing-headers', user, `?limit=500&item_revision_id=${form.item_revision_id}&lifecycle_status=Released&effective_at=${at}`),
    ]).then(([ebomRows, mbomRows, routingRows]) => {
      if (token !== configurationRequestRef.current) return;
      setEboms(ebomRows); setMboms(mbomRows); setRoutings(routingRows);
      setForm((current) => ({ ...current, ebom_header_id: ebomRows.some((row: any) => row.master_id === current.ebom_header_id) ? current.ebom_header_id : ebomRows.length === 1 ? ebomRows[0].master_id : '', mbom_header_id: mbomRows.some((row: any) => row.master_id === current.mbom_header_id) ? current.mbom_header_id : mbomRows.length === 1 ? mbomRows[0].master_id : '', routing_header_id: routingRows.some((row: any) => row.master_id === current.routing_header_id) ? current.routing_header_id : routingRows.length === 1 ? routingRows[0].master_id : '' }));
    }).catch((error) => toast.error(error.message));
    return undefined;
  }, [form.item_revision_id, user?.userId]);

  const selectedRevision = useMemo(() => revisions.find((row) => row.master_id === form.item_revision_id), [revisions, form.item_revision_id]);
  const selectedItem = useMemo(() => items.find((row) => row.master_id === itemId), [items, itemId]);
  const eligibleItems = useMemo(() => items.filter((row) => row.lifecycle_status === 'Released' && ['FG', 'SFG'].includes(String(row.item_type))), [items]);
  const selectedMbom = mboms.find((row) => row.master_id === form.mbom_header_id);
  const selectedRouting = routings.find((row) => row.master_id === form.routing_header_id);
  const selectedEbom = eboms.find((row) => row.master_id === form.ebom_header_id);
  const update = (key: string, value: unknown) => setForm((current) => {
    if (key === 'item_revision_id') return { ...current, item_revision_id: String(value), ebom_header_id: '', mbom_header_id: '', routing_header_id: '' };
    return { ...current, [key]: value };
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      if (!itemId || !form.item_revision_id || !form.mbom_header_id || !form.routing_header_id) throw new Error(t('productionVersion.configurationRequired'));
      const payload = { ...form, min_lot_size: form.min_lot_size === '' ? null : Number(form.min_lot_size), max_lot_size: form.max_lot_size === '' ? null : Number(form.max_lot_size) };
      if (id) await putResource('production-versions', id, payload, user); else await postResource('production-versions', payload, user);
      toast.success(t('common.save')); navigate('/master-data/production-versions');
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-6"><Button variant="secondary" onClick={() => navigate('/master-data/production-versions')}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button><div className="mes-page-header"><h1 className="text-xl font-bold text-foreground">{t(id ? 'productionVersion.edit' : 'productionVersion.create')}</h1><p className="text-sm text-muted-foreground">{t('productionVersion.formHelp')}</p></div><form onSubmit={submit} className="space-y-6 rounded-md border border-border bg-surface p-6">
    <LocalizedTextFields label={t('productionVersion.name')} value={form.name_i18n} onChange={(value: LocalizedValues) => update('name_i18n', value)} required />
    <div className="rounded-md border border-border bg-surface-subtle p-4"><div className="text-sm font-semibold text-foreground">{t('productionVersion.code')}</div><div className="mt-1 font-mono text-action">{id ? t('productionVersion.codeExisting') : t('productionVersion.codeGenerated')}</div></div>
    <div className="grid gap-4 md:grid-cols-2"><label className="space-y-1"><span className="text-sm text-foreground">{t('productionVersion.item')} *</span><SelectBase required value={itemId} onValueChange={(value) => { setItemId(String(value)); update('item_revision_id', ''); }} options={eligibleItems.map((row) => ({ value: row.master_id, label: localizedText(row.name) || row.code, secondaryLabel: row.code }))} placeholder={t('productionVersion.selectItem')} aria-label={t('productionVersion.item')} /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('productionVersion.itemRevision')} *</span><SelectBase required value={form.item_revision_id} onValueChange={(value) => update('item_revision_id', value)} options={revisions.map((row) => ({ value: row.master_id, label: localizedText(row.name) || row.revision_code, secondaryLabel: `${row.revision_code} · ${row.lifecycle_status}` }))} placeholder={t('productionVersion.selectRevision')} aria-label={t('productionVersion.itemRevision')} /></label></div>
    {selectedItem && selectedRevision && <Card className="space-y-4 border-border bg-surface-subtle p-5"><div className="flex items-start justify-between"><div><h3 className="font-semibold text-foreground">{t('productionVersion.itemRevisionCard')}</h3><p className="mt-1 font-medium text-foreground">{localizedText(selectedItem.name) || selectedItem.code}</p><p className="text-xs text-muted-foreground">{selectedItem.code} · {selectedRevision.revision_code}</p></div><Button type="button" variant="ghost" size="icon" aria-label={t('common.detail')} title={t('common.detail')} onClick={() => navigate(`/master-data/items?revision_id=${selectedRevision.master_id}`)}><ExternalLink className="h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label={t('common.status')} value={selectedRevision.lifecycle_status} /><Info label={t('productionVersion.effectiveFrom')} value={formatDate(selectedRevision.effective_from, t('common.notAvailable'))} /><Info label={t('productionVersion.effectiveTo')} value={formatDate(selectedRevision.effective_to, t('productionVersion.noEndDate'))} /><Info label={t('productionVersion.itemRevision')} value={selectedRevision.revision_code} /></div></Card>}
    {form.item_revision_id && <div className="grid gap-4 lg:grid-cols-3"><ConfigurationCard kind="ebom" row={selectedEbom} multiple={eboms} value={form.ebom_header_id} onChange={(value) => update('ebom_header_id', value)} t={t} navigate={navigate} /><ConfigurationCard kind="mbom" row={selectedMbom} multiple={mboms} value={form.mbom_header_id} onChange={(value) => update('mbom_header_id', value)} t={t} navigate={navigate} /><ConfigurationCard kind="routing" row={selectedRouting} multiple={routings} value={form.routing_header_id} onChange={(value) => update('routing_header_id', value)} t={t} navigate={navigate} /></div>}
    <div className="grid gap-4 sm:grid-cols-2"><DecimalInput label={t('productionVersion.minLotSize')} value={form.min_lot_size} min="0" precision={6} onValueChange={(value) => update('min_lot_size', value)} /><DecimalInput label={t('productionVersion.maxLotSize')} value={form.max_lot_size} min="0" precision={6} onValueChange={(value) => update('max_lot_size', value)} /></div><label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.is_default} onChange={(event) => update('is_default', event.target.checked)} />{t('productionVersion.defaultConfiguration')}</label><div className="flex justify-end"><Button type="submit" disabled={loading || saving || !form.name_i18n.vi.trim() || !itemId || !form.item_revision_id || !form.mbom_header_id || !form.routing_header_id}><Save className="h-4 w-4" />{t('common.save')}</Button></div>
  </form></div>;
};
