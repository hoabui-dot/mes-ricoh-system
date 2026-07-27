import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, SelectBase } from '../../components/ui';
import { fetchResource, postResource, putResource } from '../../lib/masterDataApi';
import { toast } from 'sonner';

function localizedText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  return String(item.vi || item.en || item.ja || item.ko || '');
}

export const ProductionVersionCrudScreen: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [revisions, setRevisions] = useState<any[]>([]);
  const [mboms, setMboms] = useState<any[]>([]);
  const [routings, setRoutings] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ item_revision_id: '', mbom_header_id: '', routing_header_id: '', is_default: false });

  useEffect(() => {
    void Promise.all([
      fetchResource('item-revisions', user, '?limit=500'),
      fetchResource('mbom-headers', user, `?limit=500&lifecycle_status=Released&_=${Date.now()}`),
      fetchResource('routing-headers', user, `?limit=500&lifecycle_status=Released&_=${Date.now()}`),
      id ? fetchResource('production-versions', user, '?limit=500') : Promise.resolve([]),
    ]).then(([revisionRows, mbomRows, routingRows, pvRows]) => {
      setRevisions(revisionRows); setMboms(mbomRows); setRoutings(routingRows);
      const current = pvRows.find((row: any) => row.master_id === id);
      if (current) setForm({ item_revision_id: current.item_revision_id, mbom_header_id: current.mbom_header_id, routing_header_id: current.routing_header_id, is_default: Boolean(current.is_default) });
      else {
        setForm((value) => ({ ...value, item_revision_id: value.item_revision_id || revisionRows[0]?.master_id || '', mbom_header_id: value.mbom_header_id || mbomRows[0]?.master_id || '', routing_header_id: value.routing_header_id || routingRows[0]?.master_id || '' }));
      }
    }).catch((error) => toast.error(error.message));
  }, [id, user?.userId]);

  const matchingMboms = useMemo(() => mboms, [mboms]);
  const matchingRoutings = useMemo(() => routings.filter((row) => row.lifecycle_status === 'Released'), [routings]);
  const update = (key: string, value: unknown) => setForm((current) => {
    if (key === 'item_revision_id') {
      return { ...current, item_revision_id: String(value) };
    }
    if (key === 'mbom_header_id') {
      return { ...current, mbom_header_id: String(value) };
    }
    return { ...current, [key]: value };
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      if (id) await putResource('production-versions', id, form, user);
      else await postResource('production-versions', form, user);
      toast.success(t('common.save')); navigate('/master-data/production-versions');
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-6"><Button variant="secondary" onClick={() => navigate('/master-data/production-versions')}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button><div className="mes-page-header"><h1 className="text-xl font-bold text-foreground">{t(id ? 'productionVersion.edit' : 'productionVersion.create')}</h1><p className="text-sm text-muted-foreground">{t('productionVersion.formHelp')}</p></div><form onSubmit={submit} className="space-y-5 rounded-md border border-border bg-surface p-6"><label className="space-y-1"><span className="text-sm text-foreground">{t('productionVersion.itemRevision')} *</span><SelectBase required value={form.item_revision_id} onValueChange={(value) => update('item_revision_id', value)} options={revisions.filter((row) => ['Released', 'InReview', 'Draft'].includes(row.lifecycle_status)).map((row) => ({ value: row.master_id, label: localizedText(row.name) || localizedText(row.item_name) || row.revision_code || row.code, secondaryLabel: row.revision_code || row.code }))} aria-label={t('productionVersion.itemRevision')} /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('productionVersion.releasedMbom')} *</span><SelectBase required value={form.mbom_header_id} onValueChange={(value) => update('mbom_header_id', value)} options={matchingMboms.map((row) => ({ value: row.master_id, label: localizedText(row.name) || row.code, secondaryLabel: row.code }))} placeholder={t('productionVersion.selectMbom')} aria-label={t('productionVersion.releasedMbom')} /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('productionVersion.releasedRouting')} *</span><SelectBase required value={form.routing_header_id} onValueChange={(value) => update('routing_header_id', value)} options={matchingRoutings.map((row) => ({ value: row.master_id, label: localizedText(row.name) || row.code, secondaryLabel: row.code }))} placeholder={t('productionVersion.selectRouting')} aria-label={t('productionVersion.releasedRouting')} /></label>{matchingMboms.length === 0 && <p className="text-sm text-amber-400">{t('productionVersion.noMatchingMbom')}</p>}<label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.is_default} onChange={(event) => update('is_default', event.target.checked)} />{t('productionVersion.defaultConfiguration')}</label><div className="flex justify-end"><Button type="submit" disabled={saving || !form.mbom_header_id || !form.routing_header_id}><Save className="h-4 w-4" />{t('common.save')}</Button></div></form></div>;
};
