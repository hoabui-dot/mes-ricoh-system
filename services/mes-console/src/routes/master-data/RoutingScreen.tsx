import React, { useEffect, useState } from 'react';
import { CheckCircle2, GitCommit, RefreshCw, X, ArrowDown, Clock3, Link2, Network } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Button } from '../../components/ui';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { fetchResource, gatewayBaseUrl } from '../../lib/masterDataApi';
import { translatedEnum, normalizeStatusCode } from '../../lib/i18nLabels';

function localizedText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  return String(item.vi || item.en || item.ja || item.ko || '');
}

function predecessorSequences(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return String(value).split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function displayPredecessors(value: unknown, operations: any[]): string[] {
  return predecessorSequences(value).map((sequence) => {
    const index = operations.findIndex((operation) => String(operation.seq) === String(sequence));
    return index >= 0 ? String(index + 1) : String(sequence);
  });
}

export const RoutingScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [routings, setRoutings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRouting, setSelectedRouting] = useState<any>(null);
  const [selectedOperation, setSelectedOperation] = useState<any>(null);
  const [routingOperations, setRoutingOperations] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchRoutings = async () => {
    setLoading(true);
    setError(null);
    try {
      setRoutings(await fetchResource('routing-headers', user));
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchRoutings(); }, [user?.userId]);

  const openDetail = async (routing: any) => {
    setSelectedRouting(routing);
    setSelectedOperation(null);
    setRoutingOperations([]);
    setDetailLoading(true);
    try {
      const rows = await fetchResource('routing-operations', user, '?limit=500');
      const related = rows.filter((row: any) => row.routing_header_id === routing.master_id).sort((a: any, b: any) => Number(a.seq) - Number(b.seq));
      setRoutingOperations(related);
      setSelectedOperation(related[0] || null);
    } catch (err: any) {
      toast.error(t('routing.detailFailed'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReleaseRouting = async (routingId: string) => {
    setSubmitting(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/master-data/routings/${routingId}/release`, { method: 'POST', headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' } });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || t('routing.releaseFailed'));
      }
      toast.success(t('routing.released'));
      await fetchRoutings();
    } catch (err: any) {
      toast.error(t('routing.releaseError', { message: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchRoutings} />;

  return <div className="mes-page">
    <div className="mes-page-header">
      <div className="flex items-center space-x-3"><Link to="/master-data/routings/new" className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2.5 font-semibold text-white">{t('common.create')}</Link><div className="mes-icon-tile"><GitCommit className="w-6 h-6" /></div><div><h1 className="text-xl font-bold text-slate-100">{t('routing.title')}</h1><p className="text-xs text-slate-400">{t('routing.subtitle')}</p></div></div>
      <Button onClick={fetchRoutings} variant="secondary" size="icon" title={t('common.refresh')}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
    </div>
    <div className="mes-table-wrap"><table className="mes-table"><thead><tr><th className="px-6 py-4">{t('routing.code')}</th><th className="px-6 py-4">{t('routing.name')}</th><th className="px-6 py-4">{t('routing.product')}</th><th className="px-6 py-4">{t('routing.type')}</th><th className="px-6 py-4">{t('routing.operations')}</th><th className="px-6 py-4">{t('common.status')}</th><th className="px-6 py-4 text-right">{t('routing.validationActions')}</th></tr></thead><tbody className="divide-y divide-slate-800/60">
      {routings.map((rt, index) => {
        const routingId = typeof rt.master_id === 'string' ? rt.master_id : '';
        const routingCode = rt.code || rt.routing_code || `ROUTING-${index + 1}`;
        const status = normalizeStatusCode(rt.status || rt.lifecycle_status || 'Draft');
        return <tr key={routingId || `${routingCode}-${index}`} onClick={() => void openDetail(rt)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void openDetail(rt); }} tabIndex={0} className="cursor-pointer hover:bg-slate-800/40 transition">
          <td className="px-6 py-4 font-mono font-bold text-amber-400">{routingCode}</td><td className="px-6 py-4"><div className="font-semibold text-slate-100">{localizedText(rt.name)}</div><div className="text-xs text-slate-400">{localizedText(rt.description)}</div></td><td className="px-6 py-4 text-slate-100 font-medium">{rt.item_code || rt.revision_code || '-'} <span className="text-slate-400">{rt.revision_code ? `· ${rt.revision_code}` : ''}</span></td><td className="px-6 py-4">{rt.routing_type || 'Standard'}</td><td className="px-6 py-4">{rt.operation_count ?? 0}</td><td className="px-6 py-4 whitespace-nowrap"><span className={`inline-flex whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold ${status === 'Released' ? 'bg-emerald-950/60 border border-emerald-800 text-amber-200' : 'bg-amber-950/60 border border-amber-800 text-amber-300'}`}>{translatedEnum(t, 'status.master', status)}</span></td><td className="px-6 py-4 text-right" onClick={(event) => event.stopPropagation()}>{status !== 'Released' && routingId && <Button onClick={() => handleReleaseRouting(routingId)} disabled={submitting} size="sm">{t('routing.release')}</Button>}</td>
        </tr>;
      })}
    </tbody></table></div>
    {selectedRouting && <RoutingDetailModal routing={selectedRouting} operations={routingOperations} selectedOperation={selectedOperation} detailLoading={detailLoading} onSelectOperation={setSelectedOperation} onClose={() => setSelectedRouting(null)} t={t} />}
  </div>;
};

function RoutingDetailModal({ routing, operations, selectedOperation, detailLoading, onSelectOperation, onClose, t }: { routing: any; operations: any[]; selectedOperation: any; detailLoading: boolean; onSelectOperation: (operation: any) => void; onClose: () => void; t: (key: string, params?: Record<string, any>) => string }) {
  const status = normalizeStatusCode(routing.status || routing.lifecycle_status || 'Draft');
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="routing-detail-title" onClick={onClose}>
    <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-700 bg-slate-900 px-6 py-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-lg font-bold text-amber-300">{routing.code}</span><span className="rounded-full border border-emerald-800 bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-amber-200">{t(`status.master.${status}`)}</span></div><h2 id="routing-detail-title" className="mt-1 truncate text-xl font-bold text-slate-100">{localizedText(routing.name)}</h2><p className="mt-1 text-sm text-slate-400">{localizedText(routing.description)}</p></div><button type="button" onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100" title={t('common.close')}><X className="h-5 w-5" /></button></header>
      <div className="overflow-y-auto p-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryCard label={t('routing.version')} value={routing.business_version || routing.version_no || '1'} /><SummaryCard label={t('routing.type')} value={routing.routing_type || 'Standard'} /><SummaryCard label={t('routing.detail.productRevision')} value={`${routing.item_code || '-'} · ${routing.revision_code || '-'}`} /><SummaryCard label={t('common.site')} value={routing.site_code || '-'} /><SummaryCard label={t('routing.detail.validity')} value={`${routing.effective_from ? new Date(routing.effective_from).toLocaleDateString() : '-'} → ${routing.effective_to ? new Date(routing.effective_to).toLocaleDateString() : '∞'}`} /><SummaryCard label={t('routing.detail.operationCount')} value={String(routing.operation_count ?? operations.length)} /><SummaryCard label={t('routing.detail.status')} value={t(`status.master.${status}`)} /><SummaryCard label={t('routing.detail.dependency')} value={operations.some((operation) => operation.predecessor_seq !== null && operation.predecessor_seq !== undefined) ? t('routing.detail.hasDependencies') : t('routing.detail.linearFlow')} /></div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]"><section><div className="mb-3 flex items-center gap-2"><Network className="h-4 w-4 text-action" /><h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">{t('routing.detail.flow')}</h3></div>{detailLoading ? <div className="flex min-h-40 items-center justify-center text-slate-400">{t('routing.detailLoading')}</div> : operations.length === 0 ? <div className="rounded-md border border-slate-800 p-8 text-center text-slate-500">{t('routing.noOperations')}</div> : <div className="space-y-0">{operations.map((operation, index) => { const predecessors = displayPredecessors(operation.predecessor_seq, operations); return <React.Fragment key={operation.master_id || operation.seq}><button type="button" onClick={() => onSelectOperation(operation)} className={`relative flex w-full items-start gap-4 rounded-md border p-4 text-left transition ${selectedOperation?.master_id === operation.master_id ? 'border-action bg-action/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'}`}><span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 font-mono text-sm font-bold text-amber-300">{index + 1}</span><span className="min-w-0 flex-1"><span className="block font-semibold text-slate-100">{localizedText(operation.operation_name) || operation.operation_code} <span className="font-mono text-xs text-slate-500">({operation.operation_code})</span></span><span className="mt-1 block text-xs text-slate-400">{localizedText(operation.operation_description) || t('routing.detail.noDescription')}</span><span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{operation.work_center_code || '-'}</span><span>{operation.confirmation_mode || '-'}</span>{predecessors.length > 0 ? <span className="inline-flex items-center gap-1 text-action"><Link2 className="h-3 w-3" />{t('routing.detail.followsSequence', { sequence: predecessors.join(', ') })}</span> : <span>{t('routing.detail.firstOrParallel')}</span>}</span></span></button>{index < operations.length - 1 && <div className="ml-6 flex h-8 items-center"><div className="h-full border-l border-dashed border-slate-600" /><ArrowDown className="-ml-1.5 h-4 w-4 text-slate-500" /></div>}</React.Fragment>; })}</div>}</section><OperationDetailPanel operation={selectedOperation} operations={operations} t={t} /></div>
      </div>
    </div>
  </div>;
}

function SummaryCard({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</div></div>; }

function OperationDetailPanel({ operation, operations, t }: { operation: any; operations: any[]; t: (key: string, params?: Record<string, any>) => string }) {
  if (!operation) return <aside className="rounded-md border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-500">{t('routing.detail.selectOperation')}</aside>;
  const rows: [string, string][] = [
    [t('mbom.seq'), String(Math.max(0, operations.findIndex((row) => row.master_id === operation.master_id) + 1))],
    [t('routing.operation'), `${localizedText(operation.operation_name) || operation.operation_code} (${operation.operation_code})`],
    [t('routing.detail.description'), localizedText(operation.operation_description) || t('routing.detail.noDescription')],
    [t('routing.workCenter'), `${operation.work_center_code || '-'} · ${localizedText(operation.work_center_name) || '-'}`],
    [t('routing.detail.schedulingMode'), operation.scheduling_mode || 'Finite'],
    [t('routing.detail.queueTime'), `${operation.queue_time_min ?? 0} min`],
    [t('routing.detail.moveTime'), `${operation.move_time_min ?? 0} min`],
    [t('routing.detail.overlap'), operation.overlap_allowed ? t('common.yes') : t('common.no')],
    [t('routing.detail.transferBatch'), operation.transfer_batch_qty == null ? t('common.notAvailable') : String(operation.transfer_batch_qty)],
    [t('routing.detail.milestone'), operation.milestone_flag ? t('common.yes') : t('common.no')],
    [t('routing.confirmation'), operation.confirmation_mode || '-'],
    [t('routing.scan'), operation.requires_material_scan ? t('common.yes') : t('common.no')],
    [t('routing.outputLabel'), operation.requires_output_label ? t('common.yes') : t('common.no')],
    [t('routing.detail.dependency'), displayPredecessors(operation.predecessor_seq, operations).length > 0 ? t('routing.detail.followsSequence', { sequence: displayPredecessors(operation.predecessor_seq, operations).join(', ') }) : t('routing.detail.firstOrParallel')],
  ];
  return <aside className="rounded-md border border-slate-700 bg-slate-950/50 p-5"><div className="mb-4 flex items-center gap-2"><Clock3 className="h-4 w-4 text-action" /><h3 className="font-semibold text-slate-100">{t('routing.detail.selectedOperation')}</h3></div><div className="space-y-3">{rows.map(([label, value]) => <div key={label} className="border-b border-slate-800 pb-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm text-slate-200">{value}</div></div>)}</div></aside>;
}
