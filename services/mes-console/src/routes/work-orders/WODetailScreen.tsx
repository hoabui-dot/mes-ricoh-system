import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { ClipboardList, ArrowLeft, XCircle, Calculator, ShieldCheck, RefreshCw, Loader2, Settings2, Check, ExternalLink, Play, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';
import { normalizeWorkOrderDetail, localizedText } from './workOrderDetail';
import { gatewayBaseUrl } from '../../lib/masterDataApi';
import { translateWorkOrderError } from '../../lib/errorMessages';
import { FieldHelpPopover } from '../../components/ui';
import { formatNumberForDisplay } from '../../lib/numeric/uomNumeric';

export const WODetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, hasRole } = useAuth();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();

  const [wo, setWo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const [computing, setComputing] = useState(false);
  const [computeResult, setComputeResult] = useState<any>(null);

  const [submittingAction, setSubmittingAction] = useState(false);
  const [stagingMaterials, setStagingMaterials] = useState(false);
  const [stageResults, setStageResults] = useState<any[] | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [selectedOperation, setSelectedOperation] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidateBlockers, setCandidateBlockers] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [showLineReplanModal, setShowLineReplanModal] = useState(false);
  const [lineReplanReason, setLineReplanReason] = useState('');

  const canApprove = hasRole('EXECUTIVE') || hasRole('PLANT_MANAGER') || hasRole('PROD_MANAGER');
  const canPlanResources = hasRole('EXECUTIVE') || hasRole('PLANT_MANAGER') || hasRole('PROD_MANAGER') || hasRole('PLANNER');
  const resourceOperations = Array.isArray(wo?.operations) ? wo.operations : [];
  const printOperations = resourceOperations.filter((operation: any) => operation.execution_target_type === 'PRINT_STATION' || operation.requires_output_label);
  const printJobs = Array.isArray(wo?.print_jobs) ? wo.print_jobs : [];
  const committedResourceCount = resourceOperations.filter((operation: any) => {
    const allocation = operation.resource_allocation;
    return allocation?.status === 'Committed' && ['Valid', 'ValidWithWarnings'].includes(allocation.validation_status);
  }).length;
  const resourcesReadyForApproval = resourceOperations.length > 0 && committedResourceCount === resourceOperations.length;
  const effectiveRole = user?.roles.find((role) => ['EXECUTIVE', 'PLANT_MANAGER', 'PROD_MANAGER', 'PLANNER', 'OPERATOR', 'VIEWER'].includes(role)) || user?.roles[0] || 'PLANT_MANAGER';
  const plannedStartForOperation = (operation: any) => {
    if (operation.resource_allocation?.planned_start_at) return operation.resource_allocation.planned_start_at;
    const computedStart = computeResult?.operations?.find((computed: any) => computed.sequence_no === operation.sequence_no)?.planned_start_at;
    let startMs = new Date(computedStart || wo?.planned_start_at || Date.now()).getTime();
    for (const previous of resourceOperations.filter((candidate: any) => candidate.sequence_no < operation.sequence_no)) {
      const previousEnd = previous.resource_allocation?.planned_end_at ? new Date(previous.resource_allocation.planned_end_at).getTime() : 0;
      if (Number.isFinite(previousEnd)) startMs = Math.max(startMs, previousEnd);
    }
    return new Date(startMs).toISOString();
  };
  const detailLabel = (label: string, helpKey: string) => <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-semibold uppercase">{label}<FieldHelpPopover label={label} title={label} content={t(helpKey)} /></span>;
  const apiHeaders = (extra: Record<string, string> = {}) => ({ 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': effectiveRole, 'X-Trace-ID': `mes-console-${Date.now()}`, ...extra });
  const parseApiError = async (response: Response, fallbackKey: string) => {
    const body = await response.json().catch(() => ({}));
    return translateWorkOrderError(body.message || body.error, t) || t(fallbackKey);
  };
  const allocationStatusLabel = (status?: string | null) => status ? translatedEnum(t, 'allocation.status', status) : t('woDetail.resourceNotAllocated');
  const readinessLabel = (status?: string | null) => status ? translatedEnum(t, 'resourceReadiness.status', status) : t('common.notAvailable');
  const lineResultStatusClass = (status?: string) => status === 'Ready' ? 'border-emerald-700 text-emerald-300' : 'border-rose-800 text-rose-300';
  const evaluatedLineResults = Array.isArray(wo?.evaluated_line_results) ? wo.evaluated_line_results : [];
  const lineLocked = Boolean(wo?.line_locked_at);
  const canReplanLine = canPlanResources && ['Draft', 'PendingApproval', 'Released', 'ResourceHold'].includes(wo?.status);
  const lineReplanBlockedAfterStart = ['InProgress', 'Completed', 'Closed'].includes(wo?.status);
  const lineSelectionLabel = (group: 'status' | 'mode' | 'role' | 'reason', value?: string | null) => {
    if (!value) return t('common.notAvailable');
    const key = `lineSelection.${group}.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  const fetchWODetail = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}`, {
        headers: apiHeaders(),
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error(t('woDetail.loadFailed'));
      }
      const data = await resp.json();
      setWo(normalizeWorkOrderDetail(data));
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStageMaterials = async () => {
    if (!id) return;
    setStagingMaterials(true);
    try {
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/stage-materials`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok && resp.status !== 409) throw new Error(translateWorkOrderError(body.message || body.error, t) || t('woDetail.stageFailed'));
      setStageResults(Array.isArray(body.results) ? body.results : []);
      toast[resp.status === 409 ? 'warning' : 'success'](resp.status === 409 ? t('woDetail.stageShortage') : t('woDetail.staged'));
      await fetchWODetail();
    } catch (err: any) {
      toast.error(t('woDetail.stageError', { message: err.message || t('common.unknownError') }));
    } finally {
      setStagingMaterials(false);
    }
  };

  useEffect(() => {
    fetchWODetail();
  }, [id]);

  const handleComputeCheck = async () => {
    if (!id) return;
    setComputing(true);
    try {
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/compute-check`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      const resData = await resp.json().catch(() => ({}));
      if (!resp.ok && resp.status !== 409) {
        throw new Error(translateWorkOrderError(resData.message || resData.error, t) || t('woDetail.computeFailed'));
      }
      setComputeResult(resData.data || resData);
      toast[resp.status === 409 ? 'warning' : 'success'](resp.status === 409 ? t('woDetail.capacityWarnings') : t('woDetail.computed'));
      await fetchWODetail();
    } catch (err: any) {
      toast.error(t('woDetail.computeError', { message: err.message }));
    } finally {
      setComputing(false);
    }
  };

  const loadCandidates = async (operation: any) => {
    setSelectedOperation(operation); setCandidates([]); setCandidateBlockers([]); setLoadingCandidates(true);
    try {
      const params = new URLSearchParams({ planned_start_at: plannedStartForOperation(operation), ...(operation.resource_allocation?.planned_shift_id ? { shift_id: operation.resource_allocation.planned_shift_id } : {}) });
        const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/operations/${operation.wo_operation_id}/resource-candidates?${params}`, { headers: apiHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(translateWorkOrderError(body.message || body.error, t) || t('woDetail.resourcePlanningLoadFailed'));
      setCandidateBlockers(Array.isArray(body.blocking_errors) ? body.blocking_errors : []);
      setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
    } catch (err: any) { toast.error(err.message || t('woDetail.resourcePlanningLoadFailed')); }
    finally { setLoadingCandidates(false); }
  };

  const commitCandidate = async (candidate: any) => {
    if (!selectedOperation) return; setAllocating(true);
    try {
      const start = plannedStartForOperation(selectedOperation);
      const hasAllocation = Boolean(selectedOperation.resource_allocation?.allocation_id);
      const endpoint = hasAllocation ? 'reallocate' : 'resource-allocation';
      const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/operations/${selectedOperation.wo_operation_id}/${endpoint}`, { method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': `${endpoint}-${id}-${selectedOperation.wo_operation_id}-${candidate.machine_group?.id || candidate.equipment?.id || candidate.workstation?.id}-${start}` }), body: JSON.stringify({ workstation_id: candidate.workstation?.id, equipment_id: candidate.primary_machine?.id || candidate.equipment?.id, machine_group_id: candidate.machine_group?.id, shift_id: selectedOperation.resource_allocation?.planned_shift_id || wo.shift_id, planned_start_at: start, candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`, row_version: wo.row_version, change_reason: hasAllocation ? t('woDetail.reallocateReason') : undefined }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(translateWorkOrderError(body.message || body.error, t) || t('woDetail.resourceAllocationFailed'));
      toast.success(t(hasAllocation ? 'woDetail.resourceReallocated' : 'woDetail.resourceAllocated')); setSelectedOperation(null); await fetchWODetail();
    } catch (err: any) { toast.error(err.message || t('woDetail.resourceAllocationFailed')); } finally { setAllocating(false); }
  };

  const handleRevalidateAllocations = async () => {
    if (!id) return;
    setSubmittingAction(true);
    try {
      const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/resource-allocations/revalidate`, { method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json' }), body: '{}' });
      if (!response.ok) throw new Error(await parseApiError(response, 'woDetail.revalidateFailed'));
      const body = await response.json().catch(() => ({}));
      toast[body.valid ? 'success' : 'warning'](body.valid ? t('woDetail.revalidated') : t('woDetail.revalidateInvalid'));
      await fetchWODetail();
    } catch (err: any) {
      toast.error(err.message || t('woDetail.revalidateFailed'));
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleStartExecution = async () => {
    if (!id) return;
    setSubmittingAction(true);
    try {
      const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/start-execution`, { method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json' }), body: '{}' });
      if (!response.ok) throw new Error(await parseApiError(response, 'woDetail.startExecutionFailed'));
      toast.success(t('woDetail.executionStarted'));
      await fetchWODetail();
    } catch (err: any) {
      toast.error(err.message || t('woDetail.startExecutionFailed'));
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleLineReplan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || !lineReplanReason.trim()) {
      toast.error(t('woDetail.lineReplanReasonRequired'));
      return;
    }
    setSubmittingAction(true);
    try {
      const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/line-replan`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ reason: lineReplanReason.trim(), row_version: wo.row_version }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(translateWorkOrderError(body.message || body.error, t) || t('woDetail.lineReplanFailed'));
      toast.success(t('woDetail.lineReplanned'));
      setShowLineReplanModal(false);
      setLineReplanReason('');
      await fetchWODetail();
    } catch (err: any) {
      toast.error(err.message || t('woDetail.lineReplanFailed'));
    } finally {
      setSubmittingAction(false);
    }
  };

  const cancelAllocation = async (operation: any, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!id || !operation.resource_allocation?.allocation_id || !window.confirm(t('woDetail.cancelAllocationConfirm'))) return;
    setSubmittingAction(true);
    try {
      const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/operations/${operation.wo_operation_id}/resource-allocation`, { method: 'DELETE', headers: apiHeaders() });
      if (!response.ok) throw new Error(await parseApiError(response, 'woDetail.cancelAllocationFailed'));
      toast.success(t('woDetail.allocationCancelled'));
      await fetchWODetail();
    } catch (err: any) {
      toast.error(err.message || t('woDetail.cancelAllocationFailed'));
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    setSubmittingAction(true);
    try {
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/approve`, {
        method: 'POST',
        headers: apiHeaders({
          'Content-Type': 'application/json',
          'X-MES-Approval-Policy': 'Strict',
        }),
        body: JSON.stringify({ approver_user_id: user?.userId, comment: t('woDetail.approveComment') }),
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(translateWorkOrderError(errJson.message || errJson.error, t) || t('woDetail.approveFailed'));
      }
      const approval = await resp.json().catch(() => ({}));
      toast.success(t('woDetail.approved', { code: wo?.wo_code || '' }));
      if (Array.isArray(approval.warnings) && approval.warnings.length > 0) toast.warning(t('woDetail.approvedWithoutResources'));
      await fetchWODetail();
    } catch (err: any) {
      if (err.status === 503) {
        setError(err);
      } else {
        toast.error(t('woDetail.approveError', { message: translateWorkOrderError(err.message, t) }));
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectComment) {
      toast.error(t('woDetail.rejectRequired'));
      return;
    }
    setSubmittingAction(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER',
        },
        body: JSON.stringify({ approver_user_id: user?.userId, comment: rejectComment }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(translateWorkOrderError(errJson.message || errJson.error, t) || t('woDetail.rejectFailed'));
      }
      toast.success(t('woDetail.rejected'));
      setShowRejectModal(false);
      await fetchWODetail();
    } catch (err: any) {
      toast.error(t('woDetail.rejectError', { message: translateWorkOrderError(err.message, t) }));
    } finally {
      setSubmittingAction(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchWODetail} />;
  if (loading || !wo) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-action animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/work-orders')}
          className="px-3.5 py-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-md text-sm font-semibold flex items-center space-x-2 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('woDetail.backToList')}</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleComputeCheck}
            disabled={computing}
            className="px-4 py-2.5 bg-action hover:bg-action-hover text-white font-semibold text-sm rounded-md flex items-center space-x-2 transition shadow-lg shadow-orange-600/20"
          >
            {computing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            <span>{t('woDetail.compute')}</span>
          </button>

          {!wo.demo_print_on_approval && (wo.status === 'Released' || wo.status === 'InProgress') && (
            <button
              onClick={handleStageMaterials}
              disabled={stagingMaterials}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-action/60 text-amber-200 font-semibold text-sm rounded-md flex items-center space-x-2 transition"
            >
              {stagingMaterials ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheckIcon />}
              <span>{t('woDetail.stageMaterials')}</span>
            </button>
          )}

          {canApprove && wo.status === 'Draft' && (
            <>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={submittingAction || !resourcesReadyForApproval}
                title={!resourcesReadyForApproval ? t('woDetail.resourceApprovalBlocked') : undefined}
                className="px-4 py-2.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold text-sm rounded-md flex items-center space-x-2 transition"
              >
                <XCircle className="w-4 h-4" />
                <span>{t('woDetail.reject')}</span>
              </button>
              <button
                onClick={handleApprove}
                disabled={submittingAction}
                className="px-5 py-2.5 bg-action hover:bg-action-hover text-white font-bold text-sm rounded-md flex items-center space-x-2 transition shadow-lg shadow-orange-600/20"
              >
                {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{t('woDetail.approve')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-action/10 border border-action/20 rounded-md text-amber-300">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold font-mono text-amber-300">{wo.wo_code}</h1>
                <span className="px-3 py-1 bg-primary border border-primary text-amber-100 text-xs font-bold rounded-full">
                  {translatedEnum(t, 'status.wo', wo.status)}
                </span>
              </div>
              <p className="text-xs text-slate-400">{localizedText(wo.item_name) || t('woDetail.productDescription')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            {detailLabel(t('productionVersion.itemCode'), 'woDetail.help.itemCode')}
            <span className="font-bold text-slate-100 font-mono">{wo.item_code}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            {detailLabel(t('wo.quantity'), 'woDetail.help.quantity')}
            <span className="font-bold text-slate-100 font-mono">{wo.quantity} {wo.uom || t('uom.pcs')}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            {detailLabel(t('wo.targetDate'), 'woDetail.help.targetDate')}
            <span className="font-bold text-slate-100 font-mono">
              {wo.target_completion_date ? formatDate(wo.target_completion_date) : t('common.notAvailable')}
            </span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            {detailLabel(t('woDetail.stockCheck'), 'woDetail.help.stockCheck')}
            <span className="font-bold text-action font-mono">{translatedEnum(t, 'stock.status', wo.stock_check_status || 'AVAILABLE')}</span>
          </div>
        </div>
      </div>

      {wo.demo_print_on_approval && printOperations.length > 0 && (
        <section className="bg-slate-900 border border-action/50 rounded-md p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-100">{t('woDetail.printSummary')}</h2>
              <p className="text-xs text-slate-400">{t('woDetail.printSummaryHelp')}</p>
            </div>
            <span className="rounded-full border border-amber-700/70 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-200">{t('woDetail.demoPrintMode')}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {printOperations.map((operation: any) => {
              const base = Number(operation.base_quantity || operation.units_per_label || 0);
              const cycles = base > 0 ? Math.ceil(Number(wo.quantity || 0) / base) : 0;
              const labels = Number(operation.label_count || cycles);
              const copies = Number(operation.print_copies || labels * Number(operation.copies_per_label || 1));
              const job = printJobs.find((candidate: any) => candidate.wo_operation_id === operation.wo_operation_id);
              return <div key={operation.wo_operation_id} className="rounded-md border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-start justify-between gap-3"><div><div className="text-xs text-slate-500">{operation.sequence_no} · {operation.operation_code}</div><div className="font-semibold text-amber-200">{localizedText(operation.operation_name) || operation.operation_code}</div></div><span className="rounded border border-slate-700 px-2 py-1 text-xs text-emerald-300">{job?.status || operation.print_status || t('woDetail.printQueued')}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><span className="text-slate-500">{t('woDetail.requestedOutputQty')}</span><strong className="text-slate-200">{wo.quantity}</strong><span className="text-slate-500">{t('woDetail.standardBaseQty')}</span><strong className="text-slate-200">{base || t('common.notAvailable')}</strong><span className="text-slate-500">{t('woDetail.operationCycleCount')}</span><strong className="text-slate-200">{cycles}</strong><span className="text-slate-500">{t('woDetail.labelCount')}</span><strong className="text-slate-200">{labels}</strong><span className="text-slate-500">{t('woDetail.printCopies')}</span><strong className="text-slate-200">{copies}</strong><span className="text-slate-500">{t('woDetail.printSuccess')}</span><strong className="text-emerald-300">{job?.successful_copies ?? 0} / {copies}</strong></div>
              </div>;
            })}
          </div>
        </section>
      )}

      <section className="bg-slate-900 border border-slate-800 rounded-md p-6 space-y-4" data-testid="work-order-line-selection-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-100">{t('woDetail.productionLinePlanning')}</h2>
            <p className="mt-1 text-xs text-slate-400">{t('woDetail.oneWorkOrderOneLine')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded border px-2.5 py-1 text-xs font-semibold ${wo.line_selection_status === 'READY' ? 'border-emerald-700 text-emerald-300' : wo.line_selection_status === 'RESOURCE_HOLD' ? 'border-rose-800 text-rose-300' : 'border-slate-700 text-slate-300'}`}>
              {lineSelectionLabel('status', wo.line_selection_status || 'NOT_EVALUATED')}
            </span>
            {canReplanLine && <button data-testid="line-replan-button" type="button" onClick={() => setShowLineReplanModal(true)} className="inline-flex items-center gap-2 rounded-md border border-action/60 bg-action/10 px-3 py-2 text-xs font-semibold text-amber-200"><RefreshCw className="h-4 w-4" />{t('woDetail.lineReplan')}</button>}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">{t('woDetail.selectedProductionLine')}</div>
            <div className="mt-1 font-semibold text-amber-200">{localizedText(wo.selected_production_line_name_i18n) || wo.selected_production_line_code || t('common.notAvailable')}</div>
            {wo.selected_production_line_code && <div className="font-mono text-xs text-slate-500">{wo.selected_production_line_code}</div>}
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3"><div className="text-xs font-semibold uppercase text-slate-500">{t('woDetail.lineSelectionMode')}</div><div className="mt-1 font-semibold text-slate-100">{lineSelectionLabel('mode', wo.line_selection_mode || 'AUTO')}</div></div>
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3"><div className="text-xs font-semibold uppercase text-slate-500">{t('woDetail.lineLockState')}</div><div className={lineLocked ? 'mt-1 font-semibold text-emerald-300' : 'mt-1 font-semibold text-slate-300'}>{lineLocked ? t('woDetail.lineLocked') : t('woDetail.lineUnlocked')}</div></div>
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3"><div className="text-xs font-semibold uppercase text-slate-500">{t('woDetail.fallbackReason')}</div><div className="mt-1 font-semibold text-slate-100">{wo.fallback_reason ? lineSelectionLabel('reason', wo.fallback_reason) : t('common.none')}</div></div>
        </div>
        {wo.line_selection_status === 'RESOURCE_HOLD' && <div data-testid="line-resource-hold-warning" className="rounded-md border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{t('woDetail.resourceHold')}</div><p className="mt-1 text-xs text-rose-100">{translateWorkOrderError(wo.resource_hold_reason?.code, t) || wo.resource_hold_reason?.code || t('woDetail.lineNotReady')}</p></div>}
        <div className="grid gap-3 md:grid-cols-2">
          {evaluatedLineResults.map((result: any) => (
            <div key={`${result.production_line_id}-${result.selection_role}`} className={`rounded-md border bg-slate-950 p-3 ${lineResultStatusClass(result.status)}`} data-testid={`line-result-${String(result.selection_role || '').toLowerCase()}`}>
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-xs font-semibold uppercase text-slate-500">{lineSelectionLabel('role', result.selection_role || '')}</div><div className="font-semibold text-slate-100">{result.production_line_code || t('common.notAvailable')}</div></div>
                <span className="text-xs font-semibold">{translatedEnum(t, 'resourceReadiness.status', result.status || 'Unknown')}</span>
              </div>
              {(result.blockers || []).map((blocker: any) => <div key={`${blocker.code}-${blocker.operation_code}`} className="mt-2 text-xs text-rose-300" data-testid="line-blocking-reason">{translateWorkOrderError(blocker.code, t) || blocker.code}{blocker.operation_code ? ` · ${blocker.operation_code}` : ''}</div>)}
            </div>
          ))}
        </div>
        {lineReplanBlockedAfterStart && <p className="text-xs text-slate-400">{t('woDetail.lineTransferRequiresExecutionSegment')}</p>}
      </section>

      {/* Inline Compute & Check Results */}
      {computeResult && (
        <div className="bg-primary/40 border border-primary/80 rounded-md p-6 space-y-3" data-testid="work-order-compute-result">
          <div className="flex items-center space-x-2 text-amber-100 font-bold text-sm">
            <Calculator className="w-5 h-5" />
            <span className="inline-flex items-center gap-1">{t('woDetail.computeResult')}<FieldHelpPopover label={t('woDetail.computeResult')} title={t('woDetail.computeResult')} content={t('woDetail.help.resourcePlanning')} /></span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs font-mono">
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block inline-flex items-center gap-1">{t('woDetail.totalDuration')}<FieldHelpPopover label={t('woDetail.totalDuration')} title={t('woDetail.totalDuration')} content={t('woDetail.help.resourcePlanning')} /></span>
              <span className="text-amber-100 font-bold text-sm">
                {computeResult.total_duration_minutes ?? computeResult.total_estimated_minutes ?? computeResult.estimated_minutes ?? t('common.notAvailable')} {t('woDetail.minutes')}
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block inline-flex items-center gap-1">{t('woDetail.capacityStatus')}<FieldHelpPopover label={t('woDetail.capacityStatus')} title={t('woDetail.capacityStatus')} content={t('woDetail.help.resourcePlanning')} /></span>
              <span className="text-action font-bold text-sm">
                {computeResult.capacity_status ? translatedEnum(t, 'capacity.status', computeResult.capacity_status) : computeResult.capacity_warnings?.length ? t('woDetail.capacityWarnings') : t('woDetail.capacityNotEvaluated')}
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block inline-flex items-center gap-1">{t('woDetail.suggestedStart')}<FieldHelpPopover label={t('woDetail.suggestedStart')} title={t('woDetail.suggestedStart')} content={t('woDetail.help.targetDate')} /></span>
              <span className="text-slate-200 font-bold text-sm">{t('woDetail.immediate')}</span>
            </div>
          </div>
        </div>
      )}

      {computeResult?.labor_assignments?.length > 0 && <div className="bg-slate-900 border border-action/40 rounded-md p-6 space-y-3"><h3 className="text-base font-bold text-slate-100">{t('woDetail.laborAssignments')}</h3><p className="text-xs text-slate-400">{t('woDetail.help.laborAssignments')}</p><div className="grid gap-2 md:grid-cols-2">{computeResult.labor_assignments.map((assignment: any, index: number) => <div key={`${assignment.employee_code}-${assignment.skill_code}-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm"><div className="grid gap-2 sm:grid-cols-2"><div><span className="block text-xs text-slate-500">{t('woDetail.employee')}</span><div className="font-semibold text-amber-200">{assignment.employee_code}</div><div className="text-slate-300">{typeof assignment.employee_name === 'object' ? localizedText(assignment.employee_name) : assignment.employee_name || t('common.notAvailable')}</div></div><div><span className="block text-xs text-slate-500">{t('woDetail.skill')}</span><div className="text-slate-200">{assignment.skill_code || t('common.notAvailable')}</div><div className="text-xs text-slate-400">{t('woDetail.matchedLevel')}: {assignment.matched_level || t('common.notAvailable')}</div></div></div><div className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-400"><span className="font-semibold text-slate-300">{t('common.operation')}:</span> {assignment.operation_code || t('common.notAvailable')} · <span className="font-semibold text-slate-300">{t('woDetail.assignmentStatus')}:</span> {assignment.status || t('common.notAvailable')}</div></div>)}</div></div>}

      {stageResults && (
        <div className="bg-slate-900 border border-action/40 rounded-md p-6 space-y-3">
          <h3 className="text-base font-bold text-slate-100">{t('woDetail.materialRequestResults')}</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {stageResults.length === 0 ? <p className="text-sm text-slate-400">{t('woDetail.noMaterialRequirements')}</p> : stageResults.map((result) => {
              const material = wo.material_requirements.find((entry: any) => entry.requirement_id === result.requirement_id) as any;
              const response = result.response as any;
              return (
              <div key={result.requirement_id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 p-3 text-sm">
                <span className="min-w-0"><span className="block font-semibold text-slate-100">{localizedText(material?.item_name) || response?.item_name || material?.component_item_code || t('common.notAvailable')}</span><span className="block font-mono text-xs text-slate-500">{material?.component_item_code || response?.item_code || ''}</span><span className="mt-1 block text-xs text-slate-400">{material?.required_qty ?? response?.requested_qty ?? '-'} {material?.uom_code || response?.uom_code || t('uom.pcs')} · {localizedText(material?.work_center_name) || response?.work_center_name || material?.work_center_code || ''}</span><span className="block font-mono text-xs text-slate-500">{response?.request_code || t('common.notAvailable')}</span></span>
                <span className={result.status === 'Shortage' ? 'ml-3 text-rose-300' : 'ml-3 text-action'}>{translatedEnum(t, 'materialRequest.status', result.status)}</span>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Exploded Operations List */}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 space-y-4" data-testid="work-order-resource-planning-tab">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 inline-flex items-center gap-1">
              {t('woDetail.resourcePlanningTitle')}
              <FieldHelpPopover label={t('woDetail.resourcePlanningTitle')} title={t('woDetail.resourcePlanningTitle')} content={t('woDetail.help.resourcePlanning')} />
            </h3>
            <p className="text-xs text-slate-400 mt-1">{t('woDetail.resourcePlanningSubtitle')}</p>
            <p className={`mt-1 text-xs font-semibold ${resourcesReadyForApproval ? 'text-emerald-300' : 'text-amber-300'}`}>{t('woDetail.resourceProgress', { committed: committedResourceCount, total: resourceOperations.length })}{!resourcesReadyForApproval && ` · ${t('woDetail.resourceApprovalBlocked')}`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button data-testid="resource-revalidate-button" type="button" onClick={handleRevalidateAllocations} disabled={submittingAction} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"><RefreshCw className="h-4 w-4" />{t('woDetail.revalidateAllocations')}</button>
            {(wo.status === 'Released' || wo.status === 'InProgress') && <button data-testid="work-order-start-execution-button" type="button" onClick={handleStartExecution} disabled={submittingAction} className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-950/50 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"><Play className="h-4 w-4" />{t('woDetail.startExecution')}</button>}
            <button type="button" onClick={() => { const first = (wo.operations || []).find((op: any) => !op.resource_allocation?.allocation_id); if (first) loadCandidates(first); }} className="inline-flex items-center gap-2 rounded-md border border-action/60 bg-action/10 px-3 py-2 text-xs font-semibold text-amber-200"><Settings2 className="h-4 w-4" />{t('woDetail.resourceRecommend')}</button>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2" data-testid="work-order-operation-list">
          {(wo.operations || []).map((op: any) => {
            const allocation = op.resource_allocation;
            const hasAllocation = Boolean(allocation?.allocation_id);
            return (
              <div data-testid={`work-order-operation-row-${op.wo_operation_id}`} key={op.wo_operation_id} className="rounded-md border border-slate-800 bg-slate-950 p-3 hover:border-action/70">
                <button type="button" onClick={() => loadCandidates(op)} className="flex w-full items-center justify-between text-left">
                  <span>
                    <span className="block text-xs text-slate-500">{op.sequence_no} · {localizedText(op.operation_name) || op.operation_code}</span>
                    <span className="block text-sm text-slate-200">{hasAllocation ? t('woDetail.resourceAllocated') : t('woDetail.resourceNotAllocated')}</span>
                    <span className="block text-xs text-slate-500">{t('woDetail.selectedProductionLine')}: {op.production_line_code || wo.selected_production_line_code || t('common.notAvailable')}</span>
                    {allocation?.planned_start_at && <span className="block text-xs text-slate-500">{formatDate(allocation.planned_start_at)} - {formatDate(allocation.planned_end_at)}</span>}
                  </span>
                  <span data-testid={`allocation-status-${op.wo_operation_id}`} className={`rounded border px-2 py-1 text-xs ${allocation?.validation_status === 'Stale' ? 'border-rose-700 text-rose-300' : hasAllocation ? 'border-emerald-700 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>{allocationStatusLabel(allocation?.status)}</span>
                </button>
                {hasAllocation && wo.status === 'Draft' && (
                  <div className="mt-3 flex justify-end gap-2">
                    <button data-testid={`allocation-reallocate-button-${op.wo_operation_id}`} type="button" onClick={() => loadCandidates(op)} className="inline-flex items-center gap-1 rounded border border-action/50 px-2 py-1 text-xs text-amber-200"><RotateCcw className="h-3.5 w-3.5" />{t('woDetail.reallocate')}</button>
                    <button data-testid={`allocation-cancel-button-${op.wo_operation_id}`} type="button" onClick={(event) => cancelAllocation(op, event)} className="inline-flex items-center gap-1 rounded border border-rose-800 px-2 py-1 text-xs text-rose-300"><Trash2 className="h-3.5 w-3.5" />{t('woDetail.cancelAllocation')}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedOperation && <div data-testid="candidate-workstation-list" className="bg-slate-900 border border-action/50 rounded-md p-6 space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-100">{localizedText(selectedOperation.operation_name) || selectedOperation.operation_code}</h3><p className="text-xs text-slate-400">{t('woDetail.resourceCandidatesSubtitle')}</p><p className="mt-1 text-xs text-amber-200">{t('woDetail.selectedProductionLine')}: {selectedOperation.production_line_code || wo.selected_production_line_code || t('common.notAvailable')}</p></div><button type="button" onClick={() => setSelectedOperation(null)} className="text-xs text-slate-400 hover:text-white">{t('common.cancel')}</button></div>{loadingCandidates ? <Loader2 className="h-5 w-5 animate-spin text-action" /> : candidates.length === 0 ? <>{candidateBlockers.map((blocker: any) => <p data-testid="candidate-blocking-reasons" key={blocker.code} className="text-sm text-rose-300">{translateWorkOrderError(blocker.code, t) || blocker.message || blocker.code}</p>)}<p className="text-sm text-slate-400">{t('woDetail.resourceNoCandidates')}</p></> : <div className="grid gap-3 md:grid-cols-2">{candidates.map((candidate, index) => <div data-testid={`candidate-workstation-card-${candidate.workstation?.id || candidate.equipment?.id || index}`} key={`${candidate.machine_group?.id || candidate.equipment?.id || candidate.workstation?.id}-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-4"><div className="flex items-center justify-between"><div><span className="text-xs font-bold text-amber-300">#{index + 1}</span><h4 className="font-semibold text-slate-100">{localizedText(candidate.machine_group?.name) || localizedText(candidate.equipment?.name) || candidate.equipment?.code || localizedText(candidate.workstation?.name) || candidate.workstation?.code || t('common.notAvailable')}</h4><p className="text-xs text-slate-500">{t('woDetail.resourceMachineGroup')}: {candidate.machine_group?.code || candidate.equipment?.code || candidate.workstation?.code || t('common.notAvailable')}</p><p className="text-xs text-slate-500">{t('woDetail.selectedProductionLine')}: {selectedOperation.production_line_code || wo.selected_production_line_code || t('common.notAvailable')}</p></div><div className="flex items-center gap-2"><span data-testid="candidate-workstation-status" className={candidate.readiness === 'Ready' || candidate.readiness === 'Eligible' ? 'text-emerald-300' : candidate.readiness === 'ReadyWithWarnings' ? 'text-amber-300' : 'text-rose-300'}>{t('woDetail.resourceReadiness')}: {readinessLabel(candidate.readiness)}</span>{candidate.equipment?.id ? <Link to={`/master-data/machines/${candidate.equipment.id}`} title={t('resourceFoundation.openEquipment')} className="rounded p-1 text-amber-300 hover:bg-slate-800"><ExternalLink className="h-4 w-4" /></Link> : null}</div></div>{candidate.primary_machine && <div data-testid="candidate-machine-requirement" className="mt-2 text-xs text-slate-300">{t('resourceFoundation.primaryMachine')}: {localizedText(candidate.primary_machine.name) || candidate.primary_machine.code} · {candidate.primary_machine.unit_code || ''}</div>}{candidate.supporting_machines?.length ? <div className="mt-1 text-xs text-slate-400">{t('resourceFoundation.supportingMachines')}: {candidate.supporting_machines.map((member: any) => member.code).join(', ')}</div> : null}<div className="mt-3 space-y-1 text-xs text-slate-400">{candidate.equipment_readiness ? <div className="mb-2 rounded border border-slate-800 p-2"><div>{t('resourceFoundation.machineUnits')}: {readinessLabel(candidate.equipment_readiness.machine_unit?.status)}</div><div>{t('resourceFoundation.assignments')}: {readinessLabel(candidate.equipment_readiness.assignment?.status)}</div><div>{t('resourceFoundation.capabilities')}: {readinessLabel(candidate.equipment_readiness.capability?.status)}</div><div>{t('resourceFoundation.calendars')}: {readinessLabel(candidate.equipment_readiness.calendar?.status)}</div><div>{t('resourceFoundation.capacity')}: {readinessLabel(candidate.equipment_readiness.capacity?.status)}</div></div> : null}<div>{t('woDetail.resourceDuration')}: {formatNumberForDisplay(candidate.estimated_duration_min ?? candidate.calculation?.estimated_duration_min)} min</div><div>{t('woDetail.resourceCapacity')}: {formatNumberForDisplay(candidate.calendar?.available_minutes)} min</div>{(candidate.blocking_errors || []).map((blocker: any) => <div data-testid="candidate-blocking-reasons" key={blocker.code} className="text-rose-300">{translateWorkOrderError(blocker.code, t) || blocker.message || blocker.code}</div>)}{(candidate.warnings || []).map((warning: any) => <div key={warning.code} className="text-amber-300">{translateWorkOrderError(warning.code, t) || warning.message || warning.code}</div>)}{(candidate.capacity_conflicts || []).map((conflict: any) => <div data-testid="candidate-blocking-reasons" key={conflict.code} className="text-rose-300">{translateWorkOrderError(conflict.code, t) || conflict.message || conflict.code}</div>)}</div><button data-testid="candidate-select-button" type="button" disabled={!canPlanResources || allocating || candidate.readiness === 'Blocked' || (candidate.capacity_conflicts || []).length > 0} onClick={() => commitCandidate(candidate)} className="mt-4 inline-flex items-center gap-2 rounded-md bg-action px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />{selectedOperation.resource_allocation?.allocation_id ? t('woDetail.reallocate') : t('woDetail.resourceSelect')}</button></div>)}</div>}</div>}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider text-xs inline-flex items-center gap-1">
          {t('woDetail.operationsTitle')}<FieldHelpPopover label={t('woDetail.operationsTitle')} title={t('woDetail.operationsTitle')} content={t('woDetail.help.operations')} />
        </h3>
        <div className="border border-slate-800 rounded-md overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
              <tr>
                <th className="px-5 py-3"><span className="inline-flex items-center gap-1">{t('mbom.seq')}<FieldHelpPopover label={t('mbom.seq')} title={t('mbom.seq')} content={t('woDetail.help.operations')} /></span></th>
                <th className="px-5 py-3"><span className="inline-flex items-center gap-1">{t('woDetail.operationName')}<FieldHelpPopover label={t('woDetail.operationName')} title={t('woDetail.operationName')} content={t('woDetail.help.operation')} /></span></th>
                <th className="px-5 py-3"><span className="inline-flex items-center gap-1">{t('woDetail.assignedWorkCenter')}<FieldHelpPopover label={t('woDetail.assignedWorkCenter')} title={t('woDetail.assignedWorkCenter')} content={t('woDetail.help.workCenter')} /></span></th>
                <th className="px-5 py-3 text-right">{t('woDetail.requestedOutputQty')}</th>
                <th className="px-5 py-3 text-right">{t('woDetail.operationCycleCount')}</th>
                <th className="px-5 py-3 text-right">{t('woDetail.labelCount')}</th>
                <th className="px-5 py-3 text-right">{t('woDetail.printCopies')}</th>
                <th className="px-5 py-3 text-right"><span className="inline-flex items-center gap-1">{t('common.status')}<FieldHelpPopover label={t('common.status')} title={t('common.status')} content={t('woDetail.help.operations')} /></span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(wo.operations || [
                { sequence: 10, operation_code: 'OP-MIX', operation_name: t('operation.OP-MIX'), work_center: 'WC-MIX', status: 'PENDING' },
                { sequence: 20, operation_code: 'OP-PREP', operation_name: t('operation.OP-PREP'), work_center: 'WC-PREP', status: 'PENDING' },
                { sequence: 30, operation_code: 'OP-CUT', operation_name: t('operation.OP-CUT'), work_center: 'WC-CUT', status: 'PENDING' },
                { sequence: 40, operation_code: 'OP-MOLD', operation_name: t('operation.OP-MOLD'), work_center: 'WC-MOLD', status: 'PENDING' },
                { sequence: 50, operation_code: 'OP-QC', operation_name: t('operation.OP-QC'), work_center: 'WC-QC', status: 'PENDING' },
              ]).map((op: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-800/40 font-mono text-xs">
                  <td className="px-5 py-3 font-bold text-slate-400">{op.sequence || (idx + 1) * 10}</td>
                  <td className="px-5 py-3 text-slate-200">{localizedText(op.operation_name) || t(`operation.${op.operation_code}`)} <span className="text-slate-500">({op.operation_code})</span></td>
                  <td className="px-5 py-3"><span className="block font-sans font-semibold text-slate-100">{localizedText(op.work_center_name) || op.work_center || t('common.notAvailable')}</span><span className="block text-xs text-slate-500">{op.work_center_code || (op.work_center && op.work_center !== localizedText(op.work_center_name) ? op.work_center : '')}</span><span className="block text-xs text-amber-300">{op.production_line_code || wo.selected_production_line_code || ''}</span></td>
                  <td className="px-5 py-3 text-right text-slate-200">{formatNumberForDisplay(op.expected_good_quantity ?? wo.quantity)} <span className="text-xs text-slate-500">/ {formatNumberForDisplay(op.base_quantity ?? op.standard_base_quantity)}</span></td>
                  <td className="px-5 py-3 text-right text-slate-200">{op.operation_cycle_count ?? '-'}</td>
                  <td className="px-5 py-3 text-right text-slate-200">{op.requires_output_label ? (op.label_count ?? '-') : '-'}</td>
                  <td className="px-5 py-3 text-right text-slate-200">{op.requires_output_label ? (op.print_copies ?? '-') : '-'}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded">
                      {translatedEnum(t, 'operation.status', op.status || 'READY')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider text-xs">{t('woDetail.materialRequirementsTitle')}</h3>
        <div className="border border-slate-800 rounded-md overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800"><tr><th className="px-5 py-3">{t('woDetail.material')}</th><th className="px-5 py-3">{t('woDetail.requiredQty')}</th><th className="px-5 py-3">{t('woDetail.materialMode')}</th><th className="px-5 py-3 text-right">{t('common.status')}</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60">
              {wo.material_requirements.length === 0 ? <tr><td colSpan={4} className="px-5 py-5 text-center text-slate-500">{t('woDetail.noMaterialRequirements')}</td></tr> : wo.material_requirements.map((material: any) => (
                <tr key={material.requirement_id} className="font-mono text-xs">
                  <td className="px-5 py-3 text-amber-200">{material.component_item_code || t('common.notAvailable')}</td>
                  <td className="px-5 py-3 text-slate-200">{material.required_qty}</td>
                  <td className="px-5 py-3 text-slate-400">{material.phantom_flag ? t('woDetail.phantom') : material.backflush_flag ? t('woDetail.backflush') : t('woDetail.manualIssue')}</td>
                  <td className="px-5 py-3 text-right"><span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5">{translatedEnum(t, 'materialRequest.status', material.stock_check_status || 'NotChecked')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal with AlertDialog pattern */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <form onSubmit={handleReject} className="bg-slate-900 border border-rose-900/50 rounded-md p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <XCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold">{t('woDetail.rejectTitle')}</h3>
            </div>
            <p className="text-xs text-slate-300">
              {t('woDetail.rejectBody')}
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder={t('woDetail.rejectPlaceholder')}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
              required
            />
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-md text-sm font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submittingAction}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-sm font-semibold"
              >
                {t('woDetail.confirmReject')}
              </button>
            </div>
          </form>
        </div>
      )}

      {showLineReplanModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <form onSubmit={handleLineReplan} className="bg-slate-900 border border-action/50 rounded-md p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-300"><RefreshCw className="w-6 h-6" /><h3 className="text-lg font-bold">{t('woDetail.lineReplan')}</h3></div>
            <p className="text-sm text-slate-300">{wo.status === 'Released' ? t('woDetail.lineReplanReleasedImpact') : t('woDetail.lineReplanDraftImpact')}</p>
            <textarea value={lineReplanReason} onChange={(e) => setLineReplanReason(e.target.value)} placeholder={t('woDetail.lineReplanReasonPlaceholder')} rows={3} className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 text-sm text-slate-100 focus:outline-none focus:border-action" required />
            <div className="flex justify-end space-x-3 pt-2"><button type="button" onClick={() => setShowLineReplanModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-md text-sm font-semibold">{t('common.cancel')}</button><button data-testid="line-replan-confirm-button" type="submit" disabled={submittingAction} className="px-5 py-2 bg-action hover:bg-action-hover text-white rounded-md text-sm font-semibold">{t('woDetail.confirmLineReplan')}</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

function PackageCheckIcon() {
  return <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-current text-[10px]">✓</span>;
}
