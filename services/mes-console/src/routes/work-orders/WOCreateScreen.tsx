import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AlertTriangle, ArrowLeft, Check, CheckCircle, ChevronDown, ChevronUp, ClipboardCopy, Clock3, ExternalLink, Loader2, Radio, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, ComboboxBase, FieldHelpPopover } from '../../components/ui';
import { generateRequestId } from '../../lib/codePreview';
import { gatewayBaseUrl } from '../../lib/masterDataApi';
import { translateWorkOrderError } from '../../lib/errorMessages';
import { UomNumberInput } from '../../components/UomNumberInput';
import { BaseModal } from '../../components/base';

type ReadyProduct = {
  item_id: string;
  item_code: string;
  item_name: Record<string, string> | string;
  item_revision_id: string;
  revision_code: string;
  display_code: string;
  base_uom_id: string;
  base_uom_code: string;
  base_uom_decimal_precision?: number;
  base_uom_allow_fraction?: boolean;
  base_uom?: { id?: string; code?: string; decimal_precision?: number; allow_fraction?: boolean; lifecycle_status?: string };
  production_version_id: string;
  production_version_code: string;
  production_version_name?: Record<string, string> | string;
  min_lot_size?: number | string | null;
  max_lot_size?: number | string | null;
  valid_from?: string;
  valid_to?: string | null;
  mbom_header_id: string;
  mbom_name?: Record<string, string> | string;
  mbom_code: string;
  routing_header_id: string;
  routing_name?: Record<string, string> | string;
  routing_code: string;
  site_id: string;
  site_code: string;
  readiness_status: 'Ready';
};
type StepStatus = 'pending' | 'running' | 'succeeded' | 'warning' | 'event_queued' | 'failed' | 'timed_out' | 'skipped' | 'cancelled';
type WorkflowStep = { id: string; order: number; status: StepStatus; title_key?: string; message_key?: string; message_params?: Record<string, string | number>; result?: Record<string, any>; error?: { code?: string; detail?: string; retryable?: boolean; technical_reference?: string } };
type WorkflowEvent = { event_type: string; sequence: number; workflow_id: string; step?: WorkflowStep; workflow?: { status?: string; work_order_id?: string; work_order_code?: string } };

const stepDefinitions = [
  { id: 'request_validation', order: 1, titleKey: 'workOrders.creation.steps.request.title' },
  { id: 'master_data_readiness', order: 2, titleKey: 'workOrders.creation.steps.readiness.title' },
  { id: 'create_transaction', order: 3, titleKey: 'workOrders.creation.steps.transaction.title' },
  { id: 'outbox_queued', order: 4, titleKey: 'workOrders.creation.steps.outbox.title' },
];

function statusIcon(status: StepStatus) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === 'succeeded') return <Check className="h-4 w-4" />;
  if (status === 'event_queued') return <Radio className="h-4 w-4" />;
  if (status === 'failed' || status === 'timed_out') return <XCircle className="h-4 w-4" />;
  if (status === 'warning') return <AlertTriangle className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

export const WOCreateScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [itemCode, setItemCode] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<ReadyProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ReadyProduct | null>(null);
  const [expectedCode, setExpectedCode] = useState('');
  const [quantity, setQuantity] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>(() => defaultPlanningDate());
  const [submitting, setSubmitting] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState('accepted');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'unavailable'>('connecting');
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [workflowResult, setWorkflowResult] = useState<{ work_order_id?: string; work_order_code?: string; operationCount?: number; materialCount?: number; lineSelectionStatus?: string; selectedProductionLineCode?: string; fallbackReason?: string } | null>(null);
  const [workflowError, setWorkflowError] = useState<{ code?: string; detail?: string; technical_reference?: string } | null>(null);
  const [requestFailure, setRequestFailure] = useState<{ detail: string; reference: string } | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setProductsLoading(true);
      setProductsError('');
      try {
        const host = window.location.hostname;
        const response = await fetch(`${gatewayBaseUrl()}/api/mes/master-data/production-ready-versions?search=${encodeURIComponent(productSearch)}&planned_date=${targetDate}&limit=50`, { headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || t('workOrders.create.productSelector.loadError'));
        const nextProducts = (data.data || []) as ReadyProduct[];
        setProducts(nextProducts);
        if (selectedProductId && !nextProducts.some((product) => product.production_version_id === selectedProductId)) {
          setSelectedProductId('');
          setSelectedProduct(null);
          setItemCode('');
        }
      } catch (error: any) {
        setProductsError(error.message || t('workOrders.create.productSelector.loadError'));
      } finally { setProductsLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [productSearch, targetDate, user?.userId]);

  useEffect(() => {
    const loadPreview = async () => {
      try {
        const host = window.location.hostname;
        const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-order-code-preview`, { headers: { 'X-User-ID': user?.userId || 'admin' } });
        const data = await response.json();
        if (response.ok) setExpectedCode(data.preview_code || '');
      } catch { setExpectedCode(''); }
    };
    void loadPreview();
  }, [user?.userId]);

  const steps = useMemo(() => {
    const byId = new Map(events.flatMap((event) => event.step ? [[event.step.id, event.step]] as const : []));
    return stepDefinitions.map((definition) => ({ ...definition, ...(byId.get(definition.id) || { status: 'pending' as StepStatus }) }));
  }, [events]);

  useEffect(() => {
    if (!workflowId) return;
    let disposed = false;
    let retryDelay = 500;
    let timer: number | undefined;
    const pollSnapshot = async () => {
      if (disposed) return;
      setConnectionStatus('connecting');
      try {
        const response = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-order-creation-workflows/${workflowId}`, { headers: { 'X-User-ID': user?.userId || 'admin' }, cache: 'no-store' });
        if (!response.ok) throw new Error('snapshot');
        const snapshot = await response.json();
        const nextEvents = (snapshot.events || []) as WorkflowEvent[];
        setEvents(nextEvents);
        setWorkflowStatus(snapshot.status || 'running');
        setWorkflowResult((current) => ({ ...current, work_order_id: snapshot.work_order_id || current?.work_order_id, work_order_code: snapshot.work_order_code || current?.work_order_code, ...(nextEvents.find((event) => event.step?.result)?.step?.result || {}) }));
        const failedEvent = [...nextEvents].reverse().find((event) => event.step?.error);
        if (failedEvent?.step?.error) setWorkflowError(failedEvent.step.error);
        setConnectionStatus('connected');
        retryDelay = 500;
        if (!['succeeded', 'failed', 'cancelled', 'timed_out'].includes(snapshot.status)) timer = window.setTimeout(pollSnapshot, 500);
      } catch {
        if (disposed) return;
        setConnectionStatus('reconnecting');
        timer = window.setTimeout(pollSnapshot, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 3000);
      }
    };
    void pollSnapshot();
    return () => { disposed = true; if (timer) window.clearTimeout(timer); };
  }, [workflowId, user?.userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const idempotencyKey = generateRequestId();
    setSubmitting(true);
    setWorkflowError(null);
    setRequestFailure(null);
    setEvents([]);
    try {
      const host = window.location.hostname;
        const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-order-creation-workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' },
          body: JSON.stringify({ production_version_id: selectedProduct?.production_version_id, quantity: Number(quantity), target_date: targetDate }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(translateWorkOrderError(data.error || data.message, t) || t('woCreate.createFailed'));
      setWorkflowId(data.workflow_id);
      setWorkflowStatus(data.status || 'accepted');
    } catch (err: any) {
      const message = translateWorkOrderError(err.message, t);
      setWorkflowError({ code: 'ERR-WO-REQUEST-001', detail: message });
      setRequestFailure({ detail: message, reference: idempotencyKey });
      toast.error(message);
    } finally { setSubmitting(false); }
  };

  const copyReference = async () => { if (workflowId) { await navigator.clipboard?.writeText(workflowId); toast.success(t('workOrders.creation.referenceCopied')); } };
  const closeWorkflow = () => { if (workflowStatus === 'succeeded' && workflowResult?.work_order_id) navigate(`/work-orders/${workflowResult.work_order_id}`); else setWorkflowId(null); };
  const connectionText = { connecting: t('workOrders.creation.connection.connecting'), connected: t('workOrders.creation.connection.connected'), reconnecting: t('workOrders.creation.connection.reconnecting'), unavailable: t('workOrders.creation.connection.unavailable') }[connectionStatus];

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="work-order-create-screen">
      <div className="flex items-center justify-between"><Button variant="secondary" onClick={() => navigate('/work-orders')}><ArrowLeft className="h-4 w-4" />{t('woCreate.backToList')}</Button></div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 shadow-2xl space-y-6">
        <div className="border-b border-slate-800 pb-4"><h1 className="text-xl font-bold text-slate-100">{t('woCreate.title')}</h1><p className="text-xs text-slate-400">{t('woCreate.subtitle')}</p></div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><FieldLabel t={t} labelKey="workOrders.create.fields.workOrderCode" helpKey="workOrders.create.fieldHelp.workOrderCode" /><input readOnly value={expectedCode} placeholder={t('workOrders.create.fields.workOrderCodePreview')} className="w-full cursor-text rounded-md border border-slate-700 bg-slate-950/60 p-3.5 font-mono text-sm text-slate-200 outline-none focus:border-action" /><p className="mt-1.5 text-xs text-slate-400">{t('workOrders.create.fields.workOrderCodeHelp')}</p></div>
          <div data-testid="work-order-production-version-field"><FieldLabel t={t} labelKey="workOrders.create.fields.productionVersion" helpKey="workOrders.create.fieldHelp.productionVersion" required /><ComboboxBase value={selectedProductId} options={products.map((product) => ({ value: product.production_version_id, label: localizedProductionVersionName(product.production_version_name) || product.production_version_code, description: `${product.production_version_code} · ${product.display_code} · ${product.mbom_code} · ${product.routing_code} · ${product.base_uom_code} · ${product.site_code}` }))} onValueChange={(value) => { const product = products.find((item) => item.production_version_id === value); if (!product) return; setSelectedProductId(product.production_version_id); setSelectedProduct(product); setItemCode(product.item_code || product.display_code); }} onSearchChange={setProductSearch} placeholder={t('workOrders.create.productionVersionSelector.placeholder')} emptyMessage={t('workOrders.create.productSelector.empty')} loading={productsLoading} error={productsError || undefined} aria-label={t('workOrders.create.fields.productionVersion')} />{!productsError && !productsLoading && products.length === 0 && <p className="mt-1.5 text-xs text-amber-300">{t('workOrders.create.productSelector.emptyHint')}</p>}</div>
          {selectedProduct && <div className="rounded-md border border-action/30 bg-action/10 p-4"><div className="mb-2 flex items-center justify-between gap-3"><div className="text-xs font-bold uppercase tracking-wide text-action">{t('workOrders.create.configurationAndReadiness')}</div><span className="text-xs font-semibold text-emerald-300">{t('workOrders.create.readiness.ready')}</span></div><div className="grid gap-2 text-sm sm:grid-cols-2"><SummaryRow label={t('workOrders.create.fields.productionVersion')} value={localizedProductionVersionName(selectedProduct.production_version_name)} help={t('workOrders.create.fieldHelp.productionVersion')} /><SummaryRow label={t('workOrders.create.fields.productName')} value={`${localizedProductName(selectedProduct.item_name)} · ${selectedProduct.revision_code}`} help={t('workOrders.create.fieldHelp.productionVersion')} /><SummaryRow label={t('workOrders.create.fields.mbom')} value={`${localizedBusinessName(selectedProduct.mbom_name, selectedProduct.mbom_code)} · ${selectedProduct.mbom_code}`} help={t('workOrders.create.fieldHelp.productionVersion')} /><SummaryRow label={t('workOrders.create.fields.routing')} value={`${localizedBusinessName(selectedProduct.routing_name, selectedProduct.routing_code)} · ${selectedProduct.routing_code}`} help={t('workOrders.create.fieldHelp.productionVersion')} /><SummaryRow label={t('workOrders.create.fields.site')} value={`${selectedProduct.site_code} · ${selectedProduct.base_uom_code}`} mono help={t('workOrders.create.fieldHelp.productionVersion')} /><SummaryRow label={t('woDetail.lineSelectionMode')} value={t('lineSelection.mode.AUTO')} help={t('woDetail.oneWorkOrderOneLine')} /></div></div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><UomNumberInput label={<FieldLabel t={t} labelKey="woCreate.quantity" helpKey="workOrders.create.fieldHelp.quantity" required />} required min="0.000001" allowZero={false} value={quantity} onValueChange={setQuantity} uom={selectedProduct?.base_uom || (selectedProduct ? { id: selectedProduct.base_uom_id, code: selectedProduct.base_uom_code, decimal_precision: selectedProduct.base_uom_decimal_precision, allow_fraction: selectedProduct.base_uom_allow_fraction, lifecycle_status: 'Released' } : undefined)} className="bg-slate-950 border-slate-800 p-3.5 font-mono text-sm text-slate-100" /><div><FieldLabel t={t} labelKey="woCreate.targetDate" helpKey="workOrders.create.fieldHelp.targetDate" required /><input required type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-md p-3.5 font-mono text-sm text-slate-100 focus:outline-none focus:border-action" /></div></div>
          <div className="pt-4 flex justify-end"><Button data-testid="work-order-create-submit" type="submit" disabled={submitting || !selectedProduct || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || (selectedProduct?.min_lot_size != null && Number(quantity) < Number(selectedProduct.min_lot_size)) || (selectedProduct?.max_lot_size != null && Number(quantity) > Number(selectedProduct.max_lot_size))}><CheckCircle className="h-4 w-4" />{t('woCreate.submit')}</Button></div>
        </form>
      </div>

      <BaseModal open={Boolean(requestFailure)} title={<span className="flex items-center gap-2 text-rose-200"><AlertTriangle className="h-5 w-5" />{t('workOrders.creation.failed')}</span>} onClose={() => setRequestFailure(null)} size="sm" placement="center" footer={<Button variant="secondary" onClick={() => setRequestFailure(null)}>{t('common.close')}</Button>}>
        {requestFailure ? <div><p className="text-sm text-foreground">{requestFailure.detail}</p><p className="mt-3 text-xs text-rose-300">{t('workOrders.creation.reference')}: <span className="font-mono">{requestFailure.reference}</span></p></div> : null}
      </BaseModal>

      <BaseModal open={Boolean(workflowId)} title={<div><div>{t('workOrders.creation.title')}</div><div className="mt-1 text-sm font-normal text-muted-foreground">{localizedProductName(selectedProduct?.item_name || '') || itemCode} · {itemCode} · {quantity} PCS · {targetDate}</div></div>} onClose={() => setWorkflowId(null)} size="xl" placement="center" contentClassName="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]" footerLeft={<span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Radio className={`h-3.5 w-3.5 ${connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`} />{connectionText} · {workflowStatus}</span>} footer={<><Button variant="secondary" onClick={() => setWorkflowId(null)} disabled={workflowStatus === 'running' || workflowStatus === 'accepted'}>{t('common.close')}</Button>{workflowStatus === 'succeeded' && <Button onClick={closeWorkflow}>{t('workOrders.creation.openWorkOrder')}</Button>}</>}>
        {workflowId ? <>
            <section aria-live="polite"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-slate-100">{t('workOrders.creation.timeline')}</h3><span className="text-xs text-slate-400">{steps.filter((step) => ['succeeded', 'event_queued'].includes(step.status)).length} / {steps.length} {t('workOrders.creation.completed')}</span></div><div className="space-y-3">{steps.map((step) => <WorkflowStepRow key={step.id} step={step} t={t} onNavigate={(route) => navigate(route)} />)}</div>{workflowError && workflowStatus === 'failed' && <div className="mt-4 rounded-md border border-rose-700 bg-rose-950/30 p-4" aria-live="assertive"><p className="font-semibold text-rose-200">{t('workOrders.creation.failed')}</p><p className="mt-1 text-sm text-rose-100">{translateWorkOrderError(workflowError.detail || workflowError.code, t)}</p><p className="mt-2 text-xs text-rose-300">{t('workOrders.creation.reference')}: {workflowError.technical_reference || workflowId}</p></div>}</section>
            <aside className="rounded-md border border-slate-700 bg-slate-950/50 p-4 space-y-4"><h3 className="font-semibold text-slate-100">{t('workOrders.creation.summary')}</h3><SummaryRow label={t('workOrders.create.fields.productName')} value={localizedProductName(selectedProduct?.item_name || '') || itemCode} help={t('workOrders.create.fieldHelp.productionVersion')} /><SummaryRow label={t('woCreate.itemCode')} value={itemCode} mono help={t('woDetail.help.itemCode')} /><SummaryRow label={t('woCreate.quantity')} value={`${quantity} PCS`} help={t('workOrders.create.fieldHelp.quantity')} /><SummaryRow label={t('woCreate.targetDate')} value={targetDate} help={t('workOrders.create.fieldHelp.targetDate')} /><SummaryRow label={t('woDetail.lineSelectionMode')} value={t('lineSelection.mode.AUTO')} help={t('woDetail.oneWorkOrderOneLine')} /><div className="border-t border-slate-800 pt-3"><SummaryRow label={t('workOrders.creation.reference')} value={workflowId} mono help={t('workOrders.create.fieldHelp.workOrderCode')} /><button onClick={copyReference} className="mt-2 inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200"><ClipboardCopy className="h-3.5 w-3.5" />{t('workOrders.creation.copyReference')}</button></div>{workflowResult && <div className="border-t border-slate-800 pt-3 space-y-2"><SummaryRow label={t('workOrders.creation.workOrder')} value={workflowResult.work_order_code || workflowResult.work_order_id || '-'} mono help={t('workOrders.create.fieldHelp.workOrderCode')} /><SummaryRow label={t('woDetail.lineLevelReadiness')} value={workflowResult.lineSelectionStatus ? t(`lineSelection.status.${workflowResult.lineSelectionStatus}`) : '-'} help={t('woDetail.oneWorkOrderOneLine')} /><SummaryRow label={t('woDetail.selectedProductionLine')} value={workflowResult.selectedProductionLineCode || '-'} help={t('woDetail.oneWorkOrderOneLine')} />{workflowResult.fallbackReason && <SummaryRow label={t('woDetail.fallbackReason')} value={t(`lineSelection.reason.${workflowResult.fallbackReason}`)} help={t('woDetail.oneWorkOrderOneLine')} />}<SummaryRow label={t('workOrders.creation.operations')} value={workflowResult.operationCount ?? '-'} help={t('woDetail.help.operations')} /><SummaryRow label={t('workOrders.creation.materials')} value={workflowResult.materialCount ?? '-'} help={t('woDetail.help.stockCheck')} /></div>}</aside>
        </> : null}
      </BaseModal>
    </div>
  );
};

function SummaryRow({ label, value, mono = false, help }: { label: string; value: React.ReactNode; mono?: boolean; help?: string }) { return <div className="flex justify-between gap-3 text-sm"><span className="inline-flex items-center gap-1 text-slate-400">{label}{help && <FieldHelpPopover label={label} title={label} content={help} />}</span><span className={`text-right text-slate-100 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span></div>; }

function FieldLabel({ t, labelKey, helpKey, required = false }: { t: (key: string) => string; labelKey: string; helpKey: string; required?: boolean }) {
  const label = t(labelKey);
  return <label className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-slate-300">{label}{required ? ' *' : ''}<FieldHelpPopover label={label} title={label} content={t(helpKey)} /></label>;
}

function localizedProductName(value: Record<string, string> | string) {
  if (typeof value === 'string') return value;
  return value.vi || value.en || value.ja || value.ko || '';
}

function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function localizedProductionVersionName(value: Record<string, string> | string | undefined) {
  if (!value) return '';
  return typeof value === 'string' ? value : value.vi || value.en || value.ja || value.ko || '';
}

function localizedBusinessName(value: Record<string, string> | string | undefined, fallback: string) {
  if (!value) return fallback;
  return typeof value === 'string' ? value : value.vi || value.en || value.ja || value.ko || fallback;
}

function WorkflowStepRow({ step, t, onNavigate }: { step: WorkflowStep & { titleKey: string }; t: (key: string, params?: Record<string, any>) => string; onNavigate: (route: string) => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tone = { running: 'border-action bg-action/10 text-action', succeeded: 'border-emerald-700 bg-emerald-950/30 text-emerald-300', event_queued: 'border-cyan-700 bg-cyan-950/30 text-cyan-300', failed: 'border-rose-700 bg-rose-950/30 text-rose-300', warning: 'border-amber-700 bg-amber-950/30 text-amber-300', timed_out: 'border-rose-700 bg-rose-950/30 text-rose-300', pending: 'border-slate-700 bg-slate-950/30 text-slate-500', skipped: 'border-slate-700 bg-slate-950/30 text-slate-500', cancelled: 'border-slate-700 bg-slate-950/30 text-slate-500' }[step.status];
  const message = step.message_key ? t(step.message_key, step.message_params) : t(`workOrders.creation.status.${step.status}`);
  const businessResults = step.result && Object.entries(step.result).filter(([key]) => !/(^|_)(id|uuid)$/i.test(key) && !/Id$/.test(key));
  const errorMessage = step.error ? translateWorkOrderError(step.error.detail || step.error.code, t) : '';
  const errorCode = step.error?.detail?.split(':', 1)[0] || step.error?.code || '';
  const navigationRoute = errorCode === 'WORK_ORDER_SHIFT_NOT_RESOLVED' ? '/master-data/resource-calendars' : errorCode ? '/master-data/production-versions' : '';
  return <div className={`rounded-md border p-3 ${tone}`}><div className="flex items-start gap-3"><span className="mt-0.5">{statusIcon(step.status)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-sm text-slate-100">{t(step.titleKey)}</p><span className="text-xs uppercase tracking-wide">{t(`workOrders.creation.status.${step.status}`)}</span></div><p className="mt-1 text-sm text-slate-300">{message}</p>{businessResults && businessResults.length > 0 && <p className="mt-2 text-xs text-slate-400">{businessResults.map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>}{step.error && <div className="mt-2 rounded border border-rose-800/80 bg-rose-950/40 p-2 text-xs text-rose-100"><p>{errorMessage}</p><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" className="inline-flex items-center gap-1 text-rose-200 hover:text-white" onClick={() => setDetailsOpen((current) => !current)}>{detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{t(detailsOpen ? 'workOrders.creation.errorDetails.hide' : 'workOrders.creation.errorDetails.show')}</button>{navigationRoute && <button type="button" className="inline-flex items-center gap-1 text-cyan-200 hover:text-white" onClick={() => onNavigate(navigationRoute)}><ExternalLink className="h-3.5 w-3.5" />{t(errorCode === 'WORK_ORDER_SHIFT_NOT_RESOLVED' ? 'workOrders.creation.errorDetails.openCalendars' : 'workOrders.creation.errorDetails.openProductionVersion')}</button>}</div>{detailsOpen && <div className="mt-2 space-y-1 border-t border-rose-800/70 pt-2 text-rose-200"><p><span className="font-semibold">{t('workOrders.creation.errorDetails.code')}:</span> <span className="font-mono">{errorCode || '-'}</span></p><p><span className="font-semibold">{t('workOrders.creation.errorDetails.detail')}:</span> <span className="font-mono break-words">{step.error.detail || '-'}</span></p>{step.error.technical_reference && <p><span className="font-semibold">{t('workOrders.creation.reference')}:</span> <span className="font-mono">{step.error.technical_reference}</span></p>}</div>}</div>}</div></div></div>;
}
