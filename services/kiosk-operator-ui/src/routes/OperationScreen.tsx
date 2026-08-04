import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Layers,
  Loader2,
  LockKeyhole,
  Play,
  Printer,
  QrCode,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { useKioskSocket } from '../context/KioskSocketContext';
import { ErrorBoundaryCard } from '../components/ErrorBoundaryCard';
import { LanguageSelect } from '../components/LanguageSelect';
import {
  authenticatedCommandHeaders,
  clearAttemptKey,
  commandError,
  stableAttemptKey,
  type KioskCommandAction,
} from '../lib/commands';
import {
  blockerKey,
  displayResource,
  displayStateKey,
  eligibleActions,
  formatDateTime,
  predecessorStateKey,
  printStateKey,
  stateTone,
  workOrderStateKey,
} from '../lib/presentation';
import type { KioskJobCard, KioskReasonCode, KioskSessionContext, KioskWorkOrderDetail } from '../types/kiosk';
import { bearerHeaders } from '../lib/auth';
import { gatewayUrl } from '../lib/runtimeConfig';

const DetailValue: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs text-slate-500">{label}</dt>
    <dd className="mt-1 break-words text-sm text-slate-200">{value}</dd>
  </div>
);

export const OperationScreen: React.FC = () => {
  const { terminalId = 'KIOSK-DEMO-01', woId = '' } = useParams();
  const navigate = useNavigate();
  const { connectionStatus, refreshVersion } = useKioskSocket();
  const { locale, resolveText, t, formatNumber } = useI18n();
  const [detail, setDetail] = useState<KioskWorkOrderDetail>();
  const [selectedOperationId, setSelectedOperationId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [qtyGood, setQtyGood] = useState(0);
  const [qtyScrap, setQtyScrap] = useState(0);
  const [reasonCode, setReasonCode] = useState('');
  const [scannedLabelId, setScannedLabelId] = useState('');
  const [scannedMatCode, setScannedMatCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [showFailModal, setShowFailModal] = useState(false);
  const [failureReasonCode, setFailureReasonCode] = useState('');
  const [failureReasonText, setFailureReasonText] = useState('');
  const [reasonCodes, setReasonCodes] = useState<KioskReasonCode[]>([]);
  const commandInFlightRef = useRef(false);

  const fetchWODetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        gatewayUrl(`/api/mes/execution/kiosk/terminals/${encodeURIComponent(terminalId)}/work-orders/${woId}`),
        { headers: bearerHeaders() },
      );
      if (!response.ok) throw { status: response.status };
      const result = (await response.json()) as KioskWorkOrderDetail;
      setDetail(result);
      setSelectedOperationId((current) =>
        result.job_cards.some((operation) => operation.wo_operation_id === current)
          ? current
          : result.job_cards[0]?.wo_operation_id,
      );
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [terminalId, woId]);

  useEffect(() => {
    void fetchWODetails();
  }, [fetchWODetails]);

  useEffect(() => {
    if (refreshVersion > 0) void fetchWODetails();
  }, [fetchWODetails, refreshVersion]);

  useEffect(() => {
    void fetch(gatewayUrl('/api/mes/master-data/reason-codes?limit=500'), {
      headers: bearerHeaders(),
    })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error('REASON_CATALOG_UNAVAILABLE')))
      .then((body) => setReasonCodes((body.data || []).filter((reason: KioskReasonCode) => reason.lifecycle_status === 'Released')))
      .catch(() => setReasonCodes([]));
  }, []);

  const selectedOperation = useMemo(
    () => detail?.job_cards.find((operation) => operation.wo_operation_id === selectedOperationId),
    [detail, selectedOperationId],
  );
  const activeSession = selectedOperation?.active_session;

  useEffect(() => {
    if (!selectedOperation) return;
    setQtyGood(selectedOperation.expected_good_quantity ?? selectedOperation.requested_quantity ?? 0);
    setQtyScrap(0);
    setReasonCode('');
    setFailureReasonCode('');
    setFailureReasonText('');
    setShowAbortModal(false);
    setShowFailModal(false);
    setFieldErrors({});
  }, [selectedOperationId]);

  const ensureOnline = () => {
    if (connectionStatus === 'connected') return true;
    toast.error(t('kiosk.offline.disconnected'));
    return false;
  };

  const localizedCommandError = (code: string) => {
    const key = `kiosk.command.error.${code}`;
    const translated = t(key);
    return translated === key ? t('kiosk.command.failed') : translated;
  };

  const executeCommand = async (
    action: KioskCommandAction,
    operation: KioskJobCard,
    endpoint: string,
    body: Record<string, unknown>,
  ) => {
    if (commandInFlightRef.current || !ensureOnline()) return null;
    commandInFlightRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    const attemptKey = stableAttemptKey(terminalId, woId, operation.wo_operation_id, action);
    try {
      const response = await fetch(gatewayUrl(endpoint), {
        method: 'POST',
        headers: authenticatedCommandHeaders(attemptKey),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await commandError(response));
      const result = await response.json().catch(() => ({}));
      clearAttemptKey(terminalId, woId, operation.wo_operation_id, action);
      return result;
    } finally {
      commandInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleStartOperation = async () => {
    if (!selectedOperation || !selectedOperation.action_eligibility.can_start || !ensureOnline()) return;
    try {
      const result = await executeCommand(
        'start', selectedOperation,
        `/api/mes/execution/kiosk/work-orders/${woId}/operations/${selectedOperation.wo_operation_id}/start`,
        { terminal_ref: terminalId },
      );
      if (!result) return;
      toast.success(t('kiosk.command.started'));
      await fetchWODetails();
    } catch (commandError) {
      const code = commandError instanceof Error ? commandError.message : 'UNKNOWN';
      setFieldErrors({ form: localizedCommandError(code) });
    }
  };

  const handleConfirmOperation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOperation || !activeSession || !selectedOperation.action_eligibility.can_complete || !ensureOnline()) return;
    const errors: Record<string, string> = {};
    if (!Number.isFinite(qtyGood) || !Number.isFinite(qtyScrap) || qtyGood < 0 || qtyScrap < 0 || qtyGood + qtyScrap <= 0) {
      errors.quantity = t('kiosk.form.quantityInvalid');
    }
    if (qtyScrap > 0 && selectedOperation.behavior.requires_scrap_reason && !reasonCode) errors.reasonCode = t('kiosk.form.reasonRequired');
    if (selectedOperation.behavior.requires_material_scan && !scannedMatCode && !scannedLabelId) {
      errors.scannedMatCode = t('kiosk.form.scanRequired');
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    try {
      const attemptKey = stableAttemptKey(terminalId, woId, selectedOperation.wo_operation_id, 'complete');
      const result = await executeCommand(
        'complete', selectedOperation,
        `/api/mes/execution/kiosk/work-orders/${woId}/operations/${selectedOperation.wo_operation_id}/confirm`,
        {
          session_id: activeSession.session_id,
          qty_good: qtyGood,
          qty_scrap: qtyScrap,
          reason_code: reasonCode || undefined,
          scanned_label_id: scannedLabelId || undefined,
          scanned_material_code: scannedMatCode || undefined,
          idempotency_attempt: attemptKey,
        },
      );
      if (!result) return;
      toast.success(t('kiosk.command.completed'));
      await fetchWODetails();
    } catch (commandError) {
      const code = commandError instanceof Error ? commandError.message : 'UNKNOWN';
      setFieldErrors({ form: localizedCommandError(code) });
    }
  };

  const handleAbortSession = async () => {
    const sessionId = activeSession?.session_id;
    if (!selectedOperation || !sessionId || !selectedOperation.action_eligibility.can_abort || !ensureOnline()) return;
    try {
      const result = await executeCommand(
        'abort', selectedOperation,
        `/api/mes/execution/kiosk/work-orders/${woId}/operations/${selectedOperation.wo_operation_id}/abort`,
        { session_id: sessionId, terminal_ref: terminalId },
      );
      if (!result) return;
      toast.success(t('kiosk.command.aborted'));
      setShowAbortModal(false);
      await fetchWODetails();
    } catch (commandError) {
      const code = commandError instanceof Error ? commandError.message : 'UNKNOWN';
      toast.error(localizedCommandError(code));
    }
  };

  const handleFailOperation = async () => {
    const sessionId = activeSession?.session_id;
    if (!selectedOperation || !sessionId || !selectedOperation.action_eligibility.can_fail || !ensureOnline()) return;
    const selectedReason = reasonCodes.find((reason) => reason.code === failureReasonCode && reason.reason_type === 'ExecutionFailure');
    const errors: Record<string, string> = {};
    if (!selectedReason) errors.failureReason = t('kiosk.fail.reasonRequired');
    if (selectedReason?.requires_comment && !failureReasonText.trim()) errors.failureText = t('kiosk.fail.commentRequired');
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    try {
      const result = await executeCommand(
        'fail', selectedOperation,
        `/api/mes/execution/kiosk/work-orders/${woId}/operations/${selectedOperation.wo_operation_id}/fail`,
        { session_id: sessionId, terminal_ref: terminalId, reason_code: selectedReason!.code, reason_text: failureReasonText.trim() },
      );
      if (!result) return;
      toast.success(t('kiosk.command.failedRecorded'));
      setShowFailModal(false);
      await fetchWODetails();
    } catch (commandError) {
      const code = commandError instanceof Error ? commandError.message : 'UNKNOWN';
      setFieldErrors({ form: localizedCommandError(code) });
    }
  };

  const handleRetryOperation = async () => {
    if (!selectedOperation || !selectedOperation.action_eligibility.can_retry || !ensureOnline()) return;
    try {
      const result = await executeCommand(
        'retry', selectedOperation,
        `/api/mes/execution/kiosk/work-orders/${woId}/operations/${selectedOperation.wo_operation_id}/retry`,
        { terminal_ref: terminalId },
      );
      if (!result) return;
      toast.success(t('kiosk.command.retried'));
      await fetchWODetails();
    } catch (commandError) {
      const code = commandError instanceof Error ? commandError.message : 'UNKNOWN';
      setFieldErrors({ form: localizedCommandError(code) });
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={() => void fetchWODetails()} />;
  if (loading && !detail) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-96 items-center justify-center text-slate-300">
        <div className="space-y-3 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-400" /><p>{t('kiosk.loading.detail')}</p></div>
      </div>
    );
  }
  if (!detail) return null;

  const workOrder = detail.work_order;
  const notAvailable = t('kiosk.notAvailable');

  const sessionOperator = (session?: KioskSessionContext) =>
    session?.operator_code || resolveText(session?.operator_name_i18n) || t('kiosk.operator.unknown');

  const renderJobCard = (operation: KioskJobCard) => {
    const selected = operation.wo_operation_id === selectedOperationId;
    const actions = eligibleActions(operation.action_eligibility);
    const session = operation.active_session || operation.last_session;
    const workCenter = displayResource(operation.resource.work_center, resolveText, t('kiosk.resource.unassigned'));
    const workstation = displayResource(operation.resource.workstation, resolveText, t('kiosk.resource.unassigned'));
    const allocated = displayResource(operation.resource.allocated_resource, resolveText, t('kiosk.resource.unassigned'));
    return (
      <article key={operation.wo_operation_id} className={`space-y-4 rounded border bg-slate-900 p-4 md:p-5 ${selected ? 'border-indigo-500' : 'border-slate-800'}`}>
        <button
          type="button"
          onClick={() => setSelectedOperationId(operation.wo_operation_id)}
          aria-pressed={selected}
          className="flex min-h-12 w-full flex-wrap items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-xs text-slate-500">{t('kiosk.sequence')} {operation.sequence_no}</span>
            <span className="block font-mono text-lg font-bold text-slate-100">{operation.operation_code}</span>
            <span className="block truncate text-sm text-slate-400">{resolveText(operation.operation_name_i18n)}</span>
          </span>
          <span className={`rounded border px-3 py-1 text-xs font-semibold ${stateTone(operation.display_state)}`}>
            {t(displayStateKey(operation.display_state))}
          </span>
        </button>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          <DetailValue label={t('kiosk.line')} value={operation.selected_production_line_code || notAvailable} />
          <DetailValue label={t('kiosk.workCenter')} value={<span className="font-mono">{workCenter}</span>} />
          <DetailValue label={t('kiosk.workstation')} value={<span className="font-mono">{workstation}</span>} />
          <DetailValue label={t('kiosk.resource')} value={<span className="font-mono">{allocated}</span>} />
          <DetailValue
            label={t('kiosk.predecessor')}
            value={`${operation.predecessor_sequences.length ? operation.predecessor_sequences.join(', ') : t('kiosk.none')} · ${t(predecessorStateKey(operation.predecessor_status))}`}
          />
          <DetailValue label={t('kiosk.operator')} value={sessionOperator(session)} />
          <DetailValue label={t('kiosk.terminalLabel')} value={session?.terminal_ref || terminalId} />
          <DetailValue label={t('kiosk.session.active')} value={operation.active_session ? t('kiosk.jobState.in_progress') : t('kiosk.notAvailable')} />
        </dl>

        <dl className="grid grid-cols-2 gap-3 border-y border-slate-800 py-3 sm:grid-cols-4">
          <DetailValue label={t('kiosk.requested')} value={formatNumber(operation.requested_quantity)} />
          <DetailValue label={t('kiosk.expectedGood')} value={formatNumber(operation.expected_good_quantity ?? operation.requested_quantity)} />
          <DetailValue label={t('kiosk.good')} value={formatNumber(operation.qty_good)} />
          <DetailValue label={t('kiosk.scrap')} value={formatNumber(operation.qty_scrap)} />
        </dl>

        <dl className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <DetailValue label={t('kiosk.plannedStart')} value={formatDateTime(locale, operation.planned_start_at) || notAvailable} />
          <DetailValue label={t('kiosk.plannedEnd')} value={formatDateTime(locale, operation.planned_end_at) || notAvailable} />
          <DetailValue label={t('kiosk.started')} value={formatDateTime(locale, operation.started_at || session?.started_at) || notAvailable} />
          <DetailValue label={t('kiosk.finished')} value={formatDateTime(locale, operation.finished_at) || notAvailable} />
        </dl>

        {operation.failure && (
          <div className="flex gap-2 border-y border-rose-900 py-3 text-sm text-rose-200">
            <AlertOctagon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span><strong>{t('kiosk.failure')}:</strong> {operation.failure.reason_code} · {resolveText(operation.failure.reason_name_i18n) || operation.failure.reason_text || notAvailable}</span>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-2 text-xs text-slate-500">{t('kiosk.nextAction')}</p>
            <div className="flex flex-wrap gap-2">
              {actions.length ? actions.map((action) => (
                <span key={action} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200">{t(`kiosk.action.${action}`)}</span>
              )) : <span className="text-sm text-slate-400">{t('kiosk.noAction')}</span>}
            </div>
          </div>
          {operation.action_eligibility.blockers.length > 0 && (
            <ul className="space-y-1 text-sm text-amber-300">
              {operation.action_eligibility.blockers.map((code) => <li key={code}>{t(blockerKey(code))}</li>)}
            </ul>
          )}
        </div>

        {selected && (
          <div className="space-y-4 border-t border-slate-800 pt-4">
            {fieldErrors.form && <div role="alert" className="border-y border-rose-900 py-3 text-sm text-rose-300">{fieldErrors.form}</div>}
            {operation.action_eligibility.can_start && (
              <button type="button" onClick={() => void handleStartOperation()} disabled={isSubmitting || connectionStatus !== 'connected'} className="flex min-h-12 items-center gap-2 rounded bg-indigo-600 px-5 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700">
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}<span>{t('kiosk.action.start')}</span>
              </button>
            )}
            {operation.action_eligibility.can_retry && (
              <button type="button" onClick={() => void handleRetryOperation()} disabled={isSubmitting || connectionStatus !== 'connected'} className="flex min-h-12 items-center gap-2 rounded bg-amber-600 px-5 font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-700">
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}<span>{t('kiosk.action.retry')}</span>
              </button>
            )}
            {operation.action_eligibility.can_complete && operation.active_session && (
              <form onSubmit={handleConfirmOperation} className="space-y-4">
                {fieldErrors.quantity && <div role="alert" className="border-y border-rose-900 py-3 text-sm text-rose-300">{fieldErrors.quantity}</div>}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-300">{t('kiosk.form.good')}<input aria-label={t('kiosk.form.good')} type="number" min="0" value={qtyGood} onChange={(event) => setQtyGood(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded border border-slate-700 bg-slate-950 px-3 font-mono" /></label>
                  <label className="text-sm text-slate-300">{t('kiosk.form.scrap')}<input aria-label={t('kiosk.form.scrap')} type="number" min="0" value={qtyScrap} onChange={(event) => setQtyScrap(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded border border-slate-700 bg-slate-950 px-3 font-mono" /></label>
                  {qtyScrap > 0 && operation.behavior.requires_scrap_reason && <label className="text-sm text-slate-300">{t('kiosk.form.scrapReason')}<select aria-label={t('kiosk.form.scrapReason')} value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} className="mt-2 min-h-12 w-full rounded border border-slate-700 bg-slate-950 px-3"><option value="">{t('kiosk.form.selectReason')}</option>{reasonCodes.filter((reason) => reason.reason_type !== 'ExecutionFailure').map((reason) => <option key={reason.code} value={reason.code}>{reason.code} · {resolveText(reason.name)}</option>)}</select>{fieldErrors.reasonCode && <span className="mt-1 block text-xs text-rose-300">{fieldErrors.reasonCode}</span>}</label>}
                  {operation.behavior.requires_material_scan && <><label className="text-sm text-slate-300">{t('kiosk.form.scanLabel')}<span className="relative mt-2 block"><QrCode className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" /><input aria-label={t('kiosk.form.scanLabel')} value={scannedLabelId} onChange={(event) => setScannedLabelId(event.target.value)} className="min-h-12 w-full rounded border border-slate-700 bg-slate-950 pl-11 pr-3 font-mono" /></span></label>
                  <label className="text-sm text-slate-300">{t('kiosk.form.scanMaterial')}<span className="relative mt-2 block"><Layers className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" /><input aria-label={t('kiosk.form.scanMaterial')} value={scannedMatCode} onChange={(event) => setScannedMatCode(event.target.value)} className="min-h-12 w-full rounded border border-slate-700 bg-slate-950 pl-11 pr-3 font-mono" /></span>{fieldErrors.scannedMatCode && <span className="mt-1 block text-xs text-rose-300">{fieldErrors.scannedMatCode}</span>}</label></>}
                </div>
                <div className="flex flex-wrap justify-between gap-3 border-t border-slate-800 pt-4">
                  <div className="flex flex-wrap gap-3">
                    {operation.action_eligibility.can_abort && <button type="button" onClick={() => setShowAbortModal(true)} disabled={isSubmitting || connectionStatus !== 'connected'} className="min-h-12 rounded border border-rose-800 px-4 font-semibold text-rose-200 disabled:text-slate-500">{t('kiosk.action.abort')}</button>}
                    {operation.action_eligibility.can_fail && <button type="button" onClick={() => { setFieldErrors({}); setShowFailModal(true); }} disabled={isSubmitting || connectionStatus !== 'connected'} className="min-h-12 rounded bg-rose-700 px-4 font-semibold text-white disabled:bg-slate-700">{t('kiosk.action.fail')}</button>}
                  </div>
                  <button type="submit" disabled={isSubmitting || connectionStatus !== 'connected'} className="flex min-h-12 items-center gap-2 rounded bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700">
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}<span>{isSubmitting ? t('kiosk.form.confirming') : t('kiosk.form.complete')}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
        <button type="button" onClick={() => navigate(`/kiosk/${terminalId}/wo-list`)} className="flex min-h-12 items-center gap-2 self-start rounded px-2 text-sm font-semibold text-slate-300 hover:bg-slate-900 hover:text-white">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /><span>{t('kiosk.back')}</span>
        </button>
        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          <div className="min-w-0 md:text-right"><h1 className="font-mono text-xl font-bold text-indigo-300">{workOrder.wo_code}</h1><p className="truncate text-sm text-slate-400">{workOrder.item_name || workOrder.item_code}</p></div>
          <span className={`rounded border px-3 py-1 text-xs font-semibold ${stateTone(workOrder.status)}`}>{t(workOrderStateKey(workOrder.status))}</span>
          <LanguageSelect />
        </div>
      </header>

      <section aria-labelledby="job-card-heading" className="space-y-4">
        <div className="flex items-center justify-between"><div><h2 id="job-card-heading" className="text-lg font-bold">{t('kiosk.jobs.title')}</h2><p className="text-sm text-slate-400">{t('kiosk.jobs.count', { count: detail.job_cards.length })}</p></div>{loading && <Loader2 className="h-5 w-5 animate-spin text-indigo-300" aria-label={t('kiosk.loading.detail')} />}</div>
        {detail.job_cards.map(renderJobCard)}
      </section>

      {detail.print_operations.length > 0 && (
        <section aria-labelledby="print-heading" className="space-y-3 border-y border-amber-900 bg-amber-950/20 px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="print-heading" className="flex items-center gap-2 font-bold text-amber-200"><Printer className="h-5 w-5" />{t('kiosk.print.title')}</h2><span className="flex items-center gap-1 text-xs font-semibold text-amber-300"><LockKeyhole className="h-4 w-4" />{t('kiosk.print.readOnly')}</span></div>
          {detail.print_operations.map((operation) => {
            const printState = operation.print_job_status || operation.print_status || operation.status;
            return <dl key={operation.wo_operation_id} className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><DetailValue label={t('kiosk.sequence')} value={`${operation.sequence_no} · ${operation.operation_code}`} /><DetailValue label={t('kiosk.print.job')} value={operation.print_job_code || t('kiosk.print.noJob')} /><DetailValue label={t('kiosk.print.status')} value={t(printStateKey(printState))} /><DetailValue label={t('kiosk.print.printer')} value={operation.selected_printer_code || t('kiosk.notAvailable')} /></dl>;
          })}
        </section>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4" />{t('kiosk.updated')}: {formatDateTime(locale, workOrder.updated_at)}</p>

      {showAbortModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="abort-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
          <div className="w-full max-w-md space-y-4 rounded border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 id="abort-title" className="text-lg font-bold">{t('kiosk.abort.title')}</h2><p className="text-sm text-slate-400">{t('kiosk.abort.body')}</p>
            <div className="flex gap-3"><button type="button" autoFocus onClick={() => setShowAbortModal(false)} disabled={isSubmitting} className="min-h-12 flex-1 rounded bg-slate-800 px-4 font-semibold">{t('kiosk.cancel')}</button><button type="button" onClick={() => void handleAbortSession()} disabled={isSubmitting} className="min-h-12 flex-1 rounded bg-rose-600 px-4 font-semibold text-white disabled:bg-slate-700">{isSubmitting ? t('kiosk.form.confirming') : t('kiosk.abort.confirm')}</button></div>
          </div>
        </div>
      )}

      {showFailModal && selectedOperation && (
        <div role="dialog" aria-modal="true" aria-labelledby="fail-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
          <div className="w-full max-w-lg space-y-4 rounded border border-rose-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-rose-400" aria-hidden="true" />
              <div><h2 id="fail-title" className="text-lg font-bold">{t('kiosk.fail.title')}</h2><p className="mt-1 text-sm text-slate-400">{t('kiosk.fail.body')}</p></div>
            </div>
            <div className="border-y border-amber-900 bg-amber-950/30 px-3 py-3 text-sm text-amber-200">
              {t('kiosk.fail.impact', {
                operationState: t(displayStateKey('failed')),
                workOrderState: t(workOrderStateKey(selectedOperation.failure_impact.work_order_state)),
              })}
            </div>
            {fieldErrors.form && <div role="alert" className="text-sm text-rose-300">{fieldErrors.form}</div>}
            <label className="block text-sm text-slate-300">{t('kiosk.fail.reason')}
              <select autoFocus aria-label={t('kiosk.fail.reason')} value={failureReasonCode} onChange={(event) => setFailureReasonCode(event.target.value)} className="mt-2 min-h-12 w-full rounded border border-slate-700 bg-slate-950 px-3">
                <option value="">{t('kiosk.form.selectReason')}</option>
                {reasonCodes.filter((reason) => reason.reason_type === 'ExecutionFailure').map((reason) => <option key={reason.code} value={reason.code}>{reason.code} · {resolveText(reason.name)}</option>)}
              </select>
              {fieldErrors.failureReason && <span className="mt-1 block text-xs text-rose-300">{fieldErrors.failureReason}</span>}
            </label>
            <label className="block text-sm text-slate-300">{t('kiosk.fail.comment')}
              <textarea aria-label={t('kiosk.fail.comment')} value={failureReasonText} onChange={(event) => setFailureReasonText(event.target.value)} rows={3} className="mt-2 w-full rounded border border-slate-700 bg-slate-950 p-3" />
              {fieldErrors.failureText && <span className="mt-1 block text-xs text-rose-300">{fieldErrors.failureText}</span>}
            </label>
            <div className="flex gap-3"><button type="button" onClick={() => setShowFailModal(false)} disabled={isSubmitting} className="min-h-12 flex-1 rounded bg-slate-800 px-4 font-semibold">{t('kiosk.cancel')}</button><button type="button" onClick={() => void handleFailOperation()} disabled={isSubmitting || reasonCodes.filter((reason) => reason.reason_type === 'ExecutionFailure').length === 0} className="min-h-12 flex-1 rounded bg-rose-600 px-4 font-semibold text-white disabled:bg-slate-700">{isSubmitting ? t('kiosk.form.confirming') : t('kiosk.fail.confirm')}</button></div>
          </div>
        </div>
      )}
    </main>
  );
};
