import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { ClipboardList, ArrowLeft, CheckCircle2, XCircle, Calculator, ShieldCheck, RefreshCw, Loader2, MessageSquare, Settings2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';
import { normalizeWorkOrderDetail, localizedText } from './workOrderDetail';
import { gatewayBaseUrl } from '../../lib/masterDataApi';
import { translateWorkOrderError } from '../../lib/errorMessages';

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
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [allocating, setAllocating] = useState(false);

  const canApprove = hasRole('EXECUTIVE') || hasRole('PLANT_MANAGER');

  const fetchWODetail = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' },
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
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/stage-materials`, {
        method: 'POST',
        headers: {
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER',
          'X-Trace-ID': `mes-console-${Date.now()}`,
        },
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
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/compute-check`, {
        method: 'POST',
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' },
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(translateWorkOrderError(errJson.message || errJson.error, t) || t('woDetail.computeFailed'));
      }
      const resData = await resp.json();
      setComputeResult(resData.data || resData);
      toast.success(t('woDetail.computed'));
      await fetchWODetail();
    } catch (err: any) {
      toast.error(t('woDetail.computeError', { message: err.message }));
    } finally {
      setComputing(false);
    }
  };

  const loadCandidates = async (operation: any) => {
    setSelectedOperation(operation); setCandidates([]); setLoadingCandidates(true);
    try {
      const host = window.location.hostname;
      const params = new URLSearchParams({ planned_start_at: operation.resource_allocation?.planned_start_at || wo.planned_start_at || new Date().toISOString(), ...(operation.resource_allocation?.planned_shift_id ? { shift_id: operation.resource_allocation.planned_shift_id } : {}) });
        const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/operations/${operation.wo_operation_id}/resource-candidates?${params}`, { headers: { 'X-User-ID': user?.userId || 'admin', 'X-Trace-ID': `mes-console-${Date.now()}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(translateWorkOrderError(body.message || body.error, t) || t('woDetail.resourcePlanningLoadFailed'));
      setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
    } catch (err: any) { toast.error(err.message || t('woDetail.resourcePlanningLoadFailed')); }
    finally { setLoadingCandidates(false); }
  };

  const commitCandidate = async (candidate: any) => {
    if (!selectedOperation) return; setAllocating(true);
    try {
      const host = window.location.hostname; const start = selectedOperation.resource_allocation?.planned_start_at || wo.planned_start_at || new Date().toISOString();
      const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/operations/${selectedOperation.wo_operation_id}/resource-allocation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-ID': user?.userId || 'admin', 'X-Trace-ID': `mes-console-${Date.now()}`, 'Idempotency-Key': `allocation-${id}-${selectedOperation.wo_operation_id}-${candidate.machine_group?.id || candidate.equipment?.id || candidate.workstation?.id}-${start}` }, body: JSON.stringify({ workstation_id: candidate.workstation?.id, equipment_id: candidate.primary_machine?.id || candidate.equipment?.id, machine_group_id: candidate.machine_group?.id, shift_id: selectedOperation.resource_allocation?.planned_shift_id || wo.shift_id, planned_start_at: start, candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`, row_version: wo.row_version }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(translateWorkOrderError(body.message || body.error, t) || t('woDetail.resourceAllocationFailed'));
      toast.success(t('woDetail.resourceAllocated')); setSelectedOperation(null); await fetchWODetail();
    } catch (err: any) { toast.error(err.message || t('woDetail.resourceAllocationFailed')); } finally { setAllocating(false); }
  };

  const handleApprove = async () => {
    if (!id) return;
    setSubmittingAction(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER',
        },
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

          {(wo.status === 'Released' || wo.status === 'InProgress') && (
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
                disabled={submittingAction}
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
            <span className="text-xs text-slate-500 font-semibold block uppercase">{t('productionVersion.itemCode')}</span>
            <span className="font-bold text-slate-100 font-mono">{wo.item_code}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">{t('wo.quantity')}</span>
            <span className="font-bold text-slate-100 font-mono">{wo.quantity} {wo.uom || t('uom.pcs')}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">{t('wo.targetDate')}</span>
            <span className="font-bold text-slate-100 font-mono">
              {wo.target_completion_date ? formatDate(wo.target_completion_date) : t('common.notAvailable')}
            </span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">{t('woDetail.stockCheck')}</span>
            <span className="font-bold text-action font-mono">{translatedEnum(t, 'stock.status', wo.stock_check_status || 'AVAILABLE')}</span>
          </div>
        </div>
      </div>

      {/* Inline Compute & Check Results */}
      {computeResult && (
        <div className="bg-primary/40 border border-primary/80 rounded-md p-6 space-y-3">
          <div className="flex items-center space-x-2 text-amber-100 font-bold text-sm">
            <Calculator className="w-5 h-5" />
            <span>{t('woDetail.computeResult')}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs font-mono">
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block">{t('woDetail.totalDuration')}</span>
              <span className="text-amber-100 font-bold text-sm">
                {computeResult.total_estimated_minutes || computeResult.estimated_minutes || 240} {t('woDetail.minutes')}
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block">{t('woDetail.capacityStatus')}</span>
              <span className="text-action font-bold text-sm">
                {translatedEnum(t, 'capacity.status', computeResult.capacity_status || 'CAPACITY_AVAILABLE')}
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block">{t('woDetail.suggestedStart')}</span>
              <span className="text-slate-200 font-bold text-sm">{t('woDetail.immediate')}</span>
            </div>
          </div>
        </div>
      )}

      {computeResult?.labor_assignments?.length > 0 && <div className="bg-slate-900 border border-action/40 rounded-md p-6 space-y-3"><h3 className="text-base font-bold text-slate-100">Labor assignments</h3><div className="grid gap-2 md:grid-cols-2">{computeResult.labor_assignments.map((assignment: any, index: number) => <div key={`${assignment.employee_code}-${assignment.skill_code}-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm"><div className="font-semibold text-amber-200">{assignment.employee_code}</div><div className="text-slate-300">{typeof assignment.employee_name === 'object' ? localizedText(assignment.employee_name) : assignment.employee_name || t('common.notAvailable')}</div><div className="mt-1 text-xs text-slate-400">{assignment.operation_code} · {assignment.skill_code} · {assignment.matched_level}</div></div>)}</div></div>}

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
      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 space-y-4">
        <div className="flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-100">{t('woDetail.resourcePlanningTitle')}</h3><p className="text-xs text-slate-400 mt-1">{t('woDetail.resourcePlanningSubtitle')}</p></div><button type="button" onClick={() => { const first = (wo.operations || []).find((op: any) => !op.resource_allocation?.allocation_id); if (first) loadCandidates(first); }} className="inline-flex items-center gap-2 rounded-md border border-action/60 bg-action/10 px-3 py-2 text-xs font-semibold text-amber-200"><Settings2 className="h-4 w-4" />{t('woDetail.resourceRecommend')}</button></div>
        <div className="grid gap-2 md:grid-cols-2">{(wo.operations || []).map((op: any) => { const allocation = op.resource_allocation; return <button type="button" key={op.wo_operation_id} onClick={() => loadCandidates(op)} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 p-3 text-left hover:border-action/70"><span><span className="block text-xs text-slate-500">{op.sequence_no} · {localizedText(op.operation_name) || op.operation_code}</span><span className="block text-sm text-slate-200">{allocation?.planned_equipment_id || allocation?.planned_workstation_id ? t('woDetail.resourceAllocated') : t('woDetail.resourceNotAllocated')}</span>{allocation?.planned_start_at && <span className="block text-xs text-slate-500">{formatDate(allocation.planned_start_at)} - {formatDate(allocation.planned_end_at)}</span>}</span><span className={`rounded border px-2 py-1 text-xs ${allocation?.validation_status === 'Stale' ? 'border-rose-700 text-rose-300' : allocation?.allocation_id ? 'border-emerald-700 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>{allocation?.status || t('woDetail.resourceNotAllocated')}</span></button>; })}</div>
      </div>

      {selectedOperation && <div className="bg-slate-900 border border-action/50 rounded-md p-6 space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-100">{localizedText(selectedOperation.operation_name) || selectedOperation.operation_code}</h3><p className="text-xs text-slate-400">{t('woDetail.resourceCandidatesSubtitle')}</p></div><button type="button" onClick={() => setSelectedOperation(null)} className="text-xs text-slate-400 hover:text-white">{t('common.cancel')}</button></div>{loadingCandidates ? <Loader2 className="h-5 w-5 animate-spin text-action" /> : candidates.length === 0 ? <p className="text-sm text-slate-400">{t('woDetail.resourceNoCandidates')}</p> : <div className="grid gap-3 md:grid-cols-2">{candidates.map((candidate, index) => <div key={`${candidate.machine_group?.id || candidate.equipment?.id || candidate.workstation?.id}-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-4"><div className="flex items-center justify-between"><div><span className="text-xs font-bold text-amber-300">#{index + 1}</span><h4 className="font-semibold text-slate-100">{localizedText(candidate.machine_group?.name) || localizedText(candidate.equipment?.name) || candidate.equipment?.code || localizedText(candidate.workstation?.name) || candidate.workstation?.code || t('common.notAvailable')}</h4><p className="text-xs text-slate-500">{candidate.machine_group?.code || candidate.equipment?.code || candidate.workstation?.code || ''}</p></div><span className={candidate.readiness === 'Eligible' ? 'text-emerald-300' : candidate.readiness === 'ReadyWithWarnings' ? 'text-amber-300' : 'text-rose-300'}>{candidate.readiness}</span></div>{candidate.primary_machine && <div className="mt-2 text-xs text-slate-300">{t('resourceFoundation.primaryMachine')}: {localizedText(candidate.primary_machine.name) || candidate.primary_machine.code} · {candidate.primary_machine.unit_code || ''}</div>}{candidate.supporting_machines?.length ? <div className="mt-1 text-xs text-slate-400">{t('resourceFoundation.supportingMachines')}: {candidate.supporting_machines.map((member: any) => member.code).join(', ')}</div> : null}<div className="mt-3 space-y-1 text-xs text-slate-400"><div>{t('woDetail.resourceDuration')}: {candidate.estimated_duration_min || candidate.calculation?.estimated_duration_min || '-'} min</div><div>{t('woDetail.resourceCapacity')}: {candidate.calendar?.available_minutes || '-'} min</div>{(candidate.warnings || []).map((warning: any) => <div key={warning.code} className="text-amber-300">{warning.code}</div>)}{(candidate.capacity_conflicts || []).map((conflict: any) => <div key={conflict.code} className="text-rose-300">{conflict.code}</div>)}</div><button type="button" disabled={allocating || candidate.readiness === 'Blocked' || (candidate.capacity_conflicts || []).length > 0} onClick={() => commitCandidate(candidate)} className="mt-4 inline-flex items-center gap-2 rounded-md bg-action px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />{t('woDetail.resourceSelect')}</button></div>)}</div>}</div>}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider text-xs">
          {t('woDetail.operationsTitle')}
        </h3>
        <div className="border border-slate-800 rounded-md overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">{t('mbom.seq')}</th>
                <th className="px-5 py-3">{t('woDetail.operationName')}</th>
                <th className="px-5 py-3">{t('woDetail.assignedWorkCenter')}</th>
                <th className="px-5 py-3 text-right">{t('common.status')}</th>
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
                  <td className="px-5 py-3"><span className="block font-sans font-semibold text-slate-100">{localizedText(op.work_center_name) || op.work_center || t('common.notAvailable')}</span><span className="block text-xs text-slate-500">{op.work_center_code || (op.work_center && op.work_center !== localizedText(op.work_center_name) ? op.work_center : '')}</span></td>
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
    </div>
  );
};

function PackageCheckIcon() {
  return <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-current text-[10px]">✓</span>;
}
