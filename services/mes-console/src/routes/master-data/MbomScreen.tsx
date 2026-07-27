import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Layers, Plus, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { fetchResource, postResource, releaseResource } from '../../lib/masterDataApi';
import { useI18n, validationMessage } from '@mom-platform/i18n-ui-shared';
import { translatedEnum, normalizeStatusCode } from '../../lib/i18nLabels';
import { SelectBase } from '../../components/ui';

const blankHeader = { code: '', name: '', site_id: '', base_quantity: '100.000000', base_uom_id: '' };
const blankLine = { seq: 10, parent_line_id: '', component_revision_id: '', quantity_per: '1.000000', uom_id: '', scrap_rate: '0.0000', issue_operation_id: '', backflush_flag: true, phantom_flag: false };
const blankSubstitute = { substitute_revision_id: '', priority: 1, conversion_factor: '1.000000', max_usage_percent: '100.0000', requires_approval: false };

function status(row: any) {
  return row.lifecycle_status || row.status || 'Draft';
}

function localizedText(value: unknown): string { if (typeof value === 'string') return value; if (!value || typeof value !== 'object') return ''; const item = value as Record<string, unknown>; return String(item.vi || item.en || item.ja || item.ko || ''); }

function buildTree(lines: any[]) {
  const byParent = new Map<string, any[]>();
  for (const line of lines) {
    const parent = line.parent_line_id || 'root';
    byParent.set(parent, [...(byParent.get(parent) || []), line]);
  }
  for (const rows of byParent.values()) rows.sort((a, b) => Number(a.seq) - Number(b.seq));
  return byParent;
}

const LineNode: React.FC<{ line: any; displaySeq: number; childMap: Map<string, any[]>; revisions: any[]; uoms: any[]; operations: any[]; substitutes: any[]; t: (key: string, params?: Record<string, string | number | undefined>) => string; depth?: number }> = ({ line, displaySeq, childMap, revisions, uoms, operations, substitutes, t, depth = 0 }) => {
  const revision = revisions.find((item) => item.master_id === line.component_revision_id);
  const uom = uoms.find((item) => item.master_id === line.uom_id);
  const operation = operations.find((item) => item.master_id === line.issue_operation_id);
  const exploded = Number(line.quantity_per || 0) * (1 + Number(line.scrap_rate || 0));
  const children = childMap.get(line.master_id) || [];
  return (
    <div className="border-l border-slate-800" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className="grid grid-cols-[80px_1fr_120px_100px_110px_120px] gap-3 items-center px-4 py-3 bg-slate-950/40 border-b border-slate-800 text-sm">
        <div className="font-mono text-sky-300">{displaySeq}</div>
        <div><div className="font-mono text-slate-100">{revision?.code || t('mbom.unknownComponent')}</div><div className="text-xs text-slate-500">{line.name}</div>{line.phantom_flag && <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs border border-amber-700 bg-amber-950/50 text-amber-300">{t('mbom.flag.phantom')}</span>}</div>
        <div>{line.quantity_per} {uom?.code}</div>
        <div>{Number(line.scrap_rate) * 100}%</div>
        <div className="text-amber-200">{exploded.toFixed(6)}</div>
        <div className="font-mono text-xs text-slate-400">{operation?.code || '-'}</div>
      </div>
      {substitutes.filter((sub) => sub.mbom_line_id === line.master_id).map((sub) => <div key={sub.master_id} className="ml-10 px-4 py-2 text-xs bg-slate-900 border-b border-slate-800 text-slate-300">{t('mbom.substitute')}: <span className="font-mono text-sky-300">{revisions.find((rev) => rev.master_id === sub.substitute_revision_id)?.code || t('mbom.unknownComponent')}</span> {t('mbom.priority')} {sub.priority} / {sub.attributes?.max_usage_percent || '100'}%</div>)}
      {children.map((child, index) => <LineNode key={child.master_id} line={child} displaySeq={index + 1} childMap={childMap} revisions={revisions} uoms={uoms} operations={operations} substitutes={substitutes} t={t} depth={depth + 1} />)}
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
  const [sites, setSites] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [headerForm, setHeaderForm] = useState<any>(blankHeader);
  const [lineForm, setLineForm] = useState<any>(blankLine);
  const [subForm, setSubForm] = useState<any>(blankSubstitute);
  const [selectedLine, setSelectedLine] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const selected = mboms.find((row) => row.master_id === id) || null;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [headers, lineRows, subRows, siteRows, revisionRows, uomRows, operationRows] = await Promise.all([
        fetchResource('mbom-headers', user),
        fetchResource('mbom-lines', user, '?limit=500'),
        fetchResource('component-substitutes', user, '?limit=500'),
        fetchResource('sites', user),
        fetchResource('item-revisions', user, '?limit=500'),
        fetchResource('uoms', user),
        fetchResource('operations', user),
      ]);
      setMboms(headers);
      setLines(lineRows);
      setSubstitutes(subRows);
      setSites(siteRows);
      setRevisions(revisionRows);
      setUoms(uomRows);
      setOperations(operationRows);
      setHeaderForm({ ...blankHeader, site_id: siteRows[0]?.master_id || '', base_uom_id: uomRows[0]?.master_id || '' });
      setLineForm({ ...blankLine, component_revision_id: revisionRows[0]?.master_id || '', uom_id: uomRows[0]?.master_id || '', issue_operation_id: operationRows[0]?.master_id || '' });
      setSubForm({ ...blankSubstitute, substitute_revision_id: revisionRows[0]?.master_id || '' });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const selectedLines = useMemo(() => lines.filter((line) => line.mbom_header_id === id), [lines, id]);
  const tree = useMemo(() => buildTree(selectedLines), [selectedLines]);
  const displayIndexById = useMemo(() => {
    const indexes = new Map<string, number>();
    const visit = (parent: string) => {
      (tree.get(parent) || []).forEach((line, index) => {
        indexes.set(line.master_id, index + 1);
        visit(line.master_id);
      });
    };
    visit('root');
    return indexes;
  }, [tree]);

  const createHeader = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await postResource('mbom-headers', headerForm, user);
      toast.success(t('mbom.createdHeader'));
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const createLine = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id) return;
    try {
      await postResource('mbom-lines', { ...lineForm, mbom_header_id: id, parent_line_id: lineForm.parent_line_id || null }, user);
      toast.success(t('mbom.addedLine'));
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const createSubstitute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedLine) return toast.error(t('mbom.chooseLineFirst'));
    try {
      await postResource('component-substitutes', { code: `SUB-${Date.now()}`, name: 'Component substitute', mbom_line_id: selectedLine, substitute_revision_id: subForm.substitute_revision_id, priority: Number(subForm.priority), attributes: { conversion_factor: subForm.conversion_factor, max_usage_percent: subForm.max_usage_percent, requires_approval: subForm.requires_approval } }, user);
      toast.success(t('mbom.addedSubstitute'));
      await load();
    } catch (err: any) {
      toast.error(err.message);
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
        setValidationErrors(err.validationFailures.map((failure: any) => validationMessage(failure, t)));
      } else {
        setValidationErrors(String(err.message).split('\n').filter(Boolean));
      }
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;

  if (!id) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg">
          <div className="flex items-center space-x-3"><div className="p-3 bg-action/10 border border-sky-500/20 rounded-lg text-sky-300"><Layers className="w-6 h-6" /></div><div><h1 className="text-xl font-bold">{t('nav.mbom')}</h1><p className="text-xs text-slate-400">{t('mbom.subtitle')}</p></div></div>
          <button onClick={load} className="p-2.5 bg-slate-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="flex justify-end"><Link to="/master-data/mboms/new" className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2.5 font-semibold text-white"><Plus className="h-4 w-4" />{t('common.create')}</Link></div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden"><table className="w-full text-sm text-left"><thead className="bg-slate-950 text-xs text-slate-400 uppercase"><tr><th className="px-5 py-3">MBOM</th><th className="px-5 py-3">{t('mbom.name')}</th><th className="px-5 py-3">{t('common.site')}</th><th className="px-5 py-3">{t('mbom.base')}</th><th className="px-5 py-3">{t('mbom.purpose')}</th><th className="px-5 py-3">{t('common.status')}</th><th className="px-5 py-3 text-right">{t('common.actions')}</th></tr></thead><tbody className="divide-y divide-slate-800">{mboms.map((mbom) => <tr key={mbom.master_id} className="hover:bg-slate-800/50"><td className="px-5 py-4 font-mono text-sky-300 font-bold">{mbom.code}</td><td className="px-5 py-4"><div className="font-semibold text-slate-100">{localizedText(mbom.name)}</div><div className="text-xs text-slate-400">{localizedText(mbom.description)}</div></td><td className="px-5 py-4">{mbom.site_code || t('common.notAvailable')}</td><td className="px-5 py-4">{mbom.base_quantity} {mbom.base_uom_code || t('common.notAvailable')}</td><td className="px-5 py-4">{mbom.purpose || 'Standard'}</td><td className="px-5 py-4"><span className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-full text-xs">{translatedEnum(t, 'status.master', status(mbom))}</span></td><td className="px-5 py-4 text-right space-x-2"><Link to={`/master-data/mboms/${mbom.master_id}`} className="inline-flex px-3 py-2 bg-slate-800 rounded-lg">{t('common.edit')} <ChevronRight className="w-4 h-4" /></Link>{normalizeStatusCode(status(mbom)) !== 'Released' && <button onClick={() => release(mbom.master_id)} className="px-3 py-2 bg-action rounded-lg inline-flex gap-1"><CheckCircle2 className="w-4 h-4" />{t('common.release')}</button>}</td></tr>)}</tbody></table></div>
        {validationErrors.length > 0 && <div className="bg-rose-950/40 border border-rose-800 rounded-lg p-4 text-sm text-rose-200">{validationErrors.map((msg) => <div key={msg}>{msg}</div>)}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg"><div><Link to="/master-data/mboms" className="text-xs text-sky-300">{t('mbom.backToList')}</Link><h1 className="text-xl font-bold">{selected?.code || t('mbom.detail')}</h1><p className="text-sm text-slate-200">{localizedText(selected?.name)}</p><p className="text-xs text-slate-400">{localizedText(selected?.description)}</p></div>{selected && normalizeStatusCode(status(selected)) !== 'Released' && <button onClick={() => release(selected.master_id)} className="px-4 py-2.5 bg-action rounded-lg font-semibold flex gap-2"><CheckCircle2 className="w-4 h-4" />{t('common.release')}</button>}</div>
      {validationErrors.length > 0 && <div className="bg-rose-950/40 border border-rose-800 rounded-lg p-4 text-sm text-rose-200">{validationErrors.map((msg) => <div key={msg}>{msg}</div>)}</div>}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_120px_100px_110px_120px] gap-3 px-4 py-3 bg-slate-950 text-xs uppercase text-slate-400"><div>{t('mbom.seq')}</div><div>{t('mbom.component')}</div><div>{t('mbom.qtyUom')}</div><div>{t('mbom.scrap')}</div><div>{t('mbom.exploded')}</div><div>{t('mbom.operation')}</div></div>
        {(tree.get('root') || []).map((line, index) => <LineNode key={line.master_id} line={line} displaySeq={index + 1} childMap={tree} revisions={revisions} uoms={uoms} operations={operations} substitutes={substitutes} t={t} />)}
        {selectedLines.length === 0 && <div className="p-8 text-center text-slate-500">{t('mbom.noLines')}</div>}
      </div>
      <form onSubmit={createLine} className="grid grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-900 border border-slate-800 rounded-lg p-4">
        <input type="number" value={lineForm.seq} onChange={(e) => setLineForm({ ...lineForm, seq: Number(e.target.value) })} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
        <SelectBase value={lineForm.parent_line_id} onValueChange={(value) => setLineForm({ ...lineForm, parent_line_id: value })} options={[{ value: '', label: t('mbom.rootLine') }, ...selectedLines.map((line) => ({ value: line.master_id, label: `${displayIndexById.get(line.master_id) || 0} ${revisions.find((rev) => rev.master_id === line.component_revision_id)?.code || ''}` }))]} aria-label={t('mbom.rootLine')} />
        <SelectBase value={lineForm.component_revision_id} onValueChange={(value) => setLineForm({ ...lineForm, component_revision_id: value })} options={revisions.map((rev) => ({ value: rev.master_id, label: rev.code }))} aria-label={t('mbom.component')} />
        <input value={lineForm.quantity_per} onChange={(e) => setLineForm({ ...lineForm, quantity_per: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
        <SelectBase value={lineForm.uom_id} onValueChange={(value) => setLineForm({ ...lineForm, uom_id: value })} options={uoms.map((uom) => ({ value: uom.master_id, label: uom.code }))} aria-label={t('mbom.qtyUom')} />
        <input value={lineForm.scrap_rate} onChange={(e) => setLineForm({ ...lineForm, scrap_rate: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
        <SelectBase value={lineForm.issue_operation_id} onValueChange={(value) => setLineForm({ ...lineForm, issue_operation_id: value })} options={operations.map((op) => ({ value: op.master_id, label: op.code }))} aria-label={t('mbom.operation')} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.backflush_flag} onChange={(e) => setLineForm({ ...lineForm, backflush_flag: e.target.checked })} />{t('mbom.flag.backflush')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.phantom_flag} onChange={(e) => setLineForm({ ...lineForm, phantom_flag: e.target.checked })} />{t('mbom.flag.phantom')}</label>
        <button className="bg-action rounded-lg font-semibold flex items-center justify-center gap-2"><Save className="w-4 h-4" />{t('mbom.addLine')}</button>
      </form>
      <form onSubmit={createSubstitute} className="grid grid-cols-2 lg:grid-cols-6 gap-3 bg-slate-900 border border-slate-800 rounded-lg p-4">
        <SelectBase value={selectedLine} onValueChange={setSelectedLine} options={[{ value: '', label: t('mbom.line') }, ...selectedLines.map((line) => ({ value: line.master_id, label: String(displayIndexById.get(line.master_id) || 0) }))]} aria-label={t('mbom.line')} />
        <SelectBase value={subForm.substitute_revision_id} onValueChange={(value) => setSubForm({ ...subForm, substitute_revision_id: value })} options={revisions.map((rev) => ({ value: rev.master_id, label: rev.code }))} aria-label={t('mbom.component')} />
        <input type="number" value={subForm.priority} onChange={(e) => setSubForm({ ...subForm, priority: Number(e.target.value) })} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
        <input value={subForm.conversion_factor} onChange={(e) => setSubForm({ ...subForm, conversion_factor: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={subForm.requires_approval} onChange={(e) => setSubForm({ ...subForm, requires_approval: e.target.checked })} />{t('mbom.approval')}</label>
        <button className="bg-slate-700 rounded-lg font-semibold">{t('mbom.addSubstitute')}</button>
      </form>
    </div>
  );
};
