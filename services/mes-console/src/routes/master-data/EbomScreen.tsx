import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, GitBranch, MoreHorizontal, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Card, ComboboxBase, FieldHelpPopover, Input, SelectBase } from '../../components/ui';
import { UomNumberInput } from '../../components/UomNumberInput';
import { validateQuantityAgainstUom } from '../../lib/numeric/uomNumeric';
import { BaseConfirmation, BaseDataTable, BaseModal, type BaseDataTableColumn } from '../../components/base';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { authHeaders, deleteResource, fetchResource, masterDataBaseUrl, postResource, releaseResource } from '../../lib/masterDataApi';

type Localized = Record<'vi' | 'en' | 'ja' | 'ko', string>;
type Revision = Record<string, any>;
type Item = Record<string, any>;
type Uom = Record<string, any>;
type EbomLine = {
  line_key: string;
  master_id?: string;
  parent_line_id: string;
  seq: number;
  component_revision_id: string;
  component_item_id?: string;
  quantity_per: string;
  uom_id: string;
  note: string;
  component_revision_code?: string;
  component_item_code?: string;
  component_item_name?: unknown;
  uom_code?: string;
  uom_name?: unknown;
};
type EbomHeader = Record<string, any> & { lines?: EbomLine[] };

const EMPTY_LOCALIZED: Localized = { vi: '', en: '', ja: '', ko: '' };
// Keep the existing local JSX contract while routing every EBOM dialog
// through the shared BaseModal implementation.
const Modal: React.FC<React.ComponentProps<typeof BaseModal>> = (props) => <BaseModal placement="center" {...props} />;

function localizedText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  return String(item.vi || item.en || item.ja || item.ko || '');
}

function labelForRevision(revision: Revision, fallback: string): string {
  const name = localizedText(revision.item_name || revision.name || revision.itemName);
  const code = revision.revision_code || revision.code || fallback;
  return name ? `${name} (${code})` : String(code);
}

function newLine(seq: number, parent = ''): EbomLine {
  return { line_key: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`, parent_line_id: parent, seq, component_item_id: '', component_revision_id: '', quantity_per: '1', uom_id: '', note: '' };
}

function errorText(error: any, fallback: string): string {
  if (Array.isArray(error?.validationFailures)) return error.validationFailures.map((item: any) => item.message || item.code).join('\n');
  return error?.message || error?.error || fallback;
}

export const EbomScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const [headers, setHeaders] = useState<EbomHeader[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [selected, setSelected] = useState<EbomHeader | null>(null);
  const [draftLines, setDraftLines] = useState<EbomLine[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedLine, setSelectedLine] = useState<EbomLine | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'release' | 'convert' | 'delete' | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);
  const [form, setForm] = useState({ name: emptyLocalized(), description: emptyLocalized(), item_revision_id: '' });
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const releasedRevisions = useMemo(() => revisions.filter((revision) => revision.lifecycle_status === 'Released'), [revisions]);
  const revisionOptions = useMemo(() => releasedRevisions.map((revision) => ({ value: String(revision.master_id), label: labelForRevision(revision, t('ebom.unknownRevision')) })), [releasedRevisions, t]);
  const itemOptions = useMemo(() => items.filter((item) => item.lifecycle_status === 'Released').map((item) => ({ value: String(item.master_id), label: localizedText(item.name) || item.code || t('common.notAvailable'), description: item.code || undefined, searchText: `${localizedText(item.name)} ${item.code || ''}` })), [items, t]);
  const revisionById = useMemo(() => new Map(revisions.map((revision) => [String(revision.master_id), revision])), [revisions]);
  const uomById = useMemo(() => new Map(uoms.map((uom) => [String(uom.master_id), uom])), [uoms]);
  const statusLabel = (status: string) => ({ Draft: t('ebom.statusDraft'), InReview: t('ebom.statusInReview'), Released: t('ebom.statusReleased'), Inactive: t('ebom.statusInactive') }[status] || status);
  const headerColumns: BaseDataTableColumn<EbomHeader>[] = [
    { id: 'code', header: t('ebom.code'), accessorKey: 'code', cell: ({ row }) => <span className="font-mono font-semibold text-action">{row.original.code}</span> },
    { id: 'target', header: t('ebom.target'), accessorFn: (row) => `${localizedText(row.item_name) || row.item_code || ''} ${row.revision_code || ''}`, cell: ({ row }) => <><p>{localizedText(row.original.item_name) || row.original.item_code || t('common.notAvailable')}</p><p className="text-xs text-muted-foreground">{row.original.revision_code || t('common.notAvailable')}</p></> },
    { id: 'status', header: t('ebom.status'), accessorKey: 'lifecycle_status', cell: ({ row }) => statusLabel(row.original.lifecycle_status) },
    { id: 'lines', header: t('ebom.lines'), accessorFn: (row) => Number(row.current_line_count ?? 0) },
    { id: 'actions', header: t('common.actions'), align: 'right', enableSorting: false, cell: ({ row }) => { const open = actionMenuId === row.original.master_id; return <div className="relative flex justify-end" onClick={(event) => event.stopPropagation()}><Button type="button" variant="ghost" size="icon" onClick={() => setActionMenuId(open ? null : row.original.master_id)} aria-label={t('common.actions')} title={t('common.actions')}><MoreHorizontal className="h-4 w-4" /></Button>{open && <div className="absolute right-0 top-9 z-50 min-w-40 rounded-md border border-border bg-surface p-1 text-left shadow-xl"><button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-hover" onClick={() => { setActionMenuId(null); navigate(`/master-data/eboms/${row.original.master_id}`); }}>{t('common.detail')}</button></div>}</div>; } },
  ];

  const loadHeaders = useCallback(async () => {
    const [headerRows, itemRows, revisionRows, uomRows] = await Promise.all([
      fetchResource('ebom-headers', user),
      fetchResource('items', user, '?limit=500'),
      fetchResource('item-revisions', user, '?limit=500'),
      fetchResource('uoms', user, '?limit=500'),
    ]);
    setHeaders(headerRows);
    setItems(itemRows);
    setRevisions(revisionRows);
    setUoms(uomRows);
  }, [user]);

  const loadDetail = useCallback(async (id: string) => {
    const request = ++requestRef.current;
    const response = await fetch(`${masterDataBaseUrl()}/ebom-headers/${id}`, { headers: authHeaders(user), cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || t('ebom.loadFailed'));
    if (request !== requestRef.current) return;
    const detail = payload.data as EbomHeader;
    const lines = (detail.lines || []).map((line, index) => ({ ...line, line_key: line.master_id || `line-${index}`, component_item_id: line.component_item_id || revisionById.get(String(line.component_revision_id))?.item_id || '' }));
    setSelected({ ...detail, lines });
    setDraftLines(lines);
    setExpanded(new Set());
  }, [revisionById, t, user]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { await loadHeaders(); if (id) await loadDetail(id); else { setSelected(null); setDraftLines([]); } }
    catch (error) { toast.error(errorText(error, t('ebom.loadFailed'))); }
    finally { setLoading(false); }
  }, [id, loadDetail, loadHeaders, t]);

  useEffect(() => { void refresh(); }, [id, user?.userId]);

  const createHeader = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await postResource('ebom-headers', { name: form.name, description: form.description, item_revision_id: form.item_revision_id }, user);
      const created = response.data;
      setShowCreate(false);
      setForm({ name: emptyLocalized(), description: emptyLocalized(), item_revision_id: '' });
      await loadHeaders();
      navigate(`/master-data/eboms/${created.master_id}`);
      toast.success(t('ebom.created'));
    } catch (error) { toast.error(errorText(error, t('ebom.createFailed'))); }
    finally { setSaving(false); }
  };

  const validateFlatList = () => {
    if (!selected) return t('ebom.selectFirst');
    const components = new Set<string>();
    for (const line of draftLines) {
      if (!line.component_revision_id) return t('ebom.componentRequired');
      const uom = uomById.get(String(line.uom_id));
      if (!line.component_item_id) return t('ebom.itemRequired');
      if (!line.uom_id || !uom) return t('ebom.uomRequired');
      const quantityCheck = validateQuantityAgainstUom(String(line.quantity_per), uom, { required: true, allowZero: false });
      if (!quantityCheck.valid) return t(`ebom.numeric.${quantityCheck.code}`);
      if (!Number.isInteger(Number(line.seq)) || Number(line.seq) <= 0) return t('ebom.sequenceInvalid');
      if (!Number.isFinite(Number(line.quantity_per)) || Number(line.quantity_per) <= 0) return t('ebom.quantityInvalid');
      if (components.has(line.component_revision_id)) return t('ebom.componentDuplicate');
      components.add(line.component_revision_id);
    }
    return null;
  };

  const saveTree = async () => {
    const validation = validateFlatList();
    if (validation) { toast.error(validation); return; }
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`${masterDataBaseUrl()}/ebom-headers/${selected.master_id}/design-tree`, { method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: draftLines.map((line, index) => ({ line_key: line.line_key, parent_line_id: null, seq: index + 1, component_revision_id: line.component_revision_id, quantity_per: line.quantity_per, uom_id: line.uom_id, note: line.note || null })) }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || t('ebom.saveFailed'));
      await loadDetail(selected.master_id);
      await loadHeaders();
      toast.success(t('ebom.saved'));
    } catch (error) { toast.error(errorText(error, t('ebom.saveFailed'))); }
    finally { setSaving(false); }
  };

  const release = async () => {
    if (!selected) return;
    setSaving(true);
    try { await releaseResource('ebom-headers', selected.master_id, user); await loadHeaders(); await loadDetail(selected.master_id); toast.success(t('ebom.released')); }
    catch (error) { toast.error(errorText(error, t('ebom.releaseFailed'))); }
    finally { setSaving(false); setConfirmAction(null); }
  };

  const convert = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`${masterDataBaseUrl()}/ebom-headers/${selected.master_id}/create-mbom-draft`, { method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || t('ebom.convertFailed'));
      const mbomId = payload.mbom_id || payload.data?.master_id;
      toast.success(t('ebom.converted'));
      if (mbomId) navigate(`/master-data/mboms/${mbomId}`);
    } catch (error) { toast.error(errorText(error, t('ebom.convertFailed'))); }
    finally { setSaving(false); setConfirmAction(null); }
  };

  const removeEbom = async () => {
    if (!selected || selected.lifecycle_status !== 'Draft') return;
    setSaving(true);
    try {
      await deleteResource('ebom-headers', selected.master_id, user);
      toast.success(t('ebom.deleted'));
      setConfirmAction(null);
      navigate('/master-data/eboms');
    } catch (error) { toast.error(errorText(error, t('ebom.deleteFailed'))); }
    finally { setSaving(false); }
  };

  const removeLine = (lineKey: string) => {
    setDraftLines((current) => current.filter((line) => line.line_key !== lineKey));
    setSelectedLine(null);
  };
  const updateSelectedLine = (patch: Partial<EbomLine>) => setSelectedLine((line) => line ? { ...line, ...patch } : line);
  const selectedItemId = selectedLine?.component_item_id || (selectedLine ? revisionById.get(String(selectedLine.component_revision_id))?.item_id || '' : '');
  const selectedRevisionOptions = useMemo(() => releasedRevisions.filter((revision) => String(revision.item_id || '') === String(selectedItemId)).map((revision) => ({ value: String(revision.master_id), label: labelForRevision(revision, t('ebom.unknownRevision')) })), [releasedRevisions, selectedItemId, t]);
  const applyRevision = (revisionId: string) => {
    const revision = revisionById.get(revisionId);
    updateSelectedLine({ component_revision_id: revisionId, uom_id: String(revision?.base_uom_id || ''), component_revision_code: revision?.revision_code || revision?.code, component_item_id: String(revision?.item_id || selectedItemId), component_item_code: revision?.item_code, component_item_name: revision?.item_name });
  };
  useEffect(() => {
    if (!selectedLine || !selectedItemId) return;
    if (selectedRevisionOptions.length === 1) {
      const onlyRevision = selectedRevisionOptions[0];
      if (onlyRevision && selectedLine.component_revision_id !== onlyRevision.value) applyRevision(onlyRevision.value);
    } else if (selectedRevisionOptions.length === 0 && selectedLine.component_revision_id) {
      updateSelectedLine({ component_revision_id: '', uom_id: '', component_revision_code: '' });
    }
  }, [selectedItemId, selectedLine, selectedRevisionOptions]);
  const componentColumns: BaseDataTableColumn<EbomLine>[] = [
    { id: 'seq', header: t('ebom.sequence'), accessorKey: 'seq' },
    { id: 'item', header: t('ebom.componentItem'), accessorFn: (line) => localizedText(line.component_item_name) || line.component_item_code || '', cell: ({ row }) => <><div className="font-semibold">{localizedText(row.original.component_item_name) || row.original.component_item_code || t('common.notAvailable')}</div><div className="font-mono text-xs text-muted-foreground">{row.original.component_item_code || t('common.notAvailable')}</div></> },
    { id: 'revision', header: t('ebom.componentRevision'), accessorKey: 'component_revision_code', cell: ({ row }) => <span className="font-mono text-sm">{row.original.component_revision_code || revisionById.get(row.original.component_revision_id)?.revision_code || t('ebom.unknownRevision')}</span> },
    { id: 'uom', header: t('ebom.uom'), accessorFn: (line) => localizedText(line.uom_name) || localizedText(uomById.get(line.uom_id)?.name) || '', cell: ({ row }) => <span>{localizedText(row.original.uom_name) || localizedText(uomById.get(row.original.uom_id)?.name) || t('common.notAvailable')}</span> },
    { id: 'quantity', header: t('ebom.quantity'), accessorKey: 'quantity_per' },
    { id: 'actions', header: t('common.actions'), align: 'right', enableSorting: false, cell: ({ row }) => <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(row.original.line_key)} aria-label={t('ebom.removeAction')} title={t('ebom.removeAction')}><Trash2 className="h-4 w-4 text-danger" /></Button> },
  ];

  return <div data-ebom-screen={id ? 'detail' : 'list'} className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><GitBranch className="h-6 w-6 text-action" /><div><h1 className="text-xl font-bold text-foreground">{t('ebom.title')}</h1><p className="text-sm text-muted-foreground">{t('ebom.subtitle')}</p></div></div><div className="flex gap-2"><Button variant="secondary" size="icon" onClick={() => void refresh()} disabled={loading} aria-label={t('ebom.refresh')}><RefreshCw className="h-4 w-4" /></Button>{!id && <Button onClick={() => setShowCreate(true)}><Plus />{t('ebom.create')}</Button>}</div></div>
    {id && <Button variant="secondary" onClick={() => navigate('/master-data/eboms')}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button>}
    {id && selected && <div className="flex justify-end"><div className="relative"><Button type="button" variant="secondary" size="icon" onClick={() => setActionMenuId(actionMenuId === 'detail' ? null : 'detail')} aria-label={t('common.actions')} title={t('common.actions')}><MoreHorizontal className="h-5 w-5" /></Button>{actionMenuId === 'detail' && <div className="absolute right-0 top-11 z-50 min-w-56 rounded-md border border-border bg-surface p-1 shadow-xl"><p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">{t('common.actions')}</p>{selected.lifecycle_status !== 'Released' && <><button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-hover" onClick={() => { const line = newLine(draftLines.length + 1); setActionMenuId(null); setSelectedLine(line); }}>{t('ebom.addComponent')}</button><button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-hover" onClick={() => { setActionMenuId(null); void saveTree(); }} disabled={saving}>{t('ebom.saveAction')}</button><button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-hover" onClick={() => { setActionMenuId(null); setConfirmAction('release'); }} disabled={saving}>{t('ebom.release')}</button>{selected.lifecycle_status === 'Draft' && <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm text-danger hover:bg-hover" onClick={() => { setActionMenuId(null); setConfirmAction('delete'); }} disabled={saving}>{t('ebom.delete')}</button>}</>}{selected.lifecycle_status === 'Released' && <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-hover" onClick={() => { setActionMenuId(null); setConfirmAction('convert'); }} disabled={saving}>{t('ebom.convert')}</button>}</div>}</div></div>}
    <div className="space-y-6"><Card className={id ? 'hidden' : 'p-3'}><BaseDataTable data={headers} columns={headerColumns} loading={loading} getRowId={(row) => row.master_id} onRowClick={(row) => navigate(`/master-data/eboms/${row.master_id}`)} stickyHeader emptyState={t('ebom.empty')} /></Card>
      {selected ? <Card className="space-y-6 p-6"><div className="border-b border-border pb-5"><div className="flex items-center gap-2"><h2 className="font-mono text-lg font-bold text-action">{selected.code}</h2><span className="rounded-full border border-border px-2 py-1 text-xs">{statusLabel(selected.lifecycle_status)}</span></div><p className="mt-1 text-sm text-foreground">{localizedText(selected.name)}</p><p className="text-xs text-muted-foreground">{selected.item_code} · {selected.revision_code}</p></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">{t('ebom.target')}</p><p className="mt-1 font-medium">{localizedText(selected.item_name) || selected.item_code}</p><p className="text-xs text-muted-foreground">{selected.revision_code}</p></div><div className="rounded-md border border-border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">{t('ebom.description')}</p><p className="mt-1 text-sm">{localizedText(selected.description) || t('common.notAvailable')}</p></div><div className="rounded-md border border-border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">{t('ebom.lines')}</p><p className="mt-1 text-lg font-semibold">{draftLines.length}</p></div></div>
        {selected.lifecycle_status === 'Released' && <p className="rounded-md border border-action/40 bg-action/10 p-3 text-sm text-foreground">{t('ebom.releasedHelp')}</p>}
        <div><div className="mb-4"><h3 className="font-semibold text-foreground">{t('ebom.components')}</h3><p className="text-xs text-muted-foreground">{t('ebom.componentsHelp')}</p></div><BaseDataTable data={draftLines.map((line, index) => ({ ...line, seq: index + 1 }))} columns={componentColumns} loading={loading} getRowId={(row) => row.line_key} stickyHeader emptyState={t('ebom.noLines')} /></div>
        {selected.lifecycle_status !== 'Released' && draftLines.length > 0 && <p className="text-xs text-muted-foreground">{t('ebom.saveHint')}</p>}
      </Card> : <Card className="flex min-h-[26rem] items-center justify-center border-dashed"><p className="text-sm text-muted-foreground">{t('ebom.selectFirst')}</p></Card>}
    </div>
    {showCreate && <Modal open title={t('ebom.create')} onClose={() => setShowCreate(false)} footerLeft={<Button variant="secondary" onClick={() => setShowCreate(false)}><ArrowLeft />{t('common.back')}</Button>} footer={<Button type="submit" form="ebom-create-form" disabled={saving}><Save />{t('common.create')}</Button>}><form id="ebom-create-form" onSubmit={createHeader} className="space-y-5"><label className="block space-y-2"><span className="flex items-center gap-1 text-sm font-medium">{t('ebom.itemRevision')} *<FieldHelpPopover label={t('ebom.itemRevisionHelp')} title={t('ebom.itemRevision')} content={t('ebom.itemRevisionHelp')} /></span><SelectBase required value={form.item_revision_id} onValueChange={(value) => setForm((current) => ({ ...current, item_revision_id: value }))} options={revisionOptions} placeholder={t('ebom.selectRevision')} /></label><div><div className="mb-1 flex items-center gap-1 text-sm font-medium">{t('ebom.name')} *<FieldHelpPopover label={t('ebom.nameHelp')} title={t('ebom.name')} content={t('ebom.nameHelp')} /></div><LocalizedTextFields label="" value={form.name} onChange={(value: LocalizedValues) => setForm((current) => ({ ...current, name: value }))} required /></div><div><div className="mb-1 flex items-center gap-1 text-sm font-medium">{t('ebom.description')}<FieldHelpPopover label={t('ebom.descriptionHelp')} title={t('ebom.description')} content={t('ebom.descriptionHelp')} /></div><LocalizedTextFields label="" value={form.description} onChange={(value: LocalizedValues) => setForm((current) => ({ ...current, description: value }))} multiline /></div><p className="rounded-md bg-surface-subtle p-3 text-xs text-muted-foreground">{t('ebom.codeGenerated')}</p></form></Modal>}
    {selectedLine && <Modal open title={t('ebom.addComponent')} onClose={() => setSelectedLine(null)} footerLeft={<Button variant="secondary" onClick={() => setSelectedLine(null)}><ArrowLeft />{t('common.back')}</Button>} footer={<Button onClick={() => { const uom = uomById.get(String(selectedLine.uom_id)); const check = validateQuantityAgainstUom(String(selectedLine.quantity_per), uom, { required: true, allowZero: false }); if (!selectedLine.component_item_id || !selectedLine.component_revision_id || !uom || !check.valid || !Number.isInteger(Number(selectedLine.seq)) || Number(selectedLine.seq) <= 0) { toast.error(t(!selectedLine.component_item_id ? 'ebom.itemRequired' : !selectedLine.component_revision_id ? 'ebom.componentRequired' : !uom ? 'ebom.uomRequired' : !check.valid ? `ebom.numeric.${check.code}` : 'ebom.sequenceInvalid')); return; } setDraftLines((current) => current.some((line) => line.line_key === selectedLine.line_key) ? current.map((line) => line.line_key === selectedLine.line_key ? { ...selectedLine, parent_line_id: '' } : line) : [...current, { ...selectedLine, parent_line_id: '', seq: current.length + 1 }]); setSelectedLine(null); }}><Save />{t('common.save')}</Button>}><div className="space-y-4">
      <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-medium">{t('ebom.componentItem')} *<FieldHelpPopover label={t('ebom.componentItemHelp')} title={t('ebom.componentItem')} content={t('ebom.componentItemHelp')} /></span><ComboboxBase value={selectedItemId} options={itemOptions} onValueChange={(value) => updateSelectedLine({ component_item_id: value, component_revision_id: '', uom_id: '', component_revision_code: '', component_item_code: items.find((item) => String(item.master_id) === value)?.code, component_item_name: items.find((item) => String(item.master_id) === value)?.name })} placeholder={t('ebom.selectItem')} emptyMessage={t('ebom.noItems')} aria-label={t('ebom.componentItem')} /></label>
      <div className="block space-y-1"><span className="flex items-center gap-1 text-sm font-medium">{t('ebom.componentRevision')} *<FieldHelpPopover label={t('ebom.componentHelp')} title={t('ebom.componentRevision')} content={t('ebom.componentHelp')} /></span>{selectedRevisionOptions.length === 1 ? <div className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-foreground"><span>{selectedRevisionOptions[0]?.label}</span><span className="ml-2 text-xs text-muted-foreground">{t('ebom.revisionAutoSelected')}</span></div> : <SelectBase required disabled={!selectedItemId} value={selectedLine.component_revision_id} onValueChange={applyRevision} options={selectedRevisionOptions} placeholder={selectedItemId ? t('ebom.selectRevision') : t('ebom.selectItemFirst')} />}</div>
      <div className="grid gap-4 sm:grid-cols-2"><UomNumberInput value={selectedLine.quantity_per} onValueChange={(value) => updateSelectedLine({ quantity_per: value })} uom={uomById.get(String(selectedLine.uom_id))} label={t('ebom.quantity')} required allowZero={false} /><div className="space-y-1 text-sm"><span className="block font-medium">{t('ebom.uom')}</span><div className="min-h-11 rounded-md border border-border bg-surface-subtle px-3 py-2 text-foreground">{localizedText(uomById.get(String(selectedLine.uom_id))?.name) || t('common.notAvailable')}</div><span className="block text-xs text-muted-foreground">{t('ebom.uomDerivedHelp')}</span></div></div>
      <label className="block space-y-1 text-sm"><span>{t('ebom.note')}</span><Input value={selectedLine.note} onChange={(event) => updateSelectedLine({ note: event.target.value })} /></label>
    </div></Modal>}
    <BaseConfirmation open={confirmAction === 'release'} title={t('ebom.release')} description={t('ebom.releaseConfirm')} confirmLabel={t('ebom.release')} cancelLabel={t('common.cancel')} onClose={() => setConfirmAction(null)} onConfirm={() => void release()} />
    <BaseConfirmation open={confirmAction === 'convert'} title={t('ebom.convert')} description={t('ebom.convertConfirm')} confirmLabel={t('ebom.convert')} cancelLabel={t('common.cancel')} onClose={() => setConfirmAction(null)} onConfirm={() => void convert()} />
    <BaseConfirmation open={confirmAction === 'delete'} title={t('ebom.delete')} description={t('ebom.deleteConfirm')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} destructive onClose={() => setConfirmAction(null)} onConfirm={() => void removeEbom()} />
  </div>;
};
