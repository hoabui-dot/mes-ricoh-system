import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, Eye, Layers, MoreHorizontal, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { deleteResource, fetchMbomDetail, fetchResource, postResource, putResource, releaseResource, replaceMbomLines, replaceMbomSubstitutes, validateMbom } from '../../lib/masterDataApi';
import { translateMbomError, translateMbomValidationDetail } from '../../lib/errorMessages';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum, normalizeStatusCode } from '../../lib/i18nLabels';
import { Confirmation, FieldHelpPopover, Modal } from '../../components/ui';
import { uomLabel } from '../../components/UomSelector';
import { UomNumberInput } from '../../components/UomNumberInput';
import { DecimalInput } from '../../components/DecimalInput';
import { formatQuantityForDisplay } from '../../lib/numeric/uomNumeric';
import { ValidationErrorToast } from '../../components/ValidationErrorToast';
import { BaseDataTable, type BaseDataTableColumn } from '../../components/base';
import { mesQueryKeys } from '../../lib/queryKeys';
import { ItemRevisionSelector } from '../../components/ItemRevisionSelector';
import { SubstituteValidationSummary } from '../../components/SubstituteValidationSummary';
import { filterMbomInputRevisions } from '../../lib/mbomItemTypeRules';
import { getMbomSubstituteCompatibilityDetails } from '../../lib/mbomSubstituteValidation';

const blankHeader = { code: '', name: '', base_quantity: '100', base_uom_id: '' };
const blankLine = { seq: 10, parent_line_id: '', component_item_id: '', component_revision_id: '', quantity_per: '1', uom_id: '', scrap_rate: '0', issue_operation_id: null, backflush_flag: true, phantom_flag: false, optional_flag: false, effective_from: new Date().toISOString().slice(0, 10), effective_to: '' };
const blankSubstitute = { substitute_item_id: '', substitute_revision_id: '', priority: 1, conversion_factor: '1', max_usage_percent: '100', requires_approval: false, effective_from: new Date().toISOString().slice(0, 10), effective_to: '' };

function status(row: any) {
  return row?.lifecycle_status || row?.status || 'Draft';
}

function localizedText(value: unknown): string { if (typeof value === 'string') return value; if (!value || typeof value !== 'object') return ''; const item = value as Record<string, unknown>; return String(item.vi || item.en || item.ja || item.ko || ''); }

function revisionIdentity(revision: any, localized: (value: unknown) => string, fallback: string) {
  if (!revision) return fallback;
  const itemName = localized(revision.item_name) || localized(revision.name) || fallback;
  return `${itemName} · ${revision.item_code || revision.code || ''} · ${revision.revision_code || revision.version_code || ''}`.replace(/ · $/, '');
}

function revisionBaseUomId(revision: any, fallback = ''): string {
  return String(revision?.base_uom_id || revision?.uom_id || fallback || '');
}

function translateMbomValidationCode(code: string, t: (key: string, params?: Record<string, string | number | undefined>) => string) {
  if (code === 'UOM_DECIMAL_PRECISION_EXCEEDED' || code === 'UOM_FRACTION_NOT_ALLOWED') return t(`mbom.validation.${code}`);
  return translateMbomError(code, t);
}

function validationFailureMessage(failure: any, t: (key: string, params?: Record<string, string | number | undefined>) => string) {
  const message = translateMbomValidationCode(String(failure?.code || failure?.message || failure), t);
  return failure?.path ? `${message} (${failure.path})` : message;
}

function showMbomValidationToast(error: any, t: (key: string, params?: Record<string, string | number | undefined>) => string) {
  const code = String(error?.code || error?.message || 'MBOM_VALIDATION_FAILED').split(':', 1)[0];
  const rawDetails = error?.details || error?.validationFailures || error?.validationErrors;
  const details = Array.isArray(rawDetails) ? rawDetails.map((detail: unknown) => translateMbomValidationDetail(detail, t)) : [];
  const message = code === 'MBOM_RELEASE_VALIDATION_FAILED' ? t('mbom.releaseValidationFailed') : translateMbomError(code, t);
  toast.custom((toastId) => <ValidationErrorToast code={code} message={message} details={details} moreDetailsLabel={t('mbom.moreDetails')} hideDetailsLabel={t('mbom.hideDetails')} closeLabel={t('common.close')} onClose={() => toast.dismiss(toastId)} />);
}

const FieldLabel: React.FC<{ label: React.ReactNode; help: string }> = ({ label, help }) => <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400"><span>{label}</span><FieldHelpPopover label={String(label)} title={String(label)} content={help} /></span>;

function buildTree(lines: any[]) {
  const byParent = new Map<string, any[]>();
  for (const line of lines) {
    const parent = line.parent_line_id || 'root';
    byParent.set(parent, [...(byParent.get(parent) || []), line]);
  }
  for (const rows of byParent.values()) rows.sort((a, b) => Number(a.seq) - Number(b.seq));
  return byParent;
}

const LineNode: React.FC<{ line: any; displaySeq: number; childMap: Map<string, any[]>; revisions: any[]; uoms: any[]; operations: any[]; substitutes: any[]; t: (key: string, params?: Record<string, string | number | undefined>) => string; onEdit: (line: any) => void; onRemove: (line: any) => void; depth?: number }> = ({ line, displaySeq, childMap, revisions, uoms, operations, substitutes, t, onEdit, onRemove, depth = 0 }) => {
  const revision = revisions.find((item) => item.master_id === line.component_revision_id);
  const uom = uoms.find((item) => item.master_id === line.uom_id);
  const operation = operations.find((item) => item.master_id === line.issue_operation_id);
  const componentName = localizedText(line.component_item_name) || localizedText(revision?.item_name) || localizedText(revision?.name) || t('mbom.unknownComponent');
  const operationName = localizedText(line.issue_operation_name) || localizedText(operation?.name) || t('common.notAvailable');
  const exploded = Number(line.quantity_per || 0) * (1 + Number(line.scrap_rate || 0));
  const children = childMap.get(line.master_id) || [];
  return (
    <div className="border-l border-slate-800" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className="grid grid-cols-[80px_1fr_120px_100px_110px_120px] gap-3 items-center px-4 py-3 bg-slate-950/40 border-b border-slate-800 text-sm">
        <div className="font-mono text-sky-300">{displaySeq}</div>
        <div><div className="font-semibold text-slate-100">{componentName}</div><div className="text-xs text-slate-500">{line.name}</div>{line.phantom_flag && <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs border border-amber-700 bg-amber-950/50 text-amber-300">{t('mbom.flag.phantom')}</span>}</div>
        <div>{formatQuantityForDisplay(line.quantity_per)} {uom?.code}</div>
        <div>{formatQuantityForDisplay(Number(line.scrap_rate || 0) * 100)}%</div>
        <div className="text-amber-200">{formatQuantityForDisplay(exploded)}</div>
        <div className="text-xs text-slate-300">{operationName}</div><div className="flex flex-wrap gap-1"><button type="button" onClick={() => onEdit(line)} className="px-2 py-1 bg-slate-800 rounded text-xs">{t('common.edit')}</button><button type="button" onClick={() => onRemove(line)} className="px-2 py-1 bg-rose-950 rounded text-xs">{t('common.remove')}</button></div>
      </div>
      {substitutes.filter((sub) => sub.mbom_line_id === line.master_id).map((sub) => <div key={sub.master_id} className="ml-10 px-4 py-2 text-xs bg-slate-900 border-b border-slate-800 text-slate-300">{t('mbom.substitute')}: <span className="text-sky-300">{localizedText(sub.substitute_item_name) || localizedText(revisions.find((rev) => rev.master_id === sub.substitute_revision_id)?.item_name) || t('mbom.unknownComponent')}</span> · {t('mbom.priority')} {sub.priority} · {t('mbom.effectiveFrom')} {sub.effective_from ? new Date(sub.effective_from).toLocaleDateString() : t('common.notAvailable')} · {t('mbom.effectiveTo')} {sub.effective_to ? new Date(sub.effective_to).toLocaleDateString() : t('mbom.unlimited')}</div>)}
      {children.map((child, index) => <LineNode key={child.master_id} line={child} displaySeq={index + 1} childMap={childMap} revisions={revisions} uoms={uoms} operations={operations} substitutes={substitutes} t={t} onEdit={onEdit} onRemove={onRemove} depth={depth + 1} />)}
    </div>
  );
};

export const MbomScreen: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [mboms, setMboms] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [substitutes, setSubstitutes] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [uomConversions, setUomConversions] = useState<any[]>([]);
  const [headerForm, setHeaderForm] = useState<any>(blankHeader);
  const [lineForm, setLineForm] = useState<any>(blankLine);
  const [subForm, setSubForm] = useState<any>(blankSubstitute);
  const [selectedLine, setSelectedLine] = useState('');
  const [editingLineId, setEditingLineId] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationState, setValidationState] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [lineActionMenuId, setLineActionMenuId] = useState<string | null>(null);
  const [lineActionPosition, setLineActionPosition] = useState<{ top: number; right: number } | null>(null);
  const [lineEditorOpen, setLineEditorOpen] = useState(false);
  const [substituteLine, setSubstituteLine] = useState<any>(null);
  const [substituteConfirm, setSubstituteConfirm] = useState<any | null>(null);
  const [draftSubstitutes, setDraftSubstitutes] = useState<any[]>([]);

  const revisionSelectorQuery = useQuery({
    queryKey: mesQueryKeys.itemRevisions.selector({ lifecycle_status: 'Released', limit: 500, usage: 'component' }),
    queryFn: () => fetchResource('item-revisions', user, '?limit=500&lifecycle_status=Released&usage=component'),
    enabled: false,
    staleTime: 0,
  });
  const uomSelectorQuery = useQuery({
    queryKey: ['uoms', 'released', 'selector'],
    queryFn: () => fetchResource('uoms', user, '?limit=500&lifecycle_status=Released'),
    enabled: false,
    staleTime: 0,
  });
  const selected = mboms.find((row) => row.master_id === id) || null;
  const allowedInputRevisions = useMemo(() => filterMbomInputRevisions(revisions, selected?.output_item_type), [revisions, selected?.output_item_type]);
  const allowedInputRevisionIds = useMemo(() => new Set(allowedInputRevisions.map((row) => String(row.master_id))), [allowedInputRevisions]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [headers, lineRows, subRows, revisionRows, uomRows, conversionRows] = await Promise.all([
        fetchResource('mbom-headers', user),
        fetchResource('mbom-lines', user, '?limit=500'),
        fetchResource('component-substitutes', user, '?limit=500'),
        fetchResource('item-revisions', user, '?limit=500&usage=component'),
        fetchResource('uoms', user),
        fetchResource('uom-conversions', user, '?limit=500'),
      ]);
      const now = Date.now();
      const releasedRevisions = revisionRows.filter((row: any) => row.lifecycle_status === 'Released'
        && (!row.effective_from || Date.parse(row.effective_from) <= now)
        && (!row.effective_to || Date.parse(row.effective_to) > now));
      const releasedUoms = uomRows.filter((row: any) => row.lifecycle_status === 'Released');
      setMboms(headers);
      setLines(lineRows);
      setSubstitutes(subRows);
      setRevisions(releasedRevisions);
      setUoms(releasedUoms);
      setUomConversions(conversionRows);
      if (id) {
        const detail = await fetchMbomDetail(id, user);
        setMboms((rows) => rows.map((row) => row.master_id === id ? { ...row, ...detail } : row));
        setLines(detail.lines || []);
        setSubstitutes(detail.substitutes || []);
      }
      setHeaderForm({ ...blankHeader, base_uom_id: releasedUoms[0]?.master_id || '' });
      setLineForm({ ...blankLine });
      setSubForm({ ...blankSubstitute });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const selectedLines = useMemo(() => lines.filter((line) => line.mbom_header_id === id), [lines, id]);

  const createHeader = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await postResource('mbom-headers', headerForm, user);
      toast.success(t('mbom.createdHeader'));
      await load();
    } catch (err: any) {
      showMbomValidationToast(err, t);
    }
  };

  const createLine = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id) return;
    try {
      const componentRevision = revisions.find((revision: any) => revision.master_id === lineForm.component_revision_id);
      const derivedUomId = revisionBaseUomId(componentRevision, lineForm.uom_id);
      if (!lineForm.component_revision_id || !derivedUomId) {
        toast.error(t('mbom.errors.MBOM_LINE_REQUIRED_FIELDS'));
        return;
      }
      if (!allowedInputRevisionIds.has(String(lineForm.component_revision_id))) {
        toast.error(t('mbom.errors.MBOM_COMPONENT_ITEM_TYPE_INVALID'));
        return;
      }
      if (draftSubstitutes.some((row) => !allowedInputRevisionIds.has(String(row.substitute_revision_id)))) {
        toast.error(t('mbom.errors.MBOM_SUBSTITUTE_ITEM_TYPE_INVALID'));
        return;
      }
      // Parent hierarchy and issue operation are legacy persistence fields. They
      // are intentionally not part of the material-component editor contract.
      // Preserve an existing parent when editing, but never ask for a new one.
      const linePayload = { ...lineForm, uom_id: derivedUomId, parent_line_id: editingLineId ? (lineForm.parent_line_id || null) : null, issue_operation_id: null };
      if (editingLineId) {
        await putResource(`mbom-headers/${id}/lines`, editingLineId, linePayload, user);
        await replaceMbomSubstitutes(editingLineId, draftSubstitutes.map(({ client_id, master_id, substitute_revision_id, priority, conversion_factor, max_usage_percent, requires_approval, effective_from, effective_to }) => ({ master_id, substitute_revision_id, priority, conversion_factor, max_usage_percent, requires_approval, effective_from, effective_to: effective_to || null })), user);
      } else {
        const created = await postResource('mbom-lines', { ...linePayload, mbom_header_id: id }, user);
        const createdLineId = created?.data?.master_id || created?.master_id;
        if (draftSubstitutes.length > 0 && createdLineId) {
          await replaceMbomSubstitutes(createdLineId, draftSubstitutes.map(({ client_id, master_id, substitute_revision_id, priority, conversion_factor, max_usage_percent, requires_approval, effective_from, effective_to }) => ({ master_id, substitute_revision_id, priority, conversion_factor, max_usage_percent, requires_approval, effective_from, effective_to: effective_to || null })), user);
        }
      }
      toast.success(editingLineId ? t('mbom.structureSaved') : t('mbom.addedLine'));
      setEditingLineId('');
      setSelectedLine('');
      setDraftSubstitutes([]);
      setSubstituteLine(null);
      setLineEditorOpen(false);
      setLineForm({ ...blankLine });
      await load();
    } catch (err: any) {
      showMbomValidationToast(err, t);
    }
  };

  const editLine = (line: any) => {
    setEditingLineId(line.master_id);
    setSelectedLine(line.master_id);
    const revision = revisions.find((item: any) => item.master_id === line.component_revision_id);
    setLineForm({ ...blankLine, ...line, component_item_id: String(revision?.item_id || ''), parent_line_id: line.parent_line_id || '', uom_id: revisionBaseUomId(revision, line.uom_id), quantity_per: formatQuantityForDisplay(line.quantity_per), scrap_rate: formatQuantityForDisplay(line.scrap_rate) });
    setLineEditorOpen(true);
    setDraftSubstitutes(substitutes.filter((row) => row.mbom_line_id === line.master_id));
    void refreshSubstitutes(line.master_id).then((rows) => setDraftSubstitutes(rows));
  };

  const refreshSubstitutes = async (lineId: string) => {
    const rows = await fetchResource(`mbom-lines/${lineId}/substitutes`, user);
    setSubstitutes((current) => [...current.filter((item) => item.mbom_line_id !== lineId), ...rows]);
    return rows;
  };

  const refreshSelectorsBeforeOpen = async () => {
    const [revisionResult, uomResult] = await Promise.all([revisionSelectorQuery.refetch(), uomSelectorQuery.refetch()]);
    const nextRevisions = (revisionResult.data || []).filter((row: any) => normalizeStatusCode(row.lifecycle_status || row.status) === 'Released');
    const nextUoms = (uomResult.data || []).filter((row: any) => normalizeStatusCode(row.lifecycle_status || row.status) === 'Released');
    setRevisions(nextRevisions);
    setUoms(nextUoms);
    return { nextRevisions, nextUoms };
  };

  const openAddLine = async () => {
    await refreshSelectorsBeforeOpen();
    setEditingLineId('');
    setSelectedLine('draft');
    setDraftSubstitutes([]);
    setSubstituteLine(null);
    setLineForm({ ...blankLine, parent_line_id: null, issue_operation_id: null });
    setLineEditorOpen(true);
  };

  const confirmSubstituteMutation = async () => {
    if (!substituteConfirm) return;
    setDraftSubstitutes((rows) => rows.filter((row) => row.client_id !== substituteConfirm.client_id && row.master_id !== substituteConfirm.master_id));
    setSubstituteConfirm(null);
    toast.success(t('mbom.substituteRemovedFromForm'));
  };

  const removeLine = async (line: any) => {
    if (!id || !window.confirm(t('mbom.removeLineConfirm'))) return;
    try { await deleteResource(`mbom-headers/${id}/lines`, line.master_id, user); toast.success(t('common.remove')); await load(); }
    catch (err: any) { showMbomValidationToast(err, t); }
  };

  const createSubstitute = async () => {
    if (!selectedLine) return toast.error(t('mbom.chooseLineFirst'));
    try {
      if (draftSubstitutes.some((row) => row.substitute_revision_id === subForm.substitute_revision_id || Number(row.priority) === Number(subForm.priority))) throw Object.assign(new Error('MBOM_SUBSTITUTE_DUPLICATE'), { code: 'MBOM_SUBSTITUTE_DUPLICATE' });
      if (!subForm.substitute_item_id || !subForm.substitute_revision_id) throw Object.assign(new Error('MBOM_SUBSTITUTE_REQUIRED_FIELDS'), { code: 'MBOM_SUBSTITUTE_REQUIRED_FIELDS' });
      if (!allowedInputRevisionIds.has(String(subForm.substitute_revision_id))) throw Object.assign(new Error('MBOM_SUBSTITUTE_ITEM_TYPE_INVALID'), { code: 'MBOM_SUBSTITUTE_ITEM_TYPE_INVALID' });
      if (!Number.isInteger(Number(subForm.priority)) || Number(subForm.priority) <= 0) throw Object.assign(new Error('MBOM_SUBSTITUTE_PRIORITY_INVALID'), { code: 'MBOM_SUBSTITUTE_PRIORITY_INVALID' });
      if (!Number.isFinite(Number(subForm.conversion_factor)) || Number(subForm.conversion_factor) <= 0) throw Object.assign(new Error('MBOM_SUBSTITUTE_CONVERSION_INVALID'), { code: 'MBOM_SUBSTITUTE_CONVERSION_INVALID' });
      if (!Number.isFinite(Number(subForm.max_usage_percent)) || Number(subForm.max_usage_percent) <= 0 || Number(subForm.max_usage_percent) > 100) throw Object.assign(new Error('MBOM_SUBSTITUTE_MAX_USAGE_INVALID'), { code: 'MBOM_SUBSTITUTE_MAX_USAGE_INVALID' });
      if (!subForm.effective_from || Number.isNaN(Date.parse(subForm.effective_from)) || (subForm.effective_to && (Number.isNaN(Date.parse(subForm.effective_to)) || Date.parse(subForm.effective_to) <= Date.parse(subForm.effective_from)))) throw Object.assign(new Error('MBOM_SUBSTITUTE_EFFECTIVE_DATES_INVALID'), { code: 'MBOM_SUBSTITUTE_EFFECTIVE_DATES_INVALID' });
      const selectedRevision = revisions.find((revision: any) => revision.master_id === subForm.substitute_revision_id);
      const componentRevision = revisions.find((revision: any) => revision.master_id === substituteLine?.component_revision_id);
      const compatibilityDetails = getMbomSubstituteCompatibilityDetails(componentRevision, selectedRevision, uoms, uomConversions);
      if (compatibilityDetails.length) throw Object.assign(new Error('MBOM_SUBSTITUTE_COMPATIBILITY_INVALID'), { code: 'MBOM_SUBSTITUTE_COMPATIBILITY_INVALID', details: compatibilityDetails });
      const next = { ...subForm, client_id: `client-${Date.now()}-${Math.random().toString(36).slice(2)}`, code: `SUB-${Date.now()}`, name: 'Component substitute', substitute_revision_id: subForm.substitute_revision_id, substitute_item_name: selectedRevision?.item_name, substitute_item_code: selectedRevision?.item_code || selectedRevision?.code, substitute_revision_code: selectedRevision?.revision_code || selectedRevision?.version_code, priority: Number(subForm.priority), effective_to: subForm.effective_to || null };
      setDraftSubstitutes((rows) => [...rows, next]);
      toast.success(t('mbom.addedSubstitute'));
      setSubstituteLine(null);
    } catch (err: any) {
      showMbomValidationToast(err, t);
    }
  };

  const deleteMbom = async () => {
    if (!deleteTarget) return;
    try {
      await deleteResource('mbom-headers', deleteTarget.master_id, user);
      toast.success(t('mbom.deleted'));
      setDeleteTarget(null);
      if (id) window.location.href = '/master-data/mboms';
      else await load();
    } catch (err: any) {
      setDeleteTarget(null);
      showMbomValidationToast(err, t);
    }
  };

  const release = async (mbomId: string) => {
    setValidationErrors([]);
    try {
      await releaseResource('mbom-headers', mbomId, user);
      toast.success(t('mbom.released'));
      await load();
    } catch (err: any) {
      if (Array.isArray(err.validationFailures)) {
        setValidationErrors(err.validationFailures.map((failure: any) => validationFailureMessage(failure, t)));
        showMbomValidationToast({ code: 'MBOM_RELEASE_VALIDATION_FAILED', validationFailures: err.validationFailures }, t);
      } else {
        setValidationErrors(String(err.code || err.message).split('\n').filter(Boolean).map((item) => translateMbomError(item, t)));
        showMbomValidationToast(err, t);
      }
    }
  };

  const validate = async (mbomId: string) => {
    setValidationState('validating');
    setValidationErrors([]);
    try {
      const result = await validateMbom(mbomId, user);
      setValidationState(result.valid ? 'valid' : 'invalid');
      if (!result.valid) { setValidationErrors((result.errors || []).map((item: any) => validationFailureMessage(item, t))); showMbomValidationToast({ code: 'MBOM_RELEASE_VALIDATION_FAILED', validationErrors: result.errors || [] }, t); }
      if (result.valid) toast.success(t('mbom.validationPassed'));
    } catch (err: any) {
      setValidationState('invalid');
      setValidationErrors((err.validationErrors || []).map((item: any) => validationFailureMessage(item, t)));
      showMbomValidationToast(err, t);
    }
  };

  const saveStructure = async () => {
    if (!selected || normalizeStatusCode(status(selected)) === 'Released') return;
    try {
      const result = await replaceMbomLines(selected.master_id, Number(selected.structure_version || 1), selectedLines.map((line) => ({
        line_key: line.master_id,
        parent_line_key: line.parent_line_id || null,
        code: line.code,
        name: line.name,
        seq: Number(line.seq),
        component_revision_id: line.component_revision_id,
        quantity_per: line.quantity_per,
        uom_id: revisionBaseUomId(revisions.find((revision: any) => revision.master_id === line.component_revision_id), line.uom_id),
        scrap_rate: line.scrap_rate || 0,
        issue_operation_id: line.issue_operation_id || null,
        backflush_flag: line.backflush_flag === true,
        phantom_flag: line.phantom_flag === true,
        optional_flag: line.optional_flag === true,
      })), user);
      setMboms((rows) => rows.map((row) => row.master_id === selected.master_id ? { ...row, structure_version: result.structure_version } : row));
      toast.success(t('mbom.structureSaved'));
      await load();
    } catch (err: any) {
      if (err.code === 'MBOM_STRUCTURE_VERSION_CONFLICT') toast.error(`${t('mbom.structureConflict')} (${err.latestStructureVersion || '?'})`);
      else showMbomValidationToast(err, t);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;

  const mbomColumns: BaseDataTableColumn<any>[] = [
    { id: 'code', header: 'MBOM', accessorKey: 'code', cell: ({ row }) => <span className="font-mono font-bold text-action">{row.original.code}</span> },
    { id: 'name', header: t('mbom.name'), accessorFn: (row) => localizedText(row.name), cell: ({ row }) => <><div className="font-semibold text-foreground">{localizedText(row.original.name)}</div><div className="text-xs text-muted-foreground">{localizedText(row.original.description)}</div></> },
    { id: 'base', header: t('mbom.base'), accessorFn: (row) => `${row.base_quantity} ${row.base_uom_code || t('common.notAvailable')}` },
    { id: 'purpose', header: t('mbom.purpose'), accessorFn: (row) => row.purpose || t('common.notAvailable') },
    { id: 'status', header: t('common.status'), accessorFn: (row) => status(row), cell: ({ row }) => <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs">{translatedEnum(t, 'status.master', status(row.original))}</span> },
    { id: 'actions', header: t('common.actions'), align: 'right', cell: ({ row }) => { const mbom = row.original; const released = normalizeStatusCode(status(mbom)) === 'Released'; return <div className="relative text-right" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setActionMenuId(actionMenuId === mbom.master_id ? null : mbom.master_id)} title={t('common.actions')} aria-label={t('common.actions')} className="inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-hover"><MoreHorizontal className="h-5 w-5" /></button>{actionMenuId === mbom.master_id && <div className="absolute right-0 top-10 z-[120] min-w-48 rounded-md border border-border bg-surface p-1 text-left shadow-xl"><Link to={`/master-data/mboms/${mbom.master_id}`} onClick={() => setActionMenuId(null)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-hover"><Eye className="h-4 w-4" />{released ? t('common.detail') : t('common.edit')}</Link>{!released && <><button type="button" onClick={() => { setActionMenuId(null); void release(mbom.master_id); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-hover"><CheckCircle2 className="h-4 w-4" />{t('common.release')}</button><button type="button" onClick={() => { setActionMenuId(null); setDeleteTarget(mbom); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-rose-200 hover:bg-rose-950"><Trash2 className="h-4 w-4" />{t('mbom.delete')}</button></>}</div>}</div>; } },
  ];

  if (!id) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg">
          <div className="flex items-center space-x-3"><div className="p-3 bg-action/10 border border-sky-500/20 rounded-lg text-sky-300"><Layers className="w-6 h-6" /></div><div><h1 className="text-xl font-bold">{t('nav.mbom')}</h1><p className="text-xs text-slate-400">{t('mbom.subtitle')}</p></div></div>
          <button onClick={load} className="p-2.5 bg-slate-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="flex justify-end"><Link to="/master-data/mboms/new" className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2.5 font-semibold text-white"><Plus className="h-4 w-4" />{t('common.create')}</Link></div>
        <BaseDataTable data={mboms} columns={mbomColumns} loading={loading} getRowId={(row) => row.master_id} stickyHeader />
        {validationErrors.length > 0 && <div className="bg-rose-950/40 border border-rose-800 rounded-lg p-4 text-sm text-rose-200">{validationErrors.map((msg) => <div key={msg}>{msg}</div>)}</div>}
        <Confirmation open={Boolean(deleteTarget)} title={t('mbom.delete')} description={t('mbom.deleteConfirm')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} destructive onClose={() => setDeleteTarget(null)} onConfirm={() => void deleteMbom()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg"><div><Link to="/master-data/mboms" className="text-xs text-sky-300">{t('mbom.backToList')}</Link><h1 className="text-xl font-bold">{selected?.code || t('mbom.detail')}</h1><p className="text-sm text-slate-200">{localizedText(selected?.name)}</p><p className="text-xs text-slate-400">{localizedText(selected?.description)}</p><p className="mt-1 text-xs text-slate-500">{t('mbom.manufacturingStructureHelp')} · v{selected?.structure_version || 1}</p></div><div className="flex gap-2">{selected && <button onClick={() => void validate(selected.master_id)} disabled={validationState === 'validating'} className="px-4 py-2.5 bg-slate-700 rounded-lg font-semibold">{validationState === 'validating' ? t('mbom.validating') : t('mbom.validate')}</button>}{selected && normalizeStatusCode(status(selected)) !== 'Released' && <><button onClick={() => void saveStructure()} className="px-4 py-2.5 bg-slate-700 rounded-lg font-semibold"><Save className="w-4 h-4 inline mr-1" />{t('mbom.saveStructure')}</button><button onClick={() => release(selected.master_id)} className="px-4 py-2.5 bg-action rounded-lg font-semibold flex gap-2"><CheckCircle2 className="w-4 h-4" />{t('common.release')}</button><button onClick={() => setDeleteTarget(selected)} title={t('mbom.delete')} aria-label={t('mbom.delete')} className="inline-flex items-center justify-center p-2.5 bg-rose-950 text-rose-200 rounded-lg"><Trash2 className="w-4 h-4" /></button></>}</div></div>
      <div className="flex items-start gap-2 rounded-lg border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-100"><FieldHelpPopover label={t('mbom.releaseCriteria')} title={t('mbom.releaseCriteria')} content={t('mbom.releaseCriteriaHelp')} /><div><div className="font-semibold">{t('mbom.releaseCriteria')}</div><p className="mt-1 text-xs text-amber-200/80">{t('mbom.releaseCriteriaHelp')}</p></div></div>
      {validationErrors.length > 0 && <div className="bg-rose-950/40 border border-rose-800 rounded-lg p-4 text-sm text-rose-200">{validationErrors.map((msg) => <div key={msg}>{msg}</div>)}</div>}
      <section className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><h2 className="font-semibold text-slate-100">{t('mbom.componentsTitle')}</h2><p className="text-xs text-slate-400">{t('mbom.componentsHelp')}</p></div><button type="button" onClick={() => openAddLine()} disabled={!selected || normalizeStatusCode(status(selected)) === 'Released'} className="inline-flex items-center gap-2 rounded-md bg-action px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{t('mbom.addComponent')}</button></div>
        <BaseDataTable data={selectedLines} loading={loading} getRowId={(row) => row.master_id} expandableRows stickyHeader columns={[
          { id: 'expand', header: '', enableSorting: false, cell: ({ row }: any) => <button type="button" onClick={() => row.toggleExpanded()} className="rounded p-1 hover:bg-hover" title={t('mbom.manageSubstitutes')} aria-label={t('mbom.manageSubstitutes')}>{row.getIsExpanded() ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> },
          { id: 'seq', header: t('mbom.seq'), accessorKey: 'seq', cell: ({ row }: any) => <span className="font-mono font-semibold">{row.original.seq}</span> },
          { id: 'component', header: t('mbom.component'), accessorFn: (row: any) => localizedText(row.component_item_name) || row.component_revision_id, cell: ({ row }: any) => { const revision = revisions.find((item) => item.master_id === row.original.component_revision_id); return <><div className="font-semibold">{localizedText(row.original.component_item_name) || localizedText(revision?.item_name) || localizedText(revision?.name) || t('mbom.unknownComponent')}</div><div className="font-mono text-xs text-muted-foreground">{revision?.revision_code || row.original.component_revision_id}</div></>; } },
          { id: 'quantity', header: t('mbom.qtyUom'), accessorFn: (row: any) => Number(row.quantity_per), cell: ({ row }: any) => { const rowUomId = revisionBaseUomId(revisions.find((revision: any) => revision.master_id === row.original.component_revision_id), row.original.uom_id); return <span>{formatQuantityForDisplay(row.original.quantity_per)} {uomLabel(uoms.find((item) => item.master_id === rowUomId), localizedText)}</span>; } },
          { id: 'scrap', header: t('mbom.scrap'), accessorKey: 'scrap_rate', cell: ({ row }: any) => `${formatQuantityForDisplay(row.original.scrap_rate)}%` },
          { id: 'substitutes', header: t('mbom.manageSubstitutes'), accessorFn: (row: any) => substitutes.filter((item) => item.mbom_line_id === row.master_id).length, cell: ({ row }: any) => <span className="text-muted-foreground">{substitutes.filter((item) => item.mbom_line_id === row.original.master_id).length}</span> },
          { id: 'actions', header: t('common.actions'), align: 'right', cell: ({ row }: any) => { const line = row.original; const open = lineActionMenuId === line.master_id; return <div className="relative text-right" onClick={(event) => event.stopPropagation()}><button type="button" onClick={(event) => { if (open) { setLineActionMenuId(null); setLineActionPosition(null); } else { const rect = event.currentTarget.getBoundingClientRect(); setLineActionMenuId(line.master_id); setLineActionPosition({ top: rect.bottom + 4, right: Math.max(window.innerWidth - rect.right, 8) }); } }} className="inline-flex items-center justify-center rounded-md p-2 hover:bg-hover" title={t('common.actions')} aria-label={t('common.actions')}><MoreHorizontal className="h-5 w-5" /></button>{open && lineActionPosition && createPortal(<div className="fixed z-[9999] min-w-52 rounded-md border border-border bg-surface p-1 text-left shadow-2xl" style={{ top: lineActionPosition.top, right: lineActionPosition.right }}><button type="button" onClick={() => { setLineActionMenuId(null); setLineActionPosition(null); editLine(line); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-hover"><Pencil className="h-4 w-4" />{t('common.edit')}</button><button type="button" onClick={() => { setLineActionMenuId(null); setLineActionPosition(null); void removeLine(line); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-rose-200 hover:bg-rose-950"><Trash2 className="h-4 w-4" />{t('common.remove')}</button></div>, document.body)}</div>; } },
        ] as BaseDataTableColumn<any>[]} renderExpandedRow={(line) => <BaseDataTable data={substitutes.filter((item) => item.mbom_line_id === line.master_id)} getRowId={(row) => row.master_id} columns={[{ id: 'substitute', header: t('mbom.substituteMaterial'), accessorFn: (row: any) => row.substitute_item_code || row.substitute_revision_code || row.substitute_revision_id, cell: ({ row }: any) => <><div className="font-semibold">{localizedText(row.original.substitute_item_name) || row.original.substitute_item_code || t('mbom.unknownComponent')}</div><div className="font-mono text-xs text-muted-foreground">{row.original.substitute_revision_code || row.original.substitute_revision_id}</div></> }, { id: 'priority', header: t('mbom.priority'), accessorKey: 'priority' }, { id: 'effective', header: t('mbom.effectiveFrom'), accessorFn: (row: any) => row.effective_from || '', cell: ({ row }: any) => `${row.original.effective_from ? new Date(row.original.effective_from).toLocaleDateString() : t('common.notAvailable')} → ${row.original.effective_to ? new Date(row.original.effective_to).toLocaleDateString() : t('mbom.unlimited')}` }]} emptyState={<span>{t('common.empty')}</span>} />}
        />
        {selectedLines.length === 0 && <div className="p-8 text-center text-slate-400"><p className="font-semibold text-slate-200">{t('mbom.emptyComponentsTitle')}</p><p className="mt-1 text-sm">{t('mbom.emptyComponentsHelp')}</p><button type="button" onClick={() => openAddLine()} className="mt-4 rounded-md bg-action px-4 py-2 text-sm font-semibold">{t('mbom.addFirstComponent')}</button></div>}
      </section>
      <Modal open={lineEditorOpen} size="xl" title={editingLineId ? t('mbom.editComponent') : t('mbom.addComponent')} onClose={() => setLineEditorOpen(false)} footerLeft={<button type="button" onClick={() => setLineEditorOpen(false)} className="rounded-md border border-slate-700 px-4 py-2">{t('common.cancel')}</button>} footer={<button type="submit" form="mbom-line-editor" className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2 font-semibold"><Save className="h-4 w-4" />{editingLineId ? t('common.save') : t('mbom.saveComponent')}</button>}>
        <form id="mbom-line-editor" onSubmit={createLine} className="grid gap-4 sm:grid-cols-2">
          <label><FieldLabel label={t('mbom.seq')} help={t('mbom.seqHelp')} /><input required type="number" min="1" step="1" value={lineForm.seq} onChange={(e) => setLineForm({ ...lineForm, seq: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
          <ItemRevisionSelector revisions={allowedInputRevisions} itemValue={lineForm.component_item_id} revisionValue={lineForm.component_revision_id} onItemValueChange={(itemId) => setLineForm({ ...lineForm, component_item_id: itemId, component_revision_id: '', uom_id: '' })} onRevisionValueChange={(value, revision) => setLineForm({ ...lineForm, component_item_id: String(revision?.item_id || lineForm.component_item_id), component_revision_id: value, uom_id: revisionBaseUomId(revision, '') })} itemLabel={t('mbom.componentItem')} revisionLabel={t('mbom.componentRevision')} revisionHelp={t('mbom.componentRevisionHelp')} showItemType testIdPrefix="mbom-component" />
          <UomNumberInput label={<FieldLabel label={t('mbom.quantityPer')} help={t('mbom.quantityPerHelp')} />} required min="0.000001" allowZero={false} value={String(lineForm.quantity_per ?? '')} uom={uoms.find((uom) => uom.master_id === lineForm.uom_id)} onValueChange={(value) => setLineForm({ ...lineForm, quantity_per: value })} className="bg-slate-950 border-slate-800" />
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><FieldLabel label={t('mbom.uom')} help={t('mbom.uomHelp')} /><div className="font-semibold text-slate-100">{uomLabel(uoms.find((uom) => uom.master_id === lineForm.uom_id), localizedText, t('common.notAvailable'))}</div><p className="mt-1 text-xs text-slate-400">{t('mbom.uomDerivedFromRevision')}</p></div>
          <DecimalInput label={<FieldLabel label={t('mbom.scrap')} help={t('mbom.scrapHelp')} />} required min="0" max="1" precision={4} value={String(lineForm.scrap_rate ?? '')} onValueChange={(value) => setLineForm({ ...lineForm, scrap_rate: value })} className="bg-slate-950 border-slate-800" />
          <label><FieldLabel label={t('mbom.effectiveFrom')} help={t('mbom.effectiveDateHelp')} /><input required type="date" value={lineForm.effective_from} onChange={(e) => setLineForm({ ...lineForm, effective_from: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
          <label><FieldLabel label={t('mbom.effectiveTo')} help={t('mbom.effectiveDateHelp')} /><input type="date" min={lineForm.effective_from} value={lineForm.effective_to} onChange={(e) => setLineForm({ ...lineForm, effective_to: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.backflush_flag} onChange={(e) => setLineForm({ ...lineForm, backflush_flag: e.target.checked })} /><span>{t('mbom.flag.backflush')}</span><FieldHelpPopover label={t('mbom.flag.backflush')} title={t('mbom.flag.backflush')} content={t('mbom.backflushHelp')} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.phantom_flag} onChange={(e) => setLineForm({ ...lineForm, phantom_flag: e.target.checked })} /><span>{t('mbom.flag.phantom')}</span><FieldHelpPopover label={t('mbom.flag.phantom')} title={t('mbom.flag.phantom')} content={t('mbom.phantomHelp')} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.optional_flag} onChange={(e) => setLineForm({ ...lineForm, optional_flag: e.target.checked })} /><span>{t('mbom.flag.optional')}</span><FieldHelpPopover label={t('mbom.flag.optional')} title={t('mbom.flag.optional')} content={t('mbom.optionalHelp')} /></label></div>
          {editingLineId && <section className="sm:col-span-2 rounded-lg border border-slate-700 bg-slate-950/60 p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-slate-100">{t('mbom.substituteMaterials')}</h3><p className="text-xs text-slate-400">{t('mbom.substituteSectionHelp')}</p></div><button type="button" onClick={() => { setSubForm({ ...blankSubstitute }); setSelectedLine(editingLineId); setSubstituteLine({ ...lineForm, master_id: editingLineId }); }} disabled={normalizeStatusCode(status(selected)) === 'Released'} className="rounded-md bg-action px-3 py-2 text-sm font-semibold">{t('mbom.addSubstitute')}</button></div>{draftSubstitutes.length === 0 ? <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">{t('mbom.noSubstitutes')}</div> : <BaseDataTable data={draftSubstitutes} getRowId={(row) => row.client_id || row.master_id} columns={[{ id: 'revision', header: t('mbom.substituteMaterial'), accessorFn: (row: any) => row.substitute_item_code || row.substitute_revision_code || row.substitute_revision_id, cell: ({ row }: any) => <><div className="font-semibold">{localizedText(row.original.substitute_item_name) || row.original.substitute_item_code || row.original.substitute_revision_code || row.original.substitute_revision_id}</div><div className="font-mono text-xs text-muted-foreground">{row.original.substitute_revision_code || row.original.substitute_revision_id}</div></> }, { id: 'config', header: t('mbom.priority'), accessorFn: (row: any) => row.priority, cell: ({ row }: any) => <span>{row.original.priority} · {row.original.conversion_factor} · {row.original.max_usage_percent}%</span> }, { id: 'status', header: t('mbom.status'), accessorFn: (row: any) => row.approval_status || 'Draft', cell: ({ row }: any) => <span>{row.original.approval_status || t('common.notAvailable')}</span> }, { id: 'actions', header: t('common.actions'), cell: ({ row }: any) => <button type="button" className="rounded px-2 py-1 text-xs text-rose-200 hover:bg-rose-950" onClick={() => setSubstituteConfirm(row.original)}>{t('common.delete')}</button> }]} emptyState={<span>{t('mbom.noSubstitutes')}</span>} />}</section>}
          {!editingLineId && <section className="sm:col-span-2 rounded-lg border border-slate-700 bg-slate-950/60 p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-slate-100">{t('mbom.substituteMaterials')}</h3><p className="text-xs text-slate-400">{t('mbom.substituteSectionHelp')}</p></div><button type="button" onClick={() => { setSubForm({ ...blankSubstitute }); setSelectedLine('draft'); setSubstituteLine({ ...lineForm, master_id: 'draft' }); }} className="rounded-md bg-action px-3 py-2 text-sm font-semibold">{t('mbom.addSubstitute')}</button></div>{draftSubstitutes.length === 0 ? <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">{t('mbom.noSubstitutes')}</div> : <BaseDataTable data={draftSubstitutes} getRowId={(row) => row.client_id || row.master_id} columns={[{ id: 'revision', header: t('mbom.substituteMaterial'), accessorFn: (row: any) => row.substitute_revision_id, cell: ({ row }: any) => <div><div className="font-semibold">{localizedText(row.original.substitute_item_name) || row.original.substitute_item_code || row.original.substitute_revision_code || row.original.substitute_revision_id}</div><div className="font-mono text-xs text-muted-foreground">{row.original.substitute_revision_code || row.original.substitute_revision_id}</div></div> }, { id: 'priority', header: t('mbom.priority'), accessorKey: 'priority' }, { id: 'actions', header: t('common.actions'), cell: ({ row }: any) => <button type="button" className="rounded px-2 py-1 text-xs text-rose-200 hover:bg-rose-950" onClick={() => setSubstituteConfirm(row.original)}>{t('common.delete')}</button> }]} emptyState={<span>{t('mbom.noSubstitutes')}</span>} />}</section>}
        </form>
      </Modal>
      <Modal open={Boolean(substituteLine)} title={t('mbom.addSubstitute')} onClose={() => setSubstituteLine(null)} footerLeft={<button type="button" onClick={() => setSubstituteLine(null)} className="rounded-md border border-slate-700 px-4 py-2">{t('common.cancel')}</button>} footer={<button type="button" onClick={() => void createSubstitute()} className="rounded-md bg-action px-4 py-2 font-semibold">{t('mbom.saveSubstitute')}</button>}>
        <form id="mbom-substitute-editor" onSubmit={(event) => { event.preventDefault(); void createSubstitute(); }} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-md border border-slate-700 bg-slate-950 p-3"><div className="text-xs uppercase text-slate-400">{t('mbom.originalComponent')}</div><div className="mt-1 font-semibold text-slate-100">{revisionIdentity(revisions.find((rev) => rev.master_id === substituteLine?.component_revision_id), localizedText, t('mbom.unknownComponent'))}</div></div>
        <ItemRevisionSelector revisions={allowedInputRevisions} itemValue={subForm.substitute_item_id} revisionValue={subForm.substitute_revision_id} onItemValueChange={(itemId) => setSubForm({ ...subForm, substitute_item_id: itemId, substitute_revision_id: '' })} onRevisionValueChange={(value, revision) => setSubForm({ ...subForm, substitute_item_id: String(revision?.item_id || subForm.substitute_item_id), substitute_revision_id: value })} itemLabel={t('mbom.substituteItem')} revisionLabel={t('mbom.substituteRevision')} revisionHelp={t('mbom.substituteHelp')} excludedRevisionIds={[substituteLine?.component_revision_id, ...draftSubstitutes.map((row) => row.substitute_revision_id)]} showItemType testIdPrefix="mbom-substitute" />
          <SubstituteValidationSummary componentRevision={revisions.find((revision: any) => revision.master_id === substituteLine?.component_revision_id)} substituteRevision={revisions.find((revision: any) => revision.master_id === subForm.substitute_revision_id)} outputItemType={selected?.output_item_type} uoms={uoms} conversions={uomConversions} priority={subForm.priority} conversionFactor={subForm.conversion_factor} maxUsagePercent={subForm.max_usage_percent} effectiveFrom={subForm.effective_from} effectiveTo={subForm.effective_to} existingSubstitutes={draftSubstitutes} />
          <label><FieldLabel label={t('mbom.priority')} help={t('mbom.priorityHelp')} /><input required type="number" min="1" step="1" value={subForm.priority} onChange={(e) => setSubForm({ ...subForm, priority: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
          <DecimalInput label={<FieldLabel label={t('mbom.conversionFactor')} help={t('mbom.conversionHelp')} />} required min="0.000001" precision={6} value={String(subForm.conversion_factor ?? '')} onValueChange={(value) => setSubForm({ ...subForm, conversion_factor: value })} className="bg-slate-950 border-slate-800" />
          <label><FieldLabel label={t('mbom.effectiveFrom')} help={t('mbom.effectiveDateHelp')} /><input required type="date" value={subForm.effective_from} onChange={(e) => setSubForm({ ...subForm, effective_from: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
          <label><FieldLabel label={t('mbom.effectiveTo')} help={t('mbom.effectiveDateHelp')} /><input type="date" min={subForm.effective_from} value={subForm.effective_to} onChange={(e) => setSubForm({ ...subForm, effective_to: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={subForm.requires_approval} onChange={(e) => setSubForm({ ...subForm, requires_approval: e.target.checked })} /><span>{t('mbom.approval')}</span><FieldHelpPopover label={t('mbom.approval')} title={t('mbom.approval')} content={t('mbom.approvalHelp')} /></label>
        </form>
      </Modal>
      <Confirmation open={Boolean(substituteConfirm)} title={t('mbom.removeSubstitute')} description={t('mbom.removeSubstituteConfirm')} confirmLabel={t('common.confirm')} cancelLabel={t('common.cancel')} destructive onClose={() => setSubstituteConfirm(null)} onConfirm={() => void confirmSubstituteMutation()} />
      <Confirmation open={Boolean(deleteTarget)} title={t('mbom.delete')} description={t('mbom.deleteConfirm')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} destructive onClose={() => setDeleteTarget(null)} onConfirm={() => void deleteMbom()} />
    </div>
  );
};
