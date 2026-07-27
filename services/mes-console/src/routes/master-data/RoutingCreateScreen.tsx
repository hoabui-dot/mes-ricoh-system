import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { LocalizedTextFields, emptyLocalized, type LocalizedValues } from '../../components/LocalizedTextFields';
import { Button, SelectBase } from '../../components/ui';
import { authHeaders, fetchResource, masterDataBaseUrl, postResource, putResource } from '../../lib/masterDataApi';
import { toast } from 'sonner';

type FlowRow = { seq: number; operation_id: string; work_center_id: string; predecessor_seq: string };
type SupportedWorkCenter = { work_center: { id: string; code: string; name: unknown }; shopfloor: { code: string; name: unknown }; factory: { code: string; name: unknown }; supporting_workstation_count: number };

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  return String(item.vi || item.en || item.ja || item.ko || '');
}

export const RoutingCreateScreen: React.FC = () => {
  const { user } = useAuth(); const { t } = useI18n(); const navigate = useNavigate(); const { id } = useParams(); const editing = Boolean(id);
  const [operations, setOperations] = useState<any[]>([]); const [supported, setSupported] = useState<Record<string, SupportedWorkCenter[]>>({});
  const [saving, setSaving] = useState(false); const [codePreview, setCodePreview] = useState('');
  const [form, setForm] = useState({ code: '', name: emptyLocalized(), description: emptyLocalized(), business_version: '1', routing_type: 'Standard', production_purpose: emptyLocalized(), effective_from: new Date().toISOString().slice(0, 10), effective_to: '', engineering_note: emptyLocalized(), reference_document: '' });
  const [flow, setFlow] = useState<FlowRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [operationRows, previewResponse] = await Promise.all([fetchResource('operations', user), id ? Promise.resolve(null) : fetch(`${masterDataBaseUrl()}/routing-headers/code-preview`, { headers: authHeaders(user) })]);
        setOperations(operationRows.filter((row: any) => !['Inactive', 'Obsolete'].includes(row.lifecycle_status)));
        if (!id && previewResponse) { const preview = await previewResponse.json(); if (!previewResponse.ok) throw new Error(preview.message || preview.error); setCodePreview(preview.preview_code || ''); }
        if (id) {
          const [headers, routeRows] = await Promise.all([fetchResource('routing-headers', user), fetchResource('routing-operations', user, '?limit=500')]);
          const current = headers.find((row: any) => row.master_id === id);
          if (!current) throw new Error('Routing not found');
          setCodePreview(current.code || '');
          setForm({ code: current.code || '', name: current.name || emptyLocalized(), description: current.description || emptyLocalized(), business_version: current.business_version || String(current.version_no || 1), routing_type: current.routing_type || 'Standard', production_purpose: current.production_purpose || emptyLocalized(), effective_from: String(current.effective_from || '').slice(0, 10), effective_to: current.effective_to ? String(current.effective_to).slice(0, 10) : '', engineering_note: current.engineering_note || emptyLocalized(), reference_document: current.reference_document || '' });
          setFlow(routeRows.filter((row: any) => row.routing_header_id === id && !['Inactive', 'Obsolete'].includes(row.lifecycle_status)).sort((a: any, b: any) => Number(a.seq) - Number(b.seq)).map((row: any) => ({ seq: Number(row.seq), operation_id: row.operation_id, work_center_id: row.work_center_id, predecessor_seq: row.predecessor_seq == null ? '' : String(row.predecessor_seq) })));
        }
      } catch (error: any) { toast.error(error.message); }
    })();
  }, [user?.userId, id]);

  const updateForm = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const updateFlow = (index: number, changes: Partial<FlowRow>) => setFlow((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
  const loadSupported = async (operationId: string): Promise<SupportedWorkCenter[]> => {
    if (!operationId) return [];
    const response = await fetch(`${masterDataBaseUrl()}/operations/${operationId}/supported-work-centers?_=${Date.now()}`, { headers: authHeaders(user), cache: 'no-store' });
    const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || payload.error || 'Supported Work Centers could not be loaded');
    const rows = (payload.items || []) as SupportedWorkCenter[]; setSupported((current) => ({ ...current, [operationId]: rows })); return rows;
  };
  const selectOperation = async (index: number, operationId: string) => {
    try { const options = await loadSupported(operationId); const currentWorkCenter = flow[index]?.work_center_id; updateFlow(index, { operation_id: operationId, work_center_id: options.some((item) => item.work_center.id === currentWorkCenter) ? currentWorkCenter : '' }); if (currentWorkCenter && !options.some((item) => item.work_center.id === currentWorkCenter)) toast.warning(t('routing.workCenterChanged')); } catch (error: any) { toast.error(error.message); updateFlow(index, { operation_id: operationId, work_center_id: '' }); }
  };
  const addFlow = () => setFlow((current) => [...current, { seq: (current.length + 1) * 10, operation_id: '', work_center_id: '', predecessor_seq: current.length ? String(current[current.length - 1].seq) : '' }]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!flow.length || flow.some((row) => !row.operation_id || !row.work_center_id)) { toast.error(t('routing.operationFlowRequired')); return; }
    setSaving(true);
    try {
      const created = editing ? await putResource('routing-headers', id as string, { ...form, effective_to: form.effective_to || null }, user) : await postResource('routing-headers', { ...form, code: codePreview, effective_to: form.effective_to || null }, user);
      const routingId = id || created.master_id || created.data?.master_id;
      const operationResponse = await fetch(`${masterDataBaseUrl()}/routing-headers/${routingId}/operations`, { method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: flow.map((row) => ({ operation_id: row.operation_id, work_center_id: row.work_center_id, seq: Number(row.seq), predecessor_seq: row.predecessor_seq ? Number(row.predecessor_seq) : null })) }) });
      const operationPayload = await operationResponse.json().catch(() => ({}));
      if (!operationResponse.ok) throw new Error(operationPayload.message || operationPayload.error || t('routing.operationFlowRequired'));
      toast.success(t(editing ? 'common.save' : 'routing.createSuccess')); navigate(`/master-data/routings/${routingId}/operations`);
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-6"><div className="flex items-center justify-between"><Button variant="secondary" onClick={() => navigate('/master-data/routings')}><ArrowLeft className="h-4 w-4" />{t('routing.title')}</Button></div><div className="mes-page-header"><div><h1 className="text-xl font-bold text-foreground">{t(editing ? 'common.edit' : 'routing.create')}</h1><p className="text-sm text-muted-foreground">{t('routing.createSubtitle')}</p></div></div><form onSubmit={submit} className="space-y-6"><section className="space-y-4 rounded-md border border-border bg-surface p-6"><h2 className="text-base font-bold text-foreground">{t('routing.section.basic')}</h2><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.code')} *</span><input readOnly required value={codePreview} className="w-full cursor-not-allowed rounded-md border border-border bg-surface-subtle p-3 font-mono text-action" /><span className="text-xs text-muted-foreground">{t('routing.codePreviewHelp')}</span></label><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.version')} *</span><input required value={form.business_version} onChange={(event) => updateForm('business_version', event.target.value)} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.type')} *</span><SelectBase required value={form.routing_type} onValueChange={(value) => updateForm('routing_type', value)} options={['Standard', 'Alternate', 'Rework'].map((value) => ({ value, label: t(`routing.type.${value}`) }))} aria-label={t('routing.type')} /></label><LocalizedTextFields label={t('routing.name')} value={form.name} onChange={(value: LocalizedValues) => updateForm('name', value)} required /><LocalizedTextFields label={t('routing.description')} value={form.description} onChange={(value: LocalizedValues) => updateForm('description', value)} multiline /></div></section><section className="space-y-4 rounded-md border border-border bg-surface p-6"><h2 className="text-base font-bold text-foreground">{t('routing.section.engineering')}</h2><div className="grid gap-4 sm:grid-cols-2"><LocalizedTextFields label={t('routing.productionPurpose')} value={form.production_purpose} onChange={(value: LocalizedValues) => updateForm('production_purpose', value)} multiline /><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.validFrom')} *</span><input required type="date" value={form.effective_from} onChange={(event) => updateForm('effective_from', event.target.value)} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.validTo')}</span><input type="date" value={form.effective_to} onChange={(event) => updateForm('effective_to', event.target.value)} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /></label><LocalizedTextFields label={t('routing.engineeringNote')} value={form.engineering_note} onChange={(value: LocalizedValues) => updateForm('engineering_note', value)} multiline /><label className="space-y-1 sm:col-span-2"><span className="text-sm text-foreground">{t('routing.referenceDocument')}</span><input value={form.reference_document} onChange={(event) => updateForm('reference_document', event.target.value)} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /></label></div></section><section className="space-y-4 rounded-md border border-border bg-surface p-6"><div><h2 className="text-base font-bold text-foreground">{t('routing.operationFlow')}</h2><p className="text-sm text-muted-foreground">{t('routing.operationFlowHelp')}</p></div>{flow.map((row, index) => { const options = supported[row.operation_id] || []; return <div key={index} className="grid gap-3 rounded-md border border-border bg-surface-subtle p-4 sm:grid-cols-[100px_1.2fr_1.5fr_140px_auto]"><label className="order-3 space-y-1 sm:order-1"><span className="text-xs text-muted-foreground">{t('mbom.seq')}</span><input required type="number" min="1" value={row.seq} onChange={(event) => updateFlow(index, { seq: Number(event.target.value) })} className="w-full rounded-md border border-border bg-background p-2 text-foreground" /></label><div className="order-1 sm:order-2"><SelectBase required label={t('routing.operation')} value={row.operation_id} onValueChange={(value) => void selectOperation(index, value)} options={operations.map((item) => ({ value: item.master_id, label: text(item.name) || item.code, secondaryLabel: item.code }))} placeholder={t('routing.selectOperationFirst')} aria-label={t('routing.operation')} /></div><div className="order-2 sm:order-3"><SelectBase required label={t('routing.workCenter')} disabled={!row.operation_id} value={row.work_center_id} onValueChange={(value) => updateFlow(index, { work_center_id: value })} options={options.map((item) => ({ value: item.work_center.id, label: text(item.work_center.name) || item.work_center.code, secondaryLabel: `${item.work_center.code} · ${text(item.factory.name)} / ${text(item.shopfloor.name)}` }))} placeholder={row.operation_id ? t('routing.selectWorkCenter') : t('routing.selectOperationFirst')} aria-label={t('routing.workCenter')} /></div><label className="order-4 space-y-1"><span className="text-xs text-muted-foreground">{t('routing.predecessor')}</span><input type="number" min="1" value={row.predecessor_seq} onChange={(event) => updateFlow(index, { predecessor_seq: event.target.value })} className="w-full rounded-md border border-border bg-background p-2 text-foreground" /></label><button type="button" onClick={() => setFlow(flow.filter((_item, itemIndex) => itemIndex !== index))} className="order-5 self-end rounded-md p-2 text-muted-foreground hover:bg-hover" aria-label={t('common.remove')}><Trash2 className="h-4 w-4" /></button></div>; })}<div className="flex justify-end"><Button type="button" variant="secondary" onClick={addFlow}><Plus className="h-4 w-4" />{t('routing.addOperation')}</Button></div></section><div className="flex justify-end"><Button type="submit" disabled={saving || !codePreview}><Save className="h-4 w-4" />{t(editing ? 'common.save' : 'common.create')}</Button></div></form></div>;
};
