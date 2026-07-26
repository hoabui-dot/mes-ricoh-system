import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, GitBranch, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Card, Confirmation, FieldHelpPopover, Input, Modal, SelectBase } from '../../components/ui';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { authHeaders, fetchResource, masterDataBaseUrl, postResource, releaseResource } from '../../lib/masterDataApi';

type Localized = Record<'vi' | 'en' | 'ja' | 'ko', string>;
type Revision = Record<string, any>;
type Uom = Record<string, any>;
type EbomLine = {
  line_key: string;
  master_id?: string;
  parent_line_id: string;
  seq: number;
  component_revision_id: string;
  quantity_per: string;
  uom_id: string;
  reference_designator: string;
  note: string;
  phantom_design_flag: boolean;
  component_revision_code?: string;
  component_item_code?: string;
  component_item_name?: unknown;
  uom_code?: string;
};
type EbomHeader = Record<string, any> & { lines?: EbomLine[] };

const EMPTY_LOCALIZED: Localized = { vi: '', en: '', ja: '', ko: '' };

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
  return { line_key: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`, parent_line_id: parent, seq, component_revision_id: '', quantity_per: '1', uom_id: '', reference_designator: '', note: '', phantom_design_flag: false };
}

function errorText(error: any, fallback: string): string {
  if (Array.isArray(error?.validationFailures)) return error.validationFailures.map((item: any) => item.message || item.code).join('\n');
  return error?.message || error?.error || fallback;
}

export const EbomScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [headers, setHeaders] = useState<EbomHeader[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [selected, setSelected] = useState<EbomHeader | null>(null);
  const [draftLines, setDraftLines] = useState<EbomLine[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedLine, setSelectedLine] = useState<EbomLine | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'release' | 'convert' | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);
  const [form, setForm] = useState({ name: emptyLocalized(), description: emptyLocalized(), item_revision_id: '' });

  const revisionOptions = useMemo(() => revisions.map((revision) => ({ value: String(revision.master_id), label: labelForRevision(revision, t('ebom.unknownRevision')) })), [revisions, t]);
  const uomOptions = useMemo(() => uoms.map((uom) => ({ value: String(uom.master_id), label: `${uom.name ? localizedText(uom.name) : uom.code} (${uom.code})` })), [uoms]);
  const revisionById = useMemo(() => new Map(revisions.map((revision) => [String(revision.master_id), revision])), [revisions]);
  const uomById = useMemo(() => new Map(uoms.map((uom) => [String(uom.master_id), uom])), [uoms]);
  const statusLabel = (status: string) => ({ Draft: t('ebom.statusDraft'), InReview: t('ebom.statusInReview'), Released: t('ebom.statusReleased'), Inactive: t('ebom.statusInactive') }[status] || status);

  const loadHeaders = useCallback(async () => {
    const [headerRows, revisionRows, uomRows] = await Promise.all([
      fetchResource('ebom-headers', user),
      fetchResource('item-revisions', user, '?limit=500'),
      fetchResource('uoms', user, '?limit=500'),
    ]);
    setHeaders(headerRows);
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
    const lines = (detail.lines || []).map((line, index) => ({ ...line, line_key: line.master_id || `line-${index}` }));
    setSelected({ ...detail, lines });
    setDraftLines(lines);
    setExpanded(new Set(lines.filter((line) => !line.parent_line_id).map((line) => line.line_key)));
  }, [t, user]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { await loadHeaders(); if (selected?.master_id) await loadDetail(selected.master_id); }
    catch (error) { toast.error(errorText(error, t('ebom.loadFailed'))); }
    finally { setLoading(false); }
  }, [loadDetail, loadHeaders, selected?.master_id, t]);

  useEffect(() => { void refresh(); }, [user?.userId]);

  const createHeader = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await postResource('ebom-headers', { name: form.name, description: form.description, item_revision_id: form.item_revision_id }, user);
      const created = response.data;
      setShowCreate(false);
      setForm({ name: emptyLocalized(), description: emptyLocalized(), item_revision_id: '' });
      await loadHeaders();
      await loadDetail(created.master_id);
      toast.success(t('ebom.created'));
    } catch (error) { toast.error(errorText(error, t('ebom.createFailed'))); }
    finally { setSaving(false); }
  };

  const validateTree = () => {
    if (!selected) return t('ebom.selectFirst');
    const keys = new Set(draftLines.map((line) => line.line_key));
    const siblings = new Set<string>();
    const components = new Set<string>();
    const parents = new Map(draftLines.map((line) => [line.line_key, line.parent_line_id || null]));
    for (const line of draftLines) {
      if (!line.component_revision_id) return t('ebom.componentRequired');
      if (!line.uom_id) return t('ebom.uomRequired');
      if (!Number.isInteger(Number(line.seq)) || Number(line.seq) <= 0) return t('ebom.sequenceInvalid');
      if (!Number.isFinite(Number(line.quantity_per)) || Number(line.quantity_per) <= 0) return t('ebom.quantityInvalid');
      if (line.parent_line_id && (!keys.has(line.parent_line_id) || line.parent_line_id === line.line_key)) return t('ebom.parentInvalid');
      const siblingKey = `${line.parent_line_id || 'root'}:${line.seq}`;
      if (siblings.has(siblingKey)) return t('ebom.sequenceDuplicate');
      siblings.add(siblingKey);
      const componentKey = `${line.parent_line_id || 'root'}:${line.component_revision_id}`;
      if (components.has(componentKey)) return t('ebom.componentDuplicate');
      components.add(componentKey);
      const visited = new Set<string>();
      let cursor: string | null = line.line_key;
      while (cursor) { if (visited.has(cursor)) return t('ebom.cycleDetected'); visited.add(cursor); cursor = parents.get(cursor) || null; }
    }
    return null;
  };

  const saveTree = async () => {
    const validation = validateTree();
    if (validation) { toast.error(validation); return; }
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`${masterDataBaseUrl()}/ebom-headers/${selected.master_id}/design-tree`, { method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: draftLines }) });
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

  const childrenOf = (parent: string) => draftLines.filter((line) => (line.parent_line_id || '') === parent).sort((a, b) => Number(a.seq) - Number(b.seq));
  const removeLine = (lineKey: string) => {
    const remove = new Set<string>([lineKey]);
    let changed = true;
    while (changed) { changed = false; for (const line of draftLines) if (line.parent_line_id && remove.has(line.parent_line_id) && !remove.has(line.line_key)) { remove.add(line.line_key); changed = true; } }
    setDraftLines((current) => current.filter((line) => !remove.has(line.line_key)));
    setSelectedLine(null);
  };
  const moveLine = (line: EbomLine, direction: -1 | 1) => {
    const siblings = childrenOf(line.parent_line_id || '');
    const index = siblings.findIndex((item) => item.line_key === line.line_key);
    const other = siblings[index + direction];
    if (!other) return;
    setDraftLines((current) => current.map((item) => item.line_key === line.line_key ? { ...item, seq: other.seq } : item.line_key === other.line_key ? { ...item, seq: line.seq } : item));
  };

  const renderTree = (parent = '', depth = 0): React.ReactNode => childrenOf(parent).map((line) => {
    const childCount = childrenOf(line.line_key).length;
    const isOpen = expanded.has(line.line_key);
    const revision = revisionById.get(line.component_revision_id);
    return <React.Fragment key={line.line_key}><div className={`flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 ${selectedLine?.line_key === line.line_key ? 'ring-2 ring-action' : ''}`} style={{ marginLeft: depth * 24 }}>
      <Button size="icon" variant="ghost" disabled={!childCount} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(line.line_key)) next.delete(line.line_key); else next.add(line.line_key); return next; })}>{childCount ? (isOpen ? <ChevronDown /> : <ChevronRight />) : <span className="w-4" />}</Button>
      <span className="w-10 text-xs font-semibold text-muted-foreground">{line.seq}</span><div className="min-w-0 flex-1"><p className="truncate font-medium text-foreground">{localizedText(line.component_item_name) || labelForRevision(revision || {}, line.component_revision_code || t('ebom.unknownRevision'))}</p><p className="truncate text-xs text-muted-foreground">{line.component_item_code || ''} · {line.component_revision_code || ''} · {line.quantity_per} {line.uom_code || uomById.get(line.uom_id)?.code || ''}</p></div>
      {selected?.lifecycle_status !== 'Released' && <><Button size="icon" variant="ghost" onClick={() => { setDraftLines((current) => [...current, newLine((Math.max(0, ...childrenOf(line.line_key).map((child) => Number(child.seq))) || 0) + 10, line.line_key)]); setExpanded((current) => new Set(current).add(line.line_key)); }} aria-label={t('ebom.addChild')}><Plus /></Button><Button size="icon" variant="ghost" onClick={() => moveLine(line, -1)} aria-label={t('ebom.moveUp')}><ArrowUp /></Button><Button size="icon" variant="ghost" onClick={() => moveLine(line, 1)} aria-label={t('ebom.moveDown')}><ArrowDown /></Button><Button size="icon" variant="ghost" onClick={() => setSelectedLine({ ...line })} aria-label={t('ebom.editAction')}><GitBranch /></Button><Button size="icon" variant="ghost" onClick={() => removeLine(line.line_key)} aria-label={t('ebom.removeAction')}><Trash2 /></Button></>}
    </div>{isOpen ? renderTree(line.line_key, depth + 1) : null}</React.Fragment>;
  });

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><GitBranch className="h-6 w-6 text-action" /><div><h1 className="text-xl font-bold text-foreground">{t('ebom.title')}</h1><p className="text-sm text-muted-foreground">{t('ebom.subtitle')}</p></div></div><div className="flex gap-2"><Button variant="secondary" size="icon" onClick={() => void refresh()} disabled={loading} aria-label={t('ebom.refresh')}><RefreshCw className="h-4 w-4" /></Button><Button onClick={() => setShowCreate(true)}><Plus />{t('ebom.create')}</Button></div></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]"><Card className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-subtle text-xs uppercase text-muted-foreground"><tr><th className="p-3">{t('ebom.code')}</th><th className="p-3">{t('ebom.target')}</th><th className="p-3">{t('ebom.status')}</th><th className="p-3">{t('ebom.lines')}</th></tr></thead><tbody>{headers.map((row) => <tr key={row.master_id} onClick={() => void loadDetail(row.master_id)} className={`cursor-pointer border-t border-border hover:bg-hover ${selected?.master_id === row.master_id ? 'bg-hover' : ''}`}><td className="p-3 font-mono font-semibold text-action">{row.code}</td><td className="p-3"><p>{localizedText(row.item_name) || row.item_code}</p><p className="text-xs text-muted-foreground">{row.revision_code}</p></td><td className="p-3">{statusLabel(row.lifecycle_status)}</td><td className="p-3">{row.current_line_count ?? 0}</td></tr>)}</tbody></table></div>{!headers.length && <p className="p-8 text-center text-sm text-muted-foreground">{t('ebom.empty')}</p>}</Card>
      {selected ? <Card className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><div className="flex items-center gap-2"><h2 className="font-mono text-lg font-bold text-action">{selected.code}</h2><span className="rounded-full border border-border px-2 py-1 text-xs">{statusLabel(selected.lifecycle_status)}</span></div><p className="mt-1 text-sm text-foreground">{localizedText(selected.name)}</p><p className="text-xs text-muted-foreground">{selected.item_code} · {selected.revision_code}</p></div><div className="flex flex-wrap gap-2">{selected.lifecycle_status !== 'Released' && <><Button size="sm" variant="secondary" onClick={() => setDraftLines((current) => [...current, newLine((Math.max(0, ...current.filter((line) => !line.parent_line_id).map((line) => Number(line.seq))) || 0) + 10)])}><Plus />{t('ebom.addRoot')}</Button><Button size="sm" variant="secondary" onClick={() => setExpanded(new Set(draftLines.map((line) => line.line_key)))}>{t('ebom.expandAll')}</Button><Button size="sm" onClick={() => void saveTree()} disabled={saving}><Save />{t('ebom.saveAction')}</Button><Button size="sm" variant="secondary" onClick={() => setConfirmAction('release')} disabled={saving}><GitBranch />{t('ebom.release')}</Button></>}{selected.lifecycle_status === 'Released' && <Button size="sm" onClick={() => setConfirmAction('convert')} disabled={saving}><GitBranch />{t('ebom.convert')}</Button>}</div></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">{t('ebom.target')}</p><p className="mt-1 font-medium">{localizedText(selected.item_name) || selected.item_code}</p><p className="text-xs text-muted-foreground">{selected.revision_code}</p></div><div className="rounded-md border border-border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">{t('ebom.description')}</p><p className="mt-1 text-sm">{localizedText(selected.description) || t('common.notAvailable')}</p></div><div className="rounded-md border border-border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">{t('ebom.lines')}</p><p className="mt-1 text-lg font-semibold">{draftLines.length}</p></div></div>
        {selected.lifecycle_status === 'Released' && <p className="rounded-md border border-action/40 bg-action/10 p-3 text-sm text-foreground">{t('ebom.releasedHelp')}</p>}
        <div><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-foreground">{t('ebom.designTree')}</h3><p className="text-xs text-muted-foreground">{t('ebom.treeHelp')}</p></div><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(draftLines.map((line) => line.line_key)))}>{t('ebom.expandAll')}</Button><Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>{t('ebom.collapseAll')}</Button></div></div><div className="space-y-2">{renderTree()}{!draftLines.length && <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('ebom.noLines')}</p>}</div></div>
        {selected.lifecycle_status !== 'Released' && draftLines.length > 0 && <p className="text-xs text-muted-foreground">{t('ebom.saveHint')}</p>}
      </Card> : <Card className="flex min-h-[26rem] items-center justify-center border-dashed"><p className="text-sm text-muted-foreground">{t('ebom.selectFirst')}</p></Card>}
    </div>
    {showCreate && <Modal open title={t('ebom.create')} onClose={() => setShowCreate(false)} footerLeft={<Button variant="secondary" onClick={() => setShowCreate(false)}><ArrowLeft />{t('common.back')}</Button>} footer={<Button type="submit" form="ebom-create-form" disabled={saving}><Save />{t('common.create')}</Button>}><form id="ebom-create-form" onSubmit={createHeader} className="space-y-5"><label className="block space-y-2"><span className="flex items-center gap-1 text-sm font-medium">{t('ebom.itemRevision')} *<FieldHelpPopover label={t('ebom.itemRevisionHelp')} title={t('ebom.itemRevision')} content={t('ebom.itemRevisionHelp')} /></span><SelectBase required value={form.item_revision_id} onValueChange={(value) => setForm((current) => ({ ...current, item_revision_id: value }))} options={revisionOptions} placeholder={t('ebom.selectRevision')} /></label><div><div className="mb-1 flex items-center gap-1 text-sm font-medium">{t('ebom.name')} *<FieldHelpPopover label={t('ebom.nameHelp')} title={t('ebom.name')} content={t('ebom.nameHelp')} /></div><LocalizedTextFields label="" value={form.name} onChange={(value: LocalizedValues) => setForm((current) => ({ ...current, name: value }))} required /></div><div><div className="mb-1 flex items-center gap-1 text-sm font-medium">{t('ebom.description')}<FieldHelpPopover label={t('ebom.descriptionHelp')} title={t('ebom.description')} content={t('ebom.descriptionHelp')} /></div><LocalizedTextFields label="" value={form.description} onChange={(value: LocalizedValues) => setForm((current) => ({ ...current, description: value }))} multiline /></div><p className="rounded-md bg-surface-subtle p-3 text-xs text-muted-foreground">{t('ebom.codeGenerated')}</p></form></Modal>}
    {selectedLine && <Modal open title={t('ebom.editLine')} onClose={() => setSelectedLine(null)} footerLeft={<Button variant="secondary" onClick={() => setSelectedLine(null)}><ArrowLeft />{t('common.back')}</Button>} footer={<Button onClick={() => { setDraftLines((current) => current.map((line) => line.line_key === selectedLine.line_key ? selectedLine : line)); setSelectedLine(null); }}><Save />{t('common.save')}</Button>}><div className="space-y-4"><label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-medium">{t('ebom.component')} *<FieldHelpPopover label={t('ebom.componentHelp')} title={t('ebom.component')} content={t('ebom.componentHelp')} /></span><SelectBase required value={selectedLine.component_revision_id} onValueChange={(value) => setSelectedLine((line) => line && ({ ...line, component_revision_id: value }))} options={revisionOptions} placeholder={t('ebom.selectRevision')} /></label><div className="grid gap-4 sm:grid-cols-3"><label className="space-y-1 text-sm"><span>{t('ebom.sequence')} *</span><Input type="number" min={1} value={selectedLine.seq} onChange={(event) => setSelectedLine({ ...selectedLine, seq: Number(event.target.value) })} /></label><label className="space-y-1 text-sm"><span>{t('ebom.quantity')} *</span><Input type="number" min="0.000001" step="0.000001" value={selectedLine.quantity_per} onChange={(event) => setSelectedLine({ ...selectedLine, quantity_per: event.target.value })} /></label><label className="space-y-1 text-sm"><span>{t('ebom.uom')} *</span><SelectBase required value={selectedLine.uom_id} onValueChange={(value) => setSelectedLine({ ...selectedLine, uom_id: value })} options={uomOptions} placeholder={t('ebom.selectUom')} /></label></div><label className="block space-y-1 text-sm"><span>{t('ebom.reference')}</span><Input value={selectedLine.reference_designator} onChange={(event) => setSelectedLine({ ...selectedLine, reference_designator: event.target.value })} /></label><label className="block space-y-1 text-sm"><span>{t('ebom.note')}</span><Input value={selectedLine.note} onChange={(event) => setSelectedLine({ ...selectedLine, note: event.target.value })} /></label><p className="text-xs text-muted-foreground">{t('ebom.parentInfo')}</p></div></Modal>}
    <Confirmation open={confirmAction === 'release'} title={t('ebom.release')} description={t('ebom.releaseConfirm')} confirmLabel={t('ebom.release')} cancelLabel={t('common.cancel')} onClose={() => setConfirmAction(null)} onConfirm={() => void release()} />
    <Confirmation open={confirmAction === 'convert'} title={t('ebom.convert')} description={t('ebom.convertConfirm')} confirmLabel={t('ebom.convert')} cancelLabel={t('common.cancel')} onClose={() => setConfirmAction(null)} onConfirm={() => void convert()} />
  </div>;
};
