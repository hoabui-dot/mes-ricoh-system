import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Card, Input, SelectBase } from '../../components/ui';
import { DecimalInput } from '../../components/DecimalInput';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { fetchProductionLineEligibilityCandidates, fetchProductionVersionLineEligibility, fetchResource, normalizeApiError, postResource, putResource, saveProductionVersionLineEligibility } from '../../lib/masterDataApi';
import { formatNumberForDisplay } from '../../lib/numeric/uomNumeric';
import type { ProductionLineEligibilityCandidate, ProductionVersionLineEligibility } from '../../lib/apiTypes';

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

function ConfigurationCard({ kind, row, t, navigate, multiple, value, onChange }: { kind: 'mbom' | 'routing'; row?: Configuration; t: (key: string) => string; navigate: (path: string) => void; multiple: Configuration[]; value: string; onChange: (value: string) => void }) {
  const labels = { mbom: 'MBOM', routing: t('productionVersion.routingLink') };
  const route = kind === 'mbom' ? '/master-data/mboms' : '/master-data/routings';
  return <Card className="space-y-4 border-border bg-surface-subtle p-5">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">{labels[kind]}</h3><p className="text-xs text-muted-foreground">{t(`productionVersion.${kind}OwnershipHelp`)}</p></div>{row && <Button type="button" variant="ghost" size="icon" aria-label={t('common.detail')} title={t('common.detail')} onClick={() => navigate(`${route}/${row.master_id}`)}><ExternalLink className="h-4 w-4" /></Button>}</div>
    {multiple.length > 0 && <SelectBase value={value} onValueChange={onChange} options={multiple.map((item) => ({ value: item.master_id, label: `${localizedText(item.name) || item.code} (${item.code})`, secondaryLabel: `${t('productionVersion.version')} ${item.version_no || item.business_version || '-'} · ${formatDate(item.effective_from, '')}` }))} placeholder={t(`productionVersion.select${kind[0].toUpperCase()}${kind.slice(1)}`)} aria-label={labels[kind]} />}
    {row ? <><div><p className="font-mono font-semibold text-action">{row.code}</p><p className="text-sm text-foreground">{localizedText(row.name) || t('common.notAvailable')}</p></div><div className="grid gap-3 sm:grid-cols-2"><Info label={t('common.status')} value={row.lifecycle_status || t('common.notAvailable')} /><Info label={t('productionVersion.version')} value={formatNumberForDisplay(row.version_no || row.business_version)} /><Info label={t('productionVersion.effectivePeriod')} value={`${formatDate(row.effective_from, t('common.notAvailable'))} → ${formatDate(row.effective_to, t('productionVersion.noEndDate'))}`} />{kind === 'mbom' && <Info label={t('productionVersion.baseQuantity')} value={`${formatNumberForDisplay(row.base_quantity)} ${row.base_uom_code || ''}`} />}{kind === 'routing' && <Info label={t('productionVersion.operationCount')} value={formatNumberForDisplay(row.operation_count)} />}</div></> : <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t(`productionVersion.no${kind[0].toUpperCase()}${kind.slice(1)}`)}</p>}
  </Card>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium text-foreground">{value}</p></div>; }

export const ProductionVersionCrudScreen: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mboms, setMboms] = useState<Configuration[]>([]);
  const [routings, setRoutings] = useState<Configuration[]>([]);
  const [lineCandidates, setLineCandidates] = useState<ProductionLineEligibilityCandidate[]>([]);
  const [lineEligibility, setLineEligibility] = useState<ProductionVersionLineEligibility[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('Draft');
  const [form, setForm] = useState({ mbom_header_id: '', routing_header_id: '', is_default: false, name_i18n: emptyLocalized(), min_lot_size: '', max_lot_size: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const at = encodeURIComponent(new Date().toISOString());
    Promise.all([
      fetchResource('mbom-headers', user, `?limit=500&lifecycle_status=Released&effective_at=${at}`),
      fetchResource('routing-headers', user, `?limit=500&lifecycle_status=Released&effective_at=${at}`),
      id ? fetchResource('production-versions', user, '?limit=500') : Promise.resolve([]),
    ])
      .then(([mbomRows, routingRows, pvRows]) => {
        if (cancelled) return;
        setMboms(mbomRows); setRoutings(routingRows);
        const current = pvRows.find((row: any) => row.master_id === id);
        if (current) {
          setCurrentStatus(String(current.lifecycle_status || current.status || 'Draft'));
          setForm({ mbom_header_id: current.mbom_header_id, routing_header_id: current.routing_header_id, is_default: Boolean(current.is_default), name_i18n: { ...emptyLocalized(), ...(current.name_i18n || {}) }, min_lot_size: current.min_lot_size == null ? '' : String(current.min_lot_size), max_lot_size: current.max_lot_size == null ? '' : String(current.max_lot_size) });
          fetchProductionVersionLineEligibility(String(id), user).then(setLineEligibility).catch((error) => toast.error(error.message));
        } else {
          setCurrentStatus('Draft');
          setLineEligibility([]);
          setForm({ mbom_header_id: mbomRows.length === 1 ? mbomRows[0].master_id : '', routing_header_id: routingRows.length === 1 ? routingRows[0].master_id : '', is_default: false, name_i18n: emptyLocalized(), min_lot_size: '', max_lot_size: '' });
        }
      })
      .catch((error) => toast.error(error.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, user?.userId]);

  const selectedMbom = mboms.find((row) => row.master_id === form.mbom_header_id);
  const selectedRouting = routings.find((row) => row.master_id === form.routing_header_id);
  const selectedSiteId = String(selectedRouting?.site_id || '');
  const isReleased = currentStatus === 'Released';

  useEffect(() => {
    let cancelled = false;
    if (!form.routing_header_id || !selectedSiteId) { setLineCandidates([]); return undefined; }
    setLoadingCandidates(true);
    fetchProductionLineEligibilityCandidates(form.routing_header_id, user)
      .then((preview) => { if (!cancelled) setLineCandidates(preview.candidates); })
      .catch((error) => { if (!cancelled) { setLineCandidates([]); toast.error(error.message); } })
      .finally(() => { if (!cancelled) setLoadingCandidates(false); });
    return () => { cancelled = true; };
  }, [form.routing_header_id, selectedSiteId, user?.userId]);

  const update = (key: string, value: unknown) => setForm((current) => {
    return { ...current, [key]: value };
  });
  const eligibleLines = lineCandidates.filter((line) => line.eligible);
  const updateLine = (index: number, patch: Partial<ProductionVersionLineEligibility>) => setLineEligibility((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  const setPrimaryLine = (index: number) => setLineEligibility((current) => current.map((line, lineIndex) => ({ ...line, is_primary: lineIndex === index })));
  const addLine = () => {
    const used = new Set(lineEligibility.map((line) => line.production_line_id));
    const nextLine = eligibleLines.find((line) => !used.has(line.production_line_id));
    if (!nextLine) return;
    setLineEligibility((current) => [...current, { production_line_id: nextLine.production_line_id, production_line_code: nextLine.production_line_code, production_line_name: nextLine.production_line_name, is_primary: current.length === 0, priority_no: Math.max(0, ...current.map((line) => Number(line.priority_no) || 0)) + 1, efficiency_factor: 1, selection_mode: 'AutoPrimaryThenBackup', selection_policy: 'PrimaryThenBackup', active_flag: true }]);
  };
  const removeLine = (index: number) => setLineEligibility((current) => {
    const removedPrimary = current[index]?.is_primary;
    const next = current.filter((_, lineIndex) => lineIndex !== index).map((line, lineIndex) => ({ ...line, priority_no: lineIndex + 1 }));
    return removedPrimary && next.length ? next.map((line, lineIndex) => ({ ...line, is_primary: lineIndex === 0 })) : next;
  });
  const lineIds = lineEligibility.map((line) => line.production_line_id);
  const priorities = lineEligibility.map((line) => Number(line.priority_no));
  const lineEligibilityValid = lineEligibility.length > 0
    && lineEligibility.filter((line) => line.is_primary).length === 1
    && new Set(lineIds).size === lineIds.length
    && lineIds.every((lineId) => eligibleLines.some((candidate) => candidate.production_line_id === lineId))
    && priorities.every((priority) => Number.isInteger(priority) && priority > 0)
    && new Set(priorities).size === priorities.length
    && lineEligibility.every((line) => Number(line.efficiency_factor) > 0);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      if (!form.mbom_header_id || !form.routing_header_id) throw new Error(t('productionVersion.configurationRequired'));
      if (!lineEligibilityValid) throw new Error(t('productionVersion.lineEligibilityInvalid'));
      const payload = { ...form, min_lot_size: form.min_lot_size === '' ? null : Number(form.min_lot_size), max_lot_size: form.max_lot_size === '' ? null : Number(form.max_lot_size) };
      const saved = id ? await putResource('production-versions', id, payload, user) : await postResource('production-versions', payload, user);
      const productionVersionId = id || saved?.master_id || saved?.data?.master_id;
      if (!productionVersionId) throw new Error(t('productionVersion.saveMissingId'));
      await saveProductionVersionLineEligibility(productionVersionId, lineEligibility, user);
      toast.success(t('common.save')); navigate('/master-data/production-versions');
    } catch (error: any) {
      const summary = normalizeApiError(error, t('productionVersion.saveFailed'));
      toast.error(summary.code ? `${summary.code}: ${summary.message}` : summary.message);
    } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-6"><Button variant="secondary" onClick={() => navigate('/master-data/production-versions')}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button><div className="mes-page-header"><h1 className="text-xl font-bold text-foreground">{t(id ? 'productionVersion.edit' : 'productionVersion.create')}</h1><p className="text-sm text-muted-foreground">{t('productionVersion.formHelp')}</p></div><form onSubmit={submit} className="space-y-6 rounded-md border border-border bg-surface p-6">
    {isReleased && <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">{t('productionVersion.releasedImmutable')}</div>}
    <LocalizedTextFields label={t('productionVersion.name')} value={form.name_i18n} onChange={(value: LocalizedValues) => update('name_i18n', value)} required />
    <div className="rounded-md border border-border bg-surface-subtle p-4"><div className="text-sm font-semibold text-foreground">{t('productionVersion.code')}</div><div className="mt-1 font-mono text-action">{id ? t('productionVersion.codeExisting') : t('productionVersion.codeGenerated')}</div></div>
    <fieldset disabled={isReleased} className="space-y-6 disabled:opacity-70">
    <div className="grid gap-4 lg:grid-cols-2"><ConfigurationCard kind="mbom" row={selectedMbom} multiple={mboms} value={form.mbom_header_id} onChange={(value) => update('mbom_header_id', value)} t={t} navigate={navigate} /><ConfigurationCard kind="routing" row={selectedRouting} multiple={routings} value={form.routing_header_id} onChange={(value) => update('routing_header_id', value)} t={t} navigate={navigate} /></div>
    {selectedMbom && <Card data-testid="production-version-derived-output" className="space-y-4 border-border bg-surface-subtle p-5"><div className="flex items-start justify-between"><div><h3 className="font-semibold text-foreground">{t('productionVersion.derivedOutput')}</h3><p className="mt-1 font-medium text-foreground">{localizedText(selectedMbom.item_name) || selectedMbom.item_code}</p><p className="text-xs text-muted-foreground">{selectedMbom.item_code} · {selectedMbom.revision_code}</p></div><Button type="button" variant="ghost" size="icon" aria-label={t('common.detail')} title={t('common.detail')} onClick={() => navigate(`/master-data/items?revision_id=${selectedMbom.item_revision_id}`)}><ExternalLink className="h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label={t('productionVersion.itemRevision')} value={selectedMbom.revision_code || t('common.notAvailable')} /><Info label={t('productionVersion.itemType')} value={selectedMbom.output_item_type || t('common.notAvailable')} /><Info label={t('productionVersion.baseQuantity')} value={`${formatNumberForDisplay(selectedMbom.base_quantity)} ${selectedMbom.base_uom_code || ''}`} /><Info label={t('productionVersion.outputSource')} value="MBOM" /></div></Card>}
    <LineEligibilityEditor lines={lineEligibility} candidates={lineCandidates} loading={loadingCandidates} disabled={isReleased || !selectedSiteId} valid={lineEligibilityValid} t={t} updateLine={updateLine} setPrimaryLine={setPrimaryLine} addLine={addLine} removeLine={removeLine} />
    <div className="grid gap-4 sm:grid-cols-2"><DecimalInput label={t('productionVersion.minLotSize')} value={form.min_lot_size} min="0" precision={6} onValueChange={(value) => update('min_lot_size', value)} /><DecimalInput label={t('productionVersion.maxLotSize')} value={form.max_lot_size} min="0" precision={6} onValueChange={(value) => update('max_lot_size', value)} /></div><label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.is_default} onChange={(event) => update('is_default', event.target.checked)} />{t('productionVersion.defaultConfiguration')}</label></fieldset><div className="flex justify-end"><Button type="submit" disabled={isReleased || loading || loadingCandidates || saving || !form.name_i18n.vi.trim() || !form.mbom_header_id || !form.routing_header_id || !lineEligibilityValid}><Save className="h-4 w-4" />{t('common.save')}</Button></div>
  </form></div>;
};

function LineEligibilityEditor({ lines, candidates, loading, disabled, valid, t, updateLine, setPrimaryLine, addLine, removeLine }: { lines: ProductionVersionLineEligibility[]; candidates: ProductionLineEligibilityCandidate[]; loading: boolean; disabled: boolean; valid: boolean; t: (key: string) => string; updateLine: (index: number, patch: Partial<ProductionVersionLineEligibility>) => void; setPrimaryLine: (index: number) => void; addLine: () => void; removeLine: (index: number) => void }) {
  const eligible = candidates.filter((line) => line.eligible);
  const used = new Set(lines.map((line) => line.production_line_id));
  const selectionModes = ['AutoPrimaryThenBackup', 'ManualBeforeRelease', 'PrimaryOnly'];
  return <section data-testid="pv-line-eligibility-editor" className="overflow-hidden rounded-md border border-border bg-background">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-subtle px-4 py-3">
      <div className="flex min-w-0 items-center gap-3"><h3 className="font-semibold text-foreground">{t('productionVersion.lineEligibility')}</h3>{loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <span data-testid="eligible-line-count" className="text-xs font-medium text-muted-foreground">{eligible.length} {t('productionVersion.eligibleLines')}</span>}</div>
      <Button type="button" variant="outline" size="sm" disabled={disabled || loading || lines.length >= eligible.length} onClick={addLine}><Plus className="h-4 w-4" />{t('productionVersion.addLine')}</Button>
    </div>
    {lines.length ? <div className="divide-y divide-border">
      <div className="hidden grid-cols-[minmax(220px,2fr)_180px_90px_110px_minmax(190px,1fr)_40px] gap-3 bg-surface px-4 py-2 text-xs font-medium text-muted-foreground lg:grid"><span>{t('productionVersion.productionLine')}</span><span>{t('productionVersion.role')}</span><span>{t('productionVersion.priority')}</span><span>{t('productionVersion.efficiency')}</span><span>{t('productionVersion.selection')}</span><span /></div>
      {lines.map((line, index) => {
        const currentCandidate = candidates.find((candidate) => candidate.production_line_id === line.production_line_id);
        const optionCandidates = currentCandidate && !currentCandidate.eligible ? [currentCandidate, ...eligible] : eligible;
        const options = optionCandidates.map((candidate) => ({ value: candidate.production_line_id, label: localizedText(candidate.production_line_name) || candidate.production_line_code, secondaryLabel: candidate.production_line_code, disabled: !candidate.eligible || (used.has(candidate.production_line_id) && candidate.production_line_id !== line.production_line_id) }));
        return <div key={`${line.production_line_id}-${index}`} data-testid="eligible-line-row" className="grid gap-3 p-4 lg:grid-cols-[minmax(220px,2fr)_180px_90px_110px_minmax(190px,1fr)_40px] lg:items-end">
          <label className="space-y-1"><span className="text-xs text-muted-foreground lg:hidden">{t('productionVersion.productionLine')}</span><SelectBase value={line.production_line_id} onValueChange={(value) => { const selected = candidates.find((candidate) => candidate.production_line_id === value); updateLine(index, { production_line_id: value, production_line_code: selected?.production_line_code, production_line_name: selected?.production_line_name }); }} options={options} aria-label={t('productionVersion.productionLine')} data-testid={`eligible-line-select-${index}`} />{currentCandidate?.eligible ? <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" />{t('productionVersion.lineReady')}</span> : <span className="text-xs text-destructive">{t('productionVersion.lineNoLongerEligible')}</span>}</label>
          <div><span className="mb-1 block text-xs text-muted-foreground lg:hidden">{t('productionVersion.role')}</span><div className="grid h-11 grid-cols-2 rounded-md border border-input bg-input p-1" role="radiogroup" aria-label={t('productionVersion.role')}><button type="button" role="radio" aria-checked={line.is_primary} className={`rounded-sm px-2 text-xs font-medium ${line.is_primary ? 'bg-action text-action-foreground' : 'text-muted-foreground hover:bg-secondary'}`} onClick={() => setPrimaryLine(index)}>{t('productionVersion.primary')}</button><button type="button" role="radio" aria-checked={!line.is_primary} className={`rounded-sm px-2 text-xs font-medium ${!line.is_primary ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary'}`} onClick={() => { if (line.is_primary && lines.length > 1) setPrimaryLine(index === 0 ? 1 : 0); }}>{t('productionVersion.backup')}</button></div></div>
          <label className="space-y-1"><span className="text-xs text-muted-foreground lg:hidden">{t('productionVersion.priority')}</span><Input aria-label={t('productionVersion.priority')} className="h-11" type="number" min="1" step="1" value={line.priority_no} onChange={(event) => updateLine(index, { priority_no: Number(event.target.value) })} /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground lg:hidden">{t('productionVersion.efficiency')}</span><Input aria-label={t('productionVersion.efficiency')} className="h-11" type="number" min="0.01" step="0.01" value={String(line.efficiency_factor ?? 1)} onChange={(event) => updateLine(index, { efficiency_factor: Number(event.target.value) })} /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground lg:hidden">{t('productionVersion.selection')}</span><SelectBase value={line.selection_mode || 'AutoPrimaryThenBackup'} onValueChange={(value) => updateLine(index, { selection_mode: value, selection_policy: value === 'PrimaryOnly' ? 'PrimaryOnly' : 'PrimaryThenBackup' })} options={selectionModes.map((value) => ({ value, label: t(`productionVersion.selectionMode.${value}`) }))} aria-label={t('productionVersion.selection')} /></label>
          <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={t('common.remove')} title={t('common.remove')} onClick={() => removeLine(index)}><Trash2 className="h-4 w-4" /></Button>
        </div>;
      })}
    </div> : <div className="p-5 text-center text-sm text-muted-foreground">{loading ? t('common.loading') : eligible.length ? t('productionVersion.noLineEligibility') : t('productionVersion.noEligibleLines')}</div>}
    {lines.length > 0 && !valid ? <div role="alert" className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">{t('productionVersion.lineEligibilityInvalid')}</div> : null}
  </section>;
}
