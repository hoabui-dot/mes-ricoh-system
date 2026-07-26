import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, SelectBase } from '../../components/ui';
import { fetchResource, postResource, putResource } from '../../lib/masterDataApi';
import { toast } from 'sonner';

export const ProductionVersionCrudScreen: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [revisions, setRevisions] = useState<any[]>([]);
  const [mboms, setMboms] = useState<any[]>([]);
  const [routings, setRoutings] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ item_revision_id: '', mbom_header_id: '', routing_header_id: '', site_id: '', is_default: false });

  useEffect(() => {
    void Promise.all([
      fetchResource('item-revisions', user, '?limit=500'),
      Promise.resolve([]),
      Promise.resolve([]),
      fetchResource('sites', user),
      id ? fetchResource('production-versions', user, '?limit=500') : Promise.resolve([]),
    ]).then(([revisionRows, mbomRows, routingRows, siteRows, pvRows]) => {
      setRevisions(revisionRows); setMboms(mbomRows); setRoutings(routingRows); setSites(siteRows);
      const current = pvRows.find((row: any) => row.master_id === id);
      if (current) setForm({ item_revision_id: current.item_revision_id, mbom_header_id: current.mbom_header_id, routing_header_id: current.routing_header_id, site_id: current.site_id, is_default: Boolean(current.is_default) });
      else setForm((value) => ({ ...value, item_revision_id: value.item_revision_id || revisionRows[0]?.master_id || '', site_id: value.site_id || siteRows[0]?.master_id || '' }));
    }).catch((error) => toast.error(error.message));
  }, [id, user?.userId]);

  useEffect(() => {
    if (!form.item_revision_id || !form.site_id) return;
    const query = `?limit=500&item_revision_id=${encodeURIComponent(form.item_revision_id)}&site_id=${encodeURIComponent(form.site_id)}&lifecycle_status=Released`;
    void Promise.all([fetchResource('mbom-headers', user, query), fetchResource('routing-headers', user, query)])
      .then(([mbomRows, routingRows]) => { setMboms(mbomRows); setRoutings(routingRows); })
      .catch((error) => toast.error(error.message));
  }, [form.item_revision_id, form.site_id, user?.userId]);

  const matchingMboms = useMemo(() => mboms.filter((row) => row.lifecycle_status === 'Released' && row.item_revision_id === form.item_revision_id && row.site_id === form.site_id), [mboms, form.item_revision_id, form.site_id]);
  const matchingRoutings = useMemo(() => routings.filter((row) => row.lifecycle_status === 'Released' && row.item_revision_id === form.item_revision_id && row.site_id === form.site_id), [routings, form.item_revision_id, form.site_id]);
  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value, ...(key === 'item_revision_id' ? { mbom_header_id: '', routing_header_id: '' } : {}) }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      if (id) await putResource('production-versions', id, form, user);
      else await postResource('production-versions', form, user);
      toast.success(t('common.save')); navigate('/master-data/production-versions');
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-6"><Button variant="secondary" onClick={() => navigate('/master-data/production-versions')}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button><div className="mes-page-header"><h1 className="text-xl font-bold text-foreground">{id ? 'Edit Production Version' : 'Create Production Version'}</h1><p className="text-sm text-muted-foreground">Released MBOM and Routing must match the selected Item Revision and Site.</p></div><form onSubmit={submit} className="space-y-5 rounded-md border border-border bg-surface p-6"><label className="space-y-1"><span className="text-sm text-foreground">Item Revision *</span><SelectBase required value={form.item_revision_id} onValueChange={(value) => update('item_revision_id', value)} options={revisions.filter((row) => ['Released', 'InReview', 'Draft'].includes(row.lifecycle_status)).map((row) => ({ value: row.master_id, label: `${row.code} — ${row.revision_code || ''}` }))} aria-label="Item Revision" /></label><label className="space-y-1"><span className="text-sm text-foreground">Site *</span><SelectBase required value={form.site_id} onValueChange={(value) => update('site_id', value)} options={sites.map((row) => ({ value: row.master_id, label: row.code }))} aria-label="Site" /></label><label className="space-y-1"><span className="text-sm text-foreground">Released MBOM *</span><SelectBase required value={form.mbom_header_id} onValueChange={(value) => update('mbom_header_id', value)} options={matchingMboms.map((row) => ({ value: row.master_id, label: `${row.code} — ${row.name?.vi || row.name?.en || ''}` }))} aria-label="MBOM" /></label><label className="space-y-1"><span className="text-sm text-foreground">Released Routing *</span><SelectBase required value={form.routing_header_id} onValueChange={(value) => update('routing_header_id', value)} options={matchingRoutings.map((row) => ({ value: row.master_id, label: `${row.code} — ${row.name?.vi || row.name?.en || ''}` }))} aria-label="Routing" /></label><label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.is_default} onChange={(event) => update('is_default', event.target.checked)} />Default production configuration</label><div className="flex justify-end"><Button type="submit" disabled={saving || !form.mbom_header_id || !form.routing_header_id}><Save className="h-4 w-4" />{t('common.save')}</Button></div></form></div>;
};
