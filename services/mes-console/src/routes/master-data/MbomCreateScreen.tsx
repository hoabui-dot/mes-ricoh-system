import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { Button, SelectBase } from '../../components/ui';
import { fetchResource, postResource } from '../../lib/masterDataApi';
import { generateCodePreview } from '../../lib/codePreview';
import { toast } from 'sonner';

export const MbomCreateScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [revisions, setRevisions] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: generateCodePreview('MBOM'), name: emptyLocalized(), description: emptyLocalized(),
    item_revision_id: '', site_id: '', business_version: '1', purpose: 'Standard', base_quantity: '100',
    base_uom_id: '', effective_from: '2026-08-01', effective_to: '', change_reason: emptyLocalized(),
    engineering_note: emptyLocalized(), reference_document: '',
  });

  useEffect(() => {
    void Promise.all([fetchResource('item-revisions', user, '?limit=500'), fetchResource('sites', user), fetchResource('uoms', user)])
      .then(([revisionRows, siteRows, uomRows]) => {
        setRevisions(revisionRows);
        setSites(siteRows);
        setUoms(uomRows);
        setForm((current) => ({ ...current, item_revision_id: current.item_revision_id || revisionRows[0]?.master_id || '', site_id: current.site_id || siteRows[0]?.master_id || '', base_uom_id: current.base_uom_id || uomRows[0]?.master_id || '' }));
      }).catch((error) => toast.error(error.message));
  }, [user?.userId]);

  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await postResource('mbom-headers', { ...form, effective_to: form.effective_to || null }, user);
      const id = created.master_id || created.data?.master_id;
      toast.success(t('mbom.createSuccess'));
      navigate(`/master-data/mboms/${id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex items-center justify-between"><Button variant="secondary" onClick={() => navigate('/master-data/mboms')}><ArrowLeft className="h-4 w-4" />{t('mbom.backToList')}</Button></div>
    <div className="mes-page-header"><div><h1 className="text-xl font-bold text-slate-100">{t('mbom.create')}</h1><p className="text-sm text-slate-400">{t('mbom.createSubtitle')}</p></div></div>
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-base font-bold text-slate-100">{t('mbom.section.basic')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.code')} *</span><input readOnly required value={form.code} className="w-full cursor-not-allowed rounded-md border border-slate-700 bg-slate-950/60 p-3 font-mono text-amber-300" /><span className="text-xs text-slate-400">{t('mbom.codePreviewHelp')}</span></label>
          <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.productRevision')} *</span><SelectBase required value={form.item_revision_id} onValueChange={(value) => update('item_revision_id', value)} options={revisions.map((row) => ({ value: row.master_id, label: row.code }))} aria-label={t('mbom.productRevision')} /></label>
          <label className="space-y-1"><span className="text-sm text-slate-300">{t('common.site')} *</span><SelectBase required value={form.site_id} onValueChange={(value) => update('site_id', value)} options={sites.map((row) => ({ value: row.master_id, label: row.code }))} aria-label={t('common.site')} /></label>
          <LocalizedTextFields label={t('mbom.name')} value={form.name} onChange={(value: LocalizedValues) => update('name', value)} required />
          <LocalizedTextFields label={t('mbom.description')} value={form.description} onChange={(value: LocalizedValues) => update('description', value)} multiline />
        </div>
      </section>
      <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900 p-6"><h2 className="text-base font-bold text-slate-100">{t('mbom.section.quantity')}</h2><div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.base')} *</span><input required type="number" min="0.000001" value={form.base_quantity} onChange={(e) => update('base_quantity', e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100" /></label>
        <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.baseUom')} *</span><SelectBase required value={form.base_uom_id} onValueChange={(value) => update('base_uom_id', value)} options={uoms.map((row) => ({ value: row.master_id, label: row.code }))} aria-label={t('mbom.baseUom')} /></label>
        <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.purpose')} *</span><SelectBase required value={form.purpose} onValueChange={(value) => update('purpose', value)} options={['Standard', 'Alternate', 'Prototype', 'Rework'].map((value) => ({ value, label: value }))} aria-label={t('mbom.purpose')} /></label>
      </div></section>
      <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900 p-6"><h2 className="text-base font-bold text-slate-100">{t('mbom.section.engineering')}</h2><div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.validFrom')} *</span><input required type="date" value={form.effective_from} onChange={(e) => update('effective_from', e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100" /></label>
        <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.validTo')}</span><input type="date" value={form.effective_to} onChange={(e) => update('effective_to', e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100" /></label>
        <LocalizedTextFields label={t('mbom.changeReason')} value={form.change_reason} onChange={(value: LocalizedValues) => update('change_reason', value)} multiline />
        <LocalizedTextFields label={t('mbom.engineeringNote')} value={form.engineering_note} onChange={(value: LocalizedValues) => update('engineering_note', value)} multiline />
        <label className="space-y-1 sm:col-span-2"><span className="text-sm text-slate-300">{t('mbom.referenceDocument')}</span><input value={form.reference_document} onChange={(e) => update('reference_document', e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100" /></label>
      </div></section>
      <div className="flex justify-end"><Button type="submit" disabled={saving}><Save className="h-4 w-4" />{t('common.create')}</Button></div>
    </form>
  </div>;
};
