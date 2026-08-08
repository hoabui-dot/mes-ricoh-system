import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { useAuth } from '../../context/AuthContext';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { uomLabel } from '../../components/UomSelector';
import { UomNumberInput } from '../../components/UomNumberInput';
import { DecimalInput } from '../../components/DecimalInput';
import { ItemRevisionSelector } from '../../components/ItemRevisionSelector';
import { ValidationErrorToast } from '../../components/ValidationErrorToast';
import { SubstituteValidationSummary } from '../../components/SubstituteValidationSummary';
import { Button, FieldHelpPopover, Modal, SelectBase } from '../../components/ui';
import { createMbomAggregate, fetchResource } from '../../lib/masterDataApi';
import { translateMbomError, translateMbomValidationDetail } from '../../lib/errorMessages';
import { generateCodePreview } from '../../lib/codePreview';
import { validateQuantityAgainstUom } from '../../lib/numeric/uomNumeric';
import { filterMbomInputRevisions } from '../../lib/mbomItemTypeRules';
import { getMbomSubstituteCompatibilityDetails } from '../../lib/mbomSubstituteValidation';

function revisionQuery(component = false): string {
  const usage = component ? '&usage=component' : '';
  return `?limit=500&lifecycle_status=Released&effective_at=${encodeURIComponent(new Date().toISOString())}${usage}`;
}

function todayInputValue(): string {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function newClientId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function revisionBaseUomId(revision: any): string {
  return String(revision?.base_uom_id || revision?.uom_id || '');
}

type DraftSubstitute = {
  client_id: string;
  substitute_item_id: string;
  substitute_revision_id: string;
  priority: number;
  conversion_factor: string;
  max_usage_percent: string;
  requires_approval: boolean;
  effective_from: string;
  effective_to: string;
};

type DraftLine = {
  client_id: string;
  seq: number;
  component_item_id: string;
  component_revision_id: string;
  quantity_per: string;
  uom_id: string;
  scrap_rate: string;
  backflush_flag: boolean;
  phantom_flag: boolean;
  optional_flag: boolean;
  effective_from: string;
  effective_to: string;
  substitutes: DraftSubstitute[];
};

const blankLine = (): DraftLine => ({
  client_id: newClientId('line'), seq: 10, component_item_id: '', component_revision_id: '', quantity_per: '1', uom_id: '', scrap_rate: '0',
  backflush_flag: true, phantom_flag: false, optional_flag: false, effective_from: todayInputValue(), effective_to: '', substitutes: [],
});

const blankSubstitute = (): DraftSubstitute => ({
  client_id: newClientId('sub'), substitute_item_id: '', substitute_revision_id: '', priority: 1, conversion_factor: '1', max_usage_percent: '100',
  requires_approval: false, effective_from: todayInputValue(), effective_to: '',
});

const FieldLabel: React.FC<{ label: React.ReactNode; help: string }> = ({ label, help }) => (
  <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
    <span>{label}</span><FieldHelpPopover label={String(label)} title={String(label)} content={help} />
  </span>
);

function showCreateMbomError(error: any, t: (key: string, params?: Record<string, string | number>) => string) {
  const code = String(error?.code || error?.message || 'MBOM_VALIDATION_FAILED').split(':', 1)[0];
  const details = Array.isArray(error?.details) ? error.details.map((detail: unknown) => translateMbomValidationDetail(detail, t)) : [];
  toast.custom((toastId) => <ValidationErrorToast code={code} message={translateMbomError(code, t)} details={details} moreDetailsLabel={t('mbom.moreDetails')} hideDetailsLabel={t('mbom.hideDetails')} closeLabel={t('common.close')} onClose={() => toast.dismiss(toastId)} />);
}

export const MbomCreateScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const localizedText = useLocalizedText();
  const navigate = useNavigate();
  const [uoms, setUoms] = useState<any[]>([]);
  const [outputRevisions, setOutputRevisions] = useState<any[]>([]);
  const [componentRevisions, setComponentRevisions] = useState<any[]>([]);
  const [uomConversions, setUomConversions] = useState<any[]>([]);
  const [outputItemId, setOutputItemId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [lineForm, setLineForm] = useState<DraftLine | null>(null);
  const [subForm, setSubForm] = useState<DraftSubstitute | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: generateCodePreview('MBOM'), name: emptyLocalized(), description: emptyLocalized(), item_revision_id: '',
    purpose: 'Standard', base_quantity: '100', base_uom_id: '', effective_from: todayInputValue(),
    effective_to: '', reference_document: '',
  });

  const uomById = useMemo(() => new Map(uoms.map((row) => [String(row.master_id), row])), [uoms]);
  const revisionById = useMemo(() => new Map(componentRevisions.map((row) => [String(row.master_id), row])), [componentRevisions]);
  const outputRevision = useMemo(() => outputRevisions.find((row) => String(row.master_id) === form.item_revision_id), [form.item_revision_id, outputRevisions]);
  const allowedInputRevisions = useMemo(() => filterMbomInputRevisions(componentRevisions, outputRevision?.item_type), [componentRevisions, outputRevision?.item_type]);
  const allowedInputRevisionIds = useMemo(() => new Set(allowedInputRevisions.map((row) => String(row.master_id))), [allowedInputRevisions]);
  const revisionLabel = (revision: any) => `${localizedText(revision?.item_name) || localizedText(revision?.name) || revision?.item_code || revision?.code || t('mbom.unknownComponent')} · ${revision?.item_code || ''} · ${revision?.revision_code || ''}`;

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [uomRows, outputs, components, conversions] = await Promise.all([
        fetchResource('uoms', user),
        fetchResource('item-revisions', user, revisionQuery()), fetchResource('item-revisions', user, revisionQuery(true)),
        fetchResource('uom-conversions', user, '?limit=500'),
      ]);
      const releasedUoms = uomRows.filter((row: any) => row.lifecycle_status === 'Released');
      setUoms(releasedUoms); setOutputRevisions(outputs); setComponentRevisions(components); setUomConversions(conversions);
      setForm((current) => {
        const output = outputs.find((row: any) => String(row.master_id) === current.item_revision_id);
        setOutputItemId(output ? String(output.item_id || '') : '');
        return { ...current, item_revision_id: output?.master_id || '', base_uom_id: output?.base_uom_id || '' };
      });
    } catch (error: any) {
      showCreateMbomError(error, t);
    } finally { setLoadingOptions(false); }
  }, [t, user]);

  useEffect(() => {
    void loadOptions();
    const refresh = () => { if (document.visibilityState === 'visible') void loadOptions(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [loadOptions]);

  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const selectOutput = (revisionId: string, selectedRevision?: any) => {
    const revision = selectedRevision || outputRevisions.find((row) => String(row.master_id) === revisionId);
    setForm((current) => ({ ...current, item_revision_id: revisionId, base_uom_id: revision?.base_uom_id || '' }));
  };

  const openAddLine = () => {
    const next = blankLine();
    next.seq = lines.length ? Math.max(...lines.map((line) => Number(line.seq) || 0)) + 10 : 10;
    next.effective_from = form.effective_from || todayInputValue();
    setLineForm(next);
  };

  const saveLine = (event: React.FormEvent) => {
    event.preventDefault();
    if (!lineForm) return;
    const uom = uomById.get(lineForm.uom_id);
    const quantity = validateQuantityAgainstUom(lineForm.quantity_per, uom, { required: true, allowZero: false });
    const duplicateSequence = lines.some((line) => line.client_id !== lineForm.client_id && Number(line.seq) === Number(lineForm.seq));
    const invalidDates = Boolean(lineForm.effective_to && new Date(lineForm.effective_to) <= new Date(lineForm.effective_from));
    if (!lineForm.component_item_id || !lineForm.component_revision_id) return toast.error(t('mbom.errors.MBOM_LINE_REQUIRED_FIELDS'));
    if (!allowedInputRevisionIds.has(lineForm.component_revision_id)) return toast.error(t('mbom.errors.MBOM_COMPONENT_ITEM_TYPE_INVALID'));
    if (!Number.isInteger(Number(lineForm.seq)) || Number(lineForm.seq) <= 0) return toast.error(t('mbom.errors.MBOM_LINE_SEQUENCE_INVALID'));
    if (duplicateSequence) return toast.error(t('mbom.errors.MBOM_SEQUENCE_DUPLICATE'));
    if (!quantity.valid) return toast.error(translateMbomError(quantity.code || 'MBOM_LINE_QUANTITY_INVALID', t));
    if (Number(lineForm.scrap_rate) < 0 || Number(lineForm.scrap_rate) > 1) return toast.error(t('mbom.errors.MBOM_LINE_SCRAP_INVALID'));
    if (invalidDates) return toast.error(translateMbomError('MBOM_LINE_EFFECTIVE_DATES_INVALID', t));
    setLines((current) => current.some((line) => line.client_id === lineForm.client_id)
      ? current.map((line) => line.client_id === lineForm.client_id ? lineForm : line)
      : [...current, lineForm]);
    setLineForm(null);
  };

  const saveSubstitute = () => {
    if (!lineForm || !subForm) return;
    const duplicateRevision = lineForm.substitutes.some((row) => row.client_id !== subForm.client_id && row.substitute_revision_id === subForm.substitute_revision_id);
    const duplicatePriority = lineForm.substitutes.some((row) => row.client_id !== subForm.client_id && Number(row.priority) === Number(subForm.priority));
    if (!subForm.substitute_item_id || !subForm.substitute_revision_id) return toast.error(t('mbom.errors.MBOM_SUBSTITUTE_REQUIRED_FIELDS'));
    if (!allowedInputRevisionIds.has(subForm.substitute_revision_id)) return toast.error(t('mbom.errors.MBOM_SUBSTITUTE_ITEM_TYPE_INVALID'));
    const compatibilityDetails = getMbomSubstituteCompatibilityDetails(
      revisionById.get(lineForm.component_revision_id),
      revisionById.get(subForm.substitute_revision_id),
      uoms,
      uomConversions,
    );
    if (compatibilityDetails.length) return showCreateMbomError({ code: 'MBOM_SUBSTITUTE_COMPATIBILITY_INVALID', details: compatibilityDetails }, t);
    if (duplicateRevision || duplicatePriority) return toast.error(t('mbom.errors.MBOM_SUBSTITUTE_DUPLICATE'));
    if (!Number.isInteger(Number(subForm.priority)) || Number(subForm.priority) <= 0) return toast.error(t('mbom.errors.MBOM_SUBSTITUTE_PRIORITY_INVALID'));
    if (!Number.isFinite(Number(subForm.conversion_factor)) || Number(subForm.conversion_factor) <= 0) return toast.error(t('mbom.errors.MBOM_SUBSTITUTE_CONVERSION_INVALID'));
    if (!Number.isFinite(Number(subForm.max_usage_percent)) || Number(subForm.max_usage_percent) <= 0 || Number(subForm.max_usage_percent) > 100) return toast.error(t('mbom.errors.MBOM_SUBSTITUTE_MAX_USAGE_INVALID'));
    if (!subForm.effective_from || Number.isNaN(Date.parse(subForm.effective_from)) || (subForm.effective_to && (Number.isNaN(Date.parse(subForm.effective_to)) || Date.parse(subForm.effective_to) <= Date.parse(subForm.effective_from)))) return toast.error(t('mbom.errors.MBOM_SUBSTITUTE_EFFECTIVE_DATES_INVALID'));
    setLineForm({ ...lineForm, substitutes: lineForm.substitutes.some((row) => row.client_id === subForm.client_id)
      ? lineForm.substitutes.map((row) => row.client_id === subForm.client_id ? subForm : row)
      : [...lineForm.substitutes, subForm] });
    setSubForm(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!outputItemId || !form.item_revision_id) { toast.error(t('mbom.outputSelectionRequired')); return; }
    if (!lines.length) { toast.error(t('mbom.errors.MBOM_NO_LINES')); return; }
    if (lines.some((line) => !allowedInputRevisionIds.has(line.component_revision_id))) { toast.error(t('mbom.errors.MBOM_COMPONENT_ITEM_TYPE_INVALID')); return; }
    if (lines.some((line) => line.substitutes.some((substitute) => !allowedInputRevisionIds.has(substitute.substitute_revision_id)))) { toast.error(t('mbom.errors.MBOM_SUBSTITUTE_ITEM_TYPE_INVALID')); return; }
    if (form.effective_to && new Date(form.effective_to) <= new Date(form.effective_from)) { toast.error(translateMbomError('MBOM_EFFECTIVE_DATES_INVALID', t)); return; }
    setSaving(true);
    try {
      const result = await createMbomAggregate({
        ...form, effective_to: form.effective_to || null,
        lines: lines.map(({ component_item_id: _componentItemId, ...line }) => ({ ...line, effective_to: line.effective_to || null, substitutes: line.substitutes.map(({ substitute_item_id: _substituteItemId, ...substitute }) => ({ ...substitute, effective_to: substitute.effective_to || null })) })),
      }, user);
      const id = result.data?.master_id;
      toast.success(t('mbom.createSuccess'));
      navigate(result.target_route || `/master-data/mboms/${id}`);
    } catch (error: any) {
      showCreateMbomError(error, t);
    } finally { setSaving(false); }
  };

  return <div data-testid="mbom-create-screen" className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center justify-between"><Button variant="secondary" onClick={() => navigate('/master-data/mboms')}><ArrowLeft />{t('mbom.backToList')}</Button></div>
    <div className="mes-page-header"><div><h1 className="text-xl font-bold text-slate-100">{t('mbom.create')}</h1><p className="text-sm text-slate-400">{t('mbom.createSubtitle')}</p></div></div>
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-base font-bold text-slate-100">{t('mbom.section.basic')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.code')} *</span><input readOnly value={form.code} className="w-full cursor-not-allowed rounded-md border border-slate-700 bg-slate-950/60 p-3 font-mono text-amber-300" /><span className="text-xs text-slate-400">{t('mbom.codePreviewHelp')}</span></label>
          <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.purpose')}</span><SelectBase value={form.purpose} onValueChange={(value) => update('purpose', value)} options={['Standard', 'Alternate', 'Prototype', 'Rework'].map((value) => ({ value, label: value }))} aria-label={t('mbom.purpose')} /></label>
          <ItemRevisionSelector revisions={outputRevisions} itemValue={outputItemId} revisionValue={form.item_revision_id} onItemValueChange={(itemId) => { setOutputItemId(itemId); selectOutput(''); }} onRevisionValueChange={selectOutput} itemLabel={t('mbom.outputItem')} revisionLabel={t('mbom.outputRevision')} revisionHelp={t('mbom.outputRevisionHelp')} disabled={loadingOptions || lines.length > 0} loading={loadingOptions} showItemType testIdPrefix="mbom-output" />
          <LocalizedTextFields label={t('mbom.name')} value={form.name} onChange={(value: LocalizedValues) => update('name', value)} required />
          <LocalizedTextFields label={t('mbom.description')} value={form.description} onChange={(value: LocalizedValues) => update('description', value)} multiline />
        </div>
      </section>

      <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-base font-bold text-slate-100">{t('mbom.section.quantity')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <UomNumberInput label={t('mbom.base')} required min="0.000001" allowZero={false} value={form.base_quantity} uom={uomById.get(form.base_uom_id)} onValueChange={(value) => update('base_quantity', value)} className="rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100" />
          <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3"><div className="text-sm text-slate-300">{t('mbom.baseUom')}</div><div className="mt-2 font-semibold text-slate-100">{uomLabel(uomById.get(form.base_uom_id), localizedText, t('common.notAvailable'))}</div><p className="mt-1 text-xs text-slate-400">{t('mbom.uomDerivedFromRevision')}</p></div>
        </div>
      </section>

      <section data-testid="mbom-create-component-table" className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><div><h2 className="font-semibold text-slate-100">{t('mbom.componentsTitle')}</h2><p className="text-xs text-slate-400">{t('mbom.componentsHelp')}</p></div><Button data-testid="mbom-create-add-component" onClick={openAddLine} disabled={!form.item_revision_id}><Plus />{t('mbom.addComponent')}</Button></div>
        {lines.length === 0 ? <div className="p-8 text-center text-slate-400"><p className="font-semibold text-slate-200">{t('mbom.emptyComponentsTitle')}</p><p className="mt-1 text-sm">{t('mbom.emptyComponentsHelp')}</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-950/60 text-left text-slate-400"><tr><th className="p-3">{t('mbom.seq')}</th><th className="p-3">{t('mbom.component')}</th><th className="p-3">{t('mbom.qtyUom')}</th><th className="p-3">{t('mbom.scrap')}</th><th className="p-3">{t('mbom.manageSubstitutes')}</th><th className="p-3 text-right">{t('common.actions')}</th></tr></thead><tbody>{lines.map((line) => { const revision = revisionById.get(line.component_revision_id); return <tr key={line.client_id} className="border-t border-slate-800"><td className="p-3 font-mono">{line.seq}</td><td className="p-3"><div className="font-semibold text-slate-100">{revisionLabel(revision)}</div></td><td className="p-3">{line.quantity_per} {uomLabel(uomById.get(line.uom_id), localizedText)}</td><td className="p-3">{line.scrap_rate}</td><td className="p-3">{line.substitutes.length}</td><td className="p-3"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => setLineForm({ ...line, substitutes: [...line.substitutes] })} title={t('common.edit')}><Pencil /></Button><Button size="icon" variant="ghost" onClick={() => setLines((current) => current.filter((row) => row.client_id !== line.client_id))} title={t('common.remove')}><Trash2 className="text-rose-300" /></Button></div></td></tr>; })}</tbody></table></div>}
      </section>

      <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900 p-6"><h2 className="text-base font-bold text-slate-100">{t('mbom.section.engineering')}</h2><div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.validFrom')} *</span><input required type="date" value={form.effective_from} onChange={(event) => update('effective_from', event.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100" /></label>
        <label className="space-y-1"><span className="text-sm text-slate-300">{t('mbom.validTo')}</span><input type="date" min={form.effective_from} value={form.effective_to} onChange={(event) => update('effective_to', event.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100" /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-sm text-slate-300">{t('mbom.referenceDocument')}</span><input value={form.reference_document} onChange={(event) => update('reference_document', event.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100" /></label>
      </div></section>
      <div className="flex justify-end"><Button data-testid="mbom-create-submit" type="submit" disabled={saving || loadingOptions || !outputItemId || !form.item_revision_id || !lines.length}><Save />{saving ? t('common.saving') : t('common.create')}</Button></div>
    </form>

    <Modal open={Boolean(lineForm)} size="xl" title={lineForm && lines.some((line) => line.client_id === lineForm.client_id) ? t('mbom.editComponent') : t('mbom.addComponent')} onClose={() => { setSubForm(null); setLineForm(null); }} footerLeft={<Button variant="secondary" onClick={() => setLineForm(null)}>{t('common.cancel')}</Button>} footer={<Button type="submit" form="mbom-create-line-editor"><Save />{t('mbom.saveComponent')}</Button>}>
      {lineForm && <form id="mbom-create-line-editor" data-testid="mbom-line-editor" onSubmit={saveLine} className="grid gap-4 sm:grid-cols-2">
        <label><FieldLabel label={t('mbom.seq')} help={t('mbom.seqHelp')} /><input required type="number" min="1" step="1" value={lineForm.seq} onChange={(event) => setLineForm({ ...lineForm, seq: Number(event.target.value) })} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3" /></label>
        <ItemRevisionSelector revisions={allowedInputRevisions} itemValue={lineForm.component_item_id} revisionValue={lineForm.component_revision_id} onItemValueChange={(itemId) => setLineForm({ ...lineForm, component_item_id: itemId, component_revision_id: '', uom_id: '' })} onRevisionValueChange={(value, revision) => setLineForm({ ...lineForm, component_item_id: String(revision?.item_id || lineForm.component_item_id), component_revision_id: value, uom_id: revisionBaseUomId(revision), substitutes: lineForm.substitutes.filter((row) => row.substitute_revision_id !== value) })} itemLabel={t('mbom.componentItem')} revisionLabel={t('mbom.componentRevision')} revisionHelp={t('mbom.componentRevisionHelp')} excludedRevisionIds={[form.item_revision_id]} showItemType testIdPrefix="mbom-component" />
        <UomNumberInput label={<FieldLabel label={t('mbom.quantityPer')} help={t('mbom.quantityPerHelp')} />} required min="0.000001" allowZero={false} value={lineForm.quantity_per} uom={uomById.get(lineForm.uom_id)} onValueChange={(value) => setLineForm({ ...lineForm, quantity_per: value })} className="border-slate-800 bg-slate-950" />
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><FieldLabel label={t('mbom.uom')} help={t('mbom.uomHelp')} /><div className="font-semibold">{uomLabel(uomById.get(lineForm.uom_id), localizedText, t('common.notAvailable'))}</div><p className="mt-1 text-xs text-slate-400">{t('mbom.uomDerivedFromRevision')}</p></div>
        <DecimalInput label={<FieldLabel label={t('mbom.scrap')} help={t('mbom.scrapHelp')} />} required min="0" max="1" precision={4} value={lineForm.scrap_rate} onValueChange={(value) => setLineForm({ ...lineForm, scrap_rate: value })} className="border-slate-800 bg-slate-950" />
        <label><FieldLabel label={t('mbom.effectiveFrom')} help={t('mbom.effectiveDateHelp')} /><input required type="date" value={lineForm.effective_from} onChange={(event) => setLineForm({ ...lineForm, effective_from: event.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3" /></label>
        <label><FieldLabel label={t('mbom.effectiveTo')} help={t('mbom.effectiveDateHelp')} /><input type="date" min={lineForm.effective_from} value={lineForm.effective_to} onChange={(event) => setLineForm({ ...lineForm, effective_to: event.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3" /></label>
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.backflush_flag} onChange={(event) => setLineForm({ ...lineForm, backflush_flag: event.target.checked })} />{t('mbom.flag.backflush')}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.phantom_flag} onChange={(event) => setLineForm({ ...lineForm, phantom_flag: event.target.checked })} />{t('mbom.flag.phantom')}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.optional_flag} onChange={(event) => setLineForm({ ...lineForm, optional_flag: event.target.checked })} />{t('mbom.flag.optional')}</label></div>
        <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4 sm:col-span-2"><div className="flex items-center justify-between"><div><h3 className="font-semibold">{t('mbom.substituteMaterials')}</h3><p className="text-xs text-slate-400">{t('mbom.substituteSectionHelp')}</p></div><Button size="sm" onClick={() => { const next = blankSubstitute(); next.effective_from = lineForm.effective_from; next.priority = lineForm.substitutes.length + 1; setSubForm(next); }}><Plus />{t('mbom.addSubstitute')}</Button></div>{lineForm.substitutes.length === 0 ? <p className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">{t('mbom.noSubstitutes')}</p> : lineForm.substitutes.map((substitute) => <div key={substitute.client_id} className="flex items-center justify-between rounded-md border border-slate-800 p-3 text-sm"><span>{revisionLabel(revisionById.get(substitute.substitute_revision_id))} · {t('mbom.priority')} {substitute.priority}</span><Button size="icon" variant="ghost" onClick={() => setLineForm({ ...lineForm, substitutes: lineForm.substitutes.filter((row) => row.client_id !== substitute.client_id) })}><Trash2 className="text-rose-300" /></Button></div>)}</section>
      </form>}
    </Modal>

    <Modal open={Boolean(subForm)} title={t('mbom.addSubstitute')} onClose={() => setSubForm(null)} footerLeft={<Button variant="secondary" onClick={() => setSubForm(null)}>{t('common.cancel')}</Button>} footer={<Button onClick={saveSubstitute}>{t('mbom.saveSubstitute')}</Button>}>
      {subForm && lineForm && <form id="mbom-create-substitute-editor" onSubmit={(event) => { event.preventDefault(); saveSubstitute(); }} className="grid gap-4 sm:grid-cols-2">
        <ItemRevisionSelector revisions={allowedInputRevisions} itemValue={subForm.substitute_item_id} revisionValue={subForm.substitute_revision_id} onItemValueChange={(itemId) => setSubForm({ ...subForm, substitute_item_id: itemId, substitute_revision_id: '' })} onRevisionValueChange={(value, revision) => setSubForm({ ...subForm, substitute_item_id: String(revision?.item_id || subForm.substitute_item_id), substitute_revision_id: value })} itemLabel={t('mbom.substituteItem')} revisionLabel={t('mbom.substituteRevision')} revisionHelp={t('mbom.substituteHelp')} excludedRevisionIds={[lineForm.component_revision_id, ...lineForm.substitutes.map((row) => row.substitute_revision_id)]} showItemType testIdPrefix="mbom-substitute" />
        <SubstituteValidationSummary componentRevision={revisionById.get(lineForm.component_revision_id)} substituteRevision={revisionById.get(subForm.substitute_revision_id)} outputItemType={outputRevision?.item_type} uoms={uoms} conversions={uomConversions} priority={subForm.priority} conversionFactor={subForm.conversion_factor} maxUsagePercent={subForm.max_usage_percent} effectiveFrom={subForm.effective_from} effectiveTo={subForm.effective_to} existingSubstitutes={lineForm.substitutes} />
        <label><FieldLabel label={t('mbom.priority')} help={t('mbom.priorityHelp')} /><input required type="number" min="1" step="1" value={subForm.priority} onChange={(event) => setSubForm({ ...subForm, priority: Number(event.target.value) })} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3" /></label>
        <DecimalInput label={<FieldLabel label={t('mbom.conversionFactor')} help={t('mbom.conversionHelp')} />} required min="0.000001" precision={6} value={subForm.conversion_factor} onValueChange={(value) => setSubForm({ ...subForm, conversion_factor: value })} className="border-slate-800 bg-slate-950" />
        <label><FieldLabel label={t('mbom.effectiveFrom')} help={t('mbom.effectiveDateHelp')} /><input required type="date" value={subForm.effective_from} onChange={(event) => setSubForm({ ...subForm, effective_from: event.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3" /></label>
        <label><FieldLabel label={t('mbom.effectiveTo')} help={t('mbom.effectiveDateHelp')} /><input type="date" min={subForm.effective_from} value={subForm.effective_to} onChange={(event) => setSubForm({ ...subForm, effective_to: event.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3" /></label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={subForm.requires_approval} onChange={(event) => setSubForm({ ...subForm, requires_approval: event.target.checked })} />{t('mbom.approval')}</label>
      </form>}
    </Modal>
  </div>;
};
