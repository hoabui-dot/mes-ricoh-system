import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { authHeaders, fetchResource, masterDataBaseUrl } from '../../lib/masterDataApi';
import { Button, Confirmation, SelectBase } from '../../components/ui';

function displayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  return String(item.vi || item.en || item.ja || item.ko || '');
}

type OperationForm = {
  operation_id: string;
  work_center_id: string;
  seq: number;
  predecessor_seq: string;
  scheduling_mode: string;
  queue_time_min: number;
  move_time_min: number;
  overlap_allowed: boolean;
  transfer_batch_qty: string;
  milestone_flag: boolean;
  worker_skill_requirements: any[];
};

const emptyForm = (): OperationForm => ({ operation_id: '', work_center_id: '', seq: 10, predecessor_seq: '', scheduling_mode: 'Finite', queue_time_min: 0, move_time_min: 0, overlap_allowed: false, transfer_batch_qty: '', milestone_flag: false, worker_skill_requirements: [] });

export const RoutingOperationsScreen: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const localizedText = useLocalizedText();
  const [routing, setRouting] = useState<any>(null);
  const [operations, setOperations] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [workerSkills, setWorkerSkills] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<OperationForm>(emptyForm());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [removeOperationIndex, setRemoveOperationIndex] = useState<number | null>(null);
  const [removeRequirementIndex, setRemoveRequirementIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const [headers, operationRows, wcRows, routeRows, skillRows] = await Promise.all([
        fetchResource('routing-headers', user), fetchResource('operations', user), fetchResource('work-centers', user),
        fetchResource('routing-operations', user, '?limit=500'), fetchResource('worker-skills', user),
      ]);
      setRouting(headers.find((row: any) => row.master_id === id));
      setOperations(operationRows.filter((row: any) => !['Inactive', 'Obsolete'].includes(row.lifecycle_status)));
      setWorkCenters(wcRows.filter((row: any) => row.active_flag !== false && !['Inactive', 'Obsolete'].includes(row.lifecycle_status)));
      setWorkerSkills(skillRows.filter((skill: any) => skill.scope === 'Employee' && !['Inactive', 'Obsolete'].includes(skill.lifecycle_status)));
      setRows(routeRows.filter((row: any) => row.routing_header_id === id && !['Inactive', 'Obsolete'].includes(row.lifecycle_status)).sort((a: any, b: any) => Number(a.seq) - Number(b.seq)));
    } catch (error: any) { toast.error(error.message); }
  };

  useEffect(() => { void load(); }, [id, user?.userId]);

  const loadDefaults = async (operationId: string) => {
    if (!operationId) return;
    const response = await fetch(`${masterDataBaseUrl()}/operations/${operationId}/worker-skill-requirements`, { headers: authHeaders(user) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setForm((current) => ({ ...current, worker_skill_requirements: (payload.data || []).map((item: any) => ({ ...item, inherited: true, effective_from: String(item.effective_from || '').slice(0, 10), effective_to: item.effective_to ? String(item.effective_to).slice(0, 10) : '', status: 'Active' })) }));
  };

  const selectOperation = (operationId: string) => {
    const operation = operations.find((row) => row.master_id === operationId);
    setForm((current) => ({ ...current, operation_id: operationId, worker_skill_requirements: [] }));
    void loadDefaults(operationId);
    if (!operation) toast.error(t('routing.operationFlowRequired'));
  };

  const saveReplacement = async (desiredRows: any[]) => {
    const response = await fetch(`${masterDataBaseUrl()}/routing-headers/${id}/operations`, { method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: desiredRows.map((row) => ({ operation_id: row.operation_id, work_center_id: row.work_center_id, seq: Number(row.seq), predecessor_seq: row.predecessor_seq == null || row.predecessor_seq === '' ? null : Number(row.predecessor_seq), scheduling_mode: row.scheduling_mode || 'Finite', queue_time_min: Number(row.queue_time_min || 0), move_time_min: Number(row.move_time_min || 0), overlap_allowed: row.overlap_allowed === true, transfer_batch_qty: row.transfer_batch_qty === '' || row.transfer_batch_qty == null ? null : Number(row.transfer_batch_qty), milestone_flag: row.milestone_flag === true })) }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || t('routing.operationFlowRequired'));
    await load();
    return payload.data || [];
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.operation_id || !form.work_center_id) return;
    setSaving(true);
    try {
      const desired = rows.map((row) => ({ ...row }));
      const next = { ...form, predecessor_seq: form.predecessor_seq === '' ? null : Number(form.predecessor_seq) };
      if (editingIndex === null) desired.push(next); else desired[editingIndex] = { ...desired[editingIndex], ...next };
      const saved = await saveReplacement(desired);
      const savedRow = saved.find((row: any) => row.operation_id === form.operation_id && Number(row.seq) === Number(next.seq));
      if (savedRow?.master_id) {
        const response = await fetch(`${masterDataBaseUrl()}/routing-operations/${savedRow.master_id}/worker-skill-requirements`, { method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ requirements: form.worker_skill_requirements }) });
        if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || payload.error || 'Worker skill requirements could not be saved'); }
      }
      toast.success(t(editingIndex === null ? 'routing.operationAdded' : 'common.save'));
      setEditingIndex(null); setForm(emptyForm());
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };

  const editRow = (index: number) => {
    const row = rows[index];
    setEditingIndex(index);
    setForm({ ...emptyForm(), ...row, seq: Number(row.seq), predecessor_seq: row.predecessor_seq == null ? '' : String(row.predecessor_seq), transfer_batch_qty: row.transfer_batch_qty == null ? '' : String(row.transfer_batch_qty), worker_skill_requirements: [] });
    void loadDefaults(row.operation_id);
  };

  const removeRow = async () => {
    if (removeOperationIndex === null) return;
    setSaving(true);
    try { await saveReplacement(rows.filter((_row, index) => index !== removeOperationIndex)); toast.success(t('common.delete')); } catch (error: any) { toast.error(error.message); } finally { setRemoveOperationIndex(null); setSaving(false); }
  };

  const moveRow = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const reordered = [...rows]; [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const sequenceMap = new Map(reordered.map((row, rowIndex) => [Number(row.seq), (rowIndex + 1) * 10]));
    const normalized = reordered.map((row, rowIndex) => ({ ...row, seq: (rowIndex + 1) * 10, predecessor_seq: row.predecessor_seq == null ? null : sequenceMap.get(Number(row.predecessor_seq)) ?? null }));
    setSaving(true);
    try { await saveReplacement(normalized); } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };

  const updateRequirement = (index: number, key: string, value: any) => setForm((current) => ({ ...current, worker_skill_requirements: current.worker_skill_requirements.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value, inherited: false } : item) }));
  const addRequirement = () => setForm((current) => ({ ...current, worker_skill_requirements: [...current.worker_skill_requirements, { skill_id: workerSkills[0]?.master_id || '', minimum_level: 'L1', required_persons: 1, mandatory_flag: true, effective_from: new Date().toISOString().slice(0, 10), effective_to: '', status: 'Active', inherited: false }] }));

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex items-center justify-between"><Link to="/master-data/routings" className="inline-flex items-center gap-2 text-sm text-action"><ArrowLeft className="h-4 w-4" />{t('routing.title')}</Link></div>
    <div className="mes-page-header"><div><h1 className="text-xl font-bold text-foreground">{routing?.code || t('routing.title')}</h1><p className="text-sm text-muted-foreground">{displayText(routing?.name)}</p></div></div>
    <div className="overflow-hidden rounded-md border border-border bg-surface"><table className="mes-table"><thead><tr><th>{t('mbom.seq')}</th><th>{t('routing.operation')}</th><th>{t('routing.workCenter')}</th><th>{t('routing.predecessor')}</th><th className="text-right">{t('common.actions')}</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.master_id}><td className="font-mono">{row.seq}</td><td><div className="font-semibold">{displayText(row.operation_name) || row.operation_code}</div><div className="text-xs text-muted-foreground">{row.operation_code}</div></td><td><div>{displayText(row.work_center_name) || row.work_center_code}</div><div className="text-xs text-muted-foreground">{row.work_center_code}</div></td><td>{row.predecessor_seq ?? t('routing.detail.firstOrParallel')}</td><td><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title={t('common.moveUp')} disabled={index === 0 || saving} onClick={() => void moveRow(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title={t('common.moveDown')} disabled={index === rows.length - 1 || saving} onClick={() => void moveRow(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title={t('common.edit')} onClick={() => editRow(index)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title={t('common.delete')} onClick={() => setRemoveOperationIndex(index)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="p-8 text-center text-muted-foreground">{t('routing.noOperations')}</div>}</div>
    <form onSubmit={submit} className="space-y-4 rounded-md border border-border bg-surface p-6"><div className="grid gap-4 sm:grid-cols-4"><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.operation')} *</span><SelectBase required value={form.operation_id} onValueChange={selectOperation} options={operations.map((row) => ({ value: row.master_id, label: `${localizedText(row.name) || row.code}`, secondaryLabel: row.code }))} aria-label={t('routing.operation')} /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.workCenter')} *</span><SelectBase required value={form.work_center_id} onValueChange={(value) => setForm({ ...form, work_center_id: value })} options={workCenters.map((row) => ({ value: row.master_id, label: `${localizedText(row.name) || row.code}`, secondaryLabel: row.code }))} aria-label={t('routing.workCenter')} /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('mbom.seq')} *</span><input required type="number" min="1" value={form.seq} onChange={(e) => setForm({ ...form, seq: Number(e.target.value) })} className="w-full rounded-md border border-input bg-input p-3 text-foreground" /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.predecessor')}</span><input type="number" min="1" value={form.predecessor_seq} onChange={(e) => setForm({ ...form, predecessor_seq: e.target.value })} className="w-full rounded-md border border-input bg-input p-3 text-foreground" /></label></div><div className="grid gap-4 sm:grid-cols-5"><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.detail.schedulingMode')}</span><input value={form.scheduling_mode} onChange={(e) => setForm({ ...form, scheduling_mode: e.target.value })} className="w-full rounded-md border border-input bg-input p-3 text-foreground" /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.detail.queueTime')}</span><input type="number" min="0" value={form.queue_time_min} onChange={(e) => setForm({ ...form, queue_time_min: Number(e.target.value) })} className="w-full rounded-md border border-input bg-input p-3 text-foreground" /></label><label className="space-y-1"><span className="text-sm text-foreground">{t('routing.detail.moveTime')}</span><input type="number" min="0" value={form.move_time_min} onChange={(e) => setForm({ ...form, move_time_min: Number(e.target.value) })} className="w-full rounded-md border border-input bg-input p-3 text-foreground" /></label><label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.overlap_allowed} onChange={(e) => setForm({ ...form, overlap_allowed: e.target.checked })} />{t('routing.detail.overlap')}</label><label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.milestone_flag} onChange={(e) => setForm({ ...form, milestone_flag: e.target.checked })} />{t('routing.detail.milestone')}</label></div>
      <section className="space-y-3 border-t border-border pt-4"><div><h2 className="font-bold">{t('routing.workerRequirements')}</h2><p className="text-sm text-muted-foreground">{t('routing.workerRequirementsHelp')}</p></div>{form.worker_skill_requirements.map((requirement, index) => <div key={requirement.master_id || index} className="grid gap-3 rounded border border-border p-3 md:grid-cols-[minmax(0,1fr)_120px_110px_110px_40px]"><SelectBase value={requirement.skill_id} onValueChange={(value) => updateRequirement(index, 'skill_id', value)} options={workerSkills.map((skill) => ({ value: skill.master_id, label: displayText(skill.name) || skill.code, secondaryLabel: skill.code }))} aria-label={t('operationCatalog.workerSkill')} required /><SelectBase value={requirement.minimum_level} onValueChange={(value) => updateRequirement(index, 'minimum_level', value)} options={['Basic', 'L1', 'L2', 'L3', 'L4', 'L5'].map((value) => ({ value, label: value }))} aria-label={t('operationCatalog.minimumLevel')} required /><input type="number" min="1" value={requirement.required_persons} onChange={(event) => updateRequirement(index, 'required_persons', Number(event.target.value))} className="rounded-md border border-input bg-input p-2 text-foreground" required /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={requirement.mandatory_flag !== false} onChange={(event) => updateRequirement(index, 'mandatory_flag', event.target.checked)} />{t('operationCatalog.mandatory')}</label><Button type="button" variant="ghost" size="icon" title={t('common.remove')} onClick={() => setRemoveRequirementIndex(index)}><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" onClick={addRequirement}><Plus className="h-4 w-4" />{t('operationCatalog.addWorkerRequirement')}</Button></section>
      <div className="flex justify-end"><Button type="submit" disabled={saving}><Save className="h-4 w-4" />{t(editingIndex === null ? 'routing.addOperation' : 'common.save')}</Button></div>
    </form>
    <Confirmation open={removeOperationIndex !== null} title={t('common.delete')} description={t('routing.removeOperationConfirm')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} destructive onClose={() => setRemoveOperationIndex(null)} onConfirm={() => void removeRow()} />
    <Confirmation open={removeRequirementIndex !== null} title={t('routing.removeWorkerRequirement')} description={t('routing.removeWorkerRequirementConfirm')} confirmLabel={t('common.remove')} cancelLabel={t('common.cancel')} destructive onClose={() => setRemoveRequirementIndex(null)} onConfirm={() => { if (removeRequirementIndex !== null) setForm((current) => ({ ...current, worker_skill_requirements: current.worker_skill_requirements.filter((_item, index) => index !== removeRequirementIndex) })); setRemoveRequirementIndex(null); }} />
  </div>;
};
