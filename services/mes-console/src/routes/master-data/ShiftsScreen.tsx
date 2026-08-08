import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { authHeaders, fetchResource, masterDataBaseUrl } from '../../lib/masterDataApi';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Modal, SelectBase } from '../../components/ui';
import { BaseDataTable, type BaseDataTableColumn } from '../../components/base';

type ShiftRow = { master_id?: string; name: string; start_time: string; end_time: string };
type ShiftSetForm = { shift_set_id?: string; work_center_id: string; code: string; shifts: ShiftRow[] };
const newRow = (): ShiftRow => ({ name: '', start_time: '08:00', end_time: '12:00' });
const blank = (): ShiftSetForm => ({ work_center_id: '', code: '', shifts: [newRow()] });
const displayName = (value: unknown): string => typeof value === 'string' ? value : String((value as Record<string, string> | null)?.vi || (value as Record<string, string> | null)?.en || '');

function validateRows(rows: ShiftRow[], t: (key: string) => string): string | null {
  if (!rows.length) return t('shifts.oneRequired');
  for (const row of rows) if (!row.name.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start_time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end_time) || row.end_time <= row.start_time) return t('shifts.invalidTime');
  for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) if (rows[i].start_time < rows[j].end_time && rows[j].start_time < rows[i].end_time) return t('shifts.timeConflict');
  return null;
}

export const ShiftsScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [sets, setSets] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [form, setForm] = useState<ShiftSetForm>(blank());
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [setRows, wcRows] = await Promise.all([fetchResource('shift-sets', user), fetchResource('work-centers', user)]);
      setSets(setRows); setWorkCenters(wcRows);
    } catch (err) { setError(err); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openCreate = () => { setForm(blank()); setModal('create'); };
  const openEdit = (set: any) => { setForm({ shift_set_id: set.shift_set_id, work_center_id: set.work_center_id, code: set.shift_set_code, shifts: set.shifts.map((row: any) => ({ master_id: row.master_id, name: row.name, start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5) })) } as ShiftSetForm); };
  // Keep the edit transition explicit so the form never changes Work Center.
  const editSet = (set: any) => { openEdit(set); setModal('edit'); };

  const selectWorkCenter = async (workCenterId: string) => {
    const existing = sets.find((item) => item.work_center_id === workCenterId);
    if (existing) { editSet(existing); return; }
    setForm((current) => ({ ...current, work_center_id: workCenterId, code: '' }));
    const response = await fetch(`${masterDataBaseUrl()}/shift-sets/code-preview?work_center_id=${encodeURIComponent(workCenterId)}`, { headers: authHeaders(user) });
    const preview = await response.json().catch(() => ({}));
    if (response.ok) setForm((current) => ({ ...current, work_center_id: workCenterId, code: preview.preview_code || '' }));
  };
  const updateRow = (index: number, patch: Partial<ShiftRow>) => setForm((current) => ({ ...current, shifts: current.shifts.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));
  const addRow = () => setForm((current) => ({ ...current, shifts: [...current.shifts, newRow()] }));
  const removeRow = (index: number) => setForm((current) => ({ ...current, shifts: current.shifts.filter((_, rowIndex) => rowIndex !== index) }));

  const columns: BaseDataTableColumn<any>[] = useMemo(() => [
    { id: 'workCenter', header: t('nav.workCenters'), accessorKey: 'work_center_code', cell: ({ row }) => <div><div className="font-mono font-bold text-amber-300">{row.original.work_center_code}</div><div className="text-sm text-foreground">{displayName(row.original.work_center_name)}</div></div> },
    { id: 'setCode', header: t('shifts.shiftSetCode'), accessorKey: 'shift_set_code', cell: ({ row }) => <span className="font-mono text-sm text-sky-200">{row.original.shift_set_code}</span> },
    { id: 'count', header: t('shifts.shiftSet'), accessorFn: (row) => row.shifts.length, cell: ({ row }) => <span className="rounded-full border border-sky-800 bg-sky-950/40 px-2.5 py-1 text-xs text-sky-200">{row.original.shifts.length} {t('shifts.shiftCount')}</span> },
    { id: 'times', header: t('shifts.assignedShifts'), accessorFn: (row) => row.shifts.map((shift: any) => shift.code).join(' '), cell: ({ row }) => <div className="flex flex-wrap gap-2">{row.original.shifts.map((shift: any) => <span key={shift.master_id} className="rounded-md border border-border bg-surface-subtle px-2 py-1 text-xs"><b>{shift.name}</b><span className="ml-2 text-muted-foreground">{shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}</span></span>)}</div> },
    { id: 'actions', header: t('common.actions'), accessorFn: () => '', cell: ({ row }) => <button type="button" onClick={(event) => { event.stopPropagation(); editSet(row.original); }} className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground" title={t('common.edit')}><Pencil className="h-4 w-4" /></button> },
  ], [t, sets]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.work_center_id) return toast.error(t('shifts.workCenterRequired'));
    const validation = validateRows(form.shifts, t); if (validation) return toast.error(validation);
    try {
      const response = await fetch(`${masterDataBaseUrl()}/shift-sets${form.shift_set_id ? `/${form.shift_set_id}` : ''}`, { method: form.shift_set_id ? 'PUT' : 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ work_center_id: form.work_center_id, shifts: form.shifts }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t('shifts.saveFailed'));
      toast.success(form.shift_set_id ? t('shifts.updated') : t('shifts.created')); setModal(null); await load();
    } catch (err: any) { toast.error(err.message); }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;
  const isEdit = modal === 'edit';
  return <div className="space-y-6">
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 p-5"><div className="flex items-center gap-3"><div className="rounded-lg border border-amber-500/20 bg-amber-600/10 p-3 text-amber-300"><Clock className="h-6 w-6" /></div><div><h1 className="text-xl font-bold">{t('shifts.title')}</h1><p className="text-xs text-slate-400">{t('shifts.subtitle')}</p></div></div><div className="flex gap-3"><button onClick={load} className="rounded-lg bg-slate-800 p-2.5" title={t('common.refresh')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={openCreate} className="flex gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold"><Plus className="h-4 w-4" />{t('shifts.create')}</button></div></div>
    <BaseDataTable data={sets} columns={columns} loading={loading} getRowId={(row) => row.shift_set_id} stickyHeader />
    {modal && <Modal open title={isEdit ? t('shifts.editSet') : t('shifts.createSet')} onClose={() => setModal(null)} footerLeft={<button type="button" onClick={() => setModal(null)} className="rounded-md border border-border bg-surface-subtle px-4 py-2 text-sm">{t('common.cancel')}</button>} footer={<button type="submit" form="shift-set-form" className="rounded-md bg-action px-5 py-2 text-sm font-semibold text-white">{t('common.save')}</button>}><form id="shift-set-form" onSubmit={save} className="space-y-5"><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><label className="space-y-1"><span className="block text-sm font-medium">{t('nav.workCenters')} *</span><SelectBase required disabled={isEdit} value={form.work_center_id} onValueChange={selectWorkCenter} options={[{ value: '', label: t('shifts.selectWorkCenter') }, ...workCenters.map((wc) => ({ value: wc.master_id, label: wc.code }))]} aria-label={t('nav.workCenters')} /></label><label className="space-y-1"><span className="block text-sm font-medium">{t('shifts.shiftSetCode')}</span><input readOnly value={form.code || t('shifts.generatedCode')} className="w-full rounded-md border border-border bg-muted/40 p-3 font-mono text-sm text-muted-foreground" /><span className="text-xs text-muted-foreground">{t('shifts.codeHelp')}</span></label></div><div className="rounded-md border border-border"><div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="font-semibold">{t('shifts.rowsTitle')}</h2><button type="button" onClick={addRow} className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm"><Plus className="h-4 w-4" />{t('shifts.addRow')}</button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="px-4 py-3">#</th><th className="px-4 py-3">{t('shifts.name')}</th><th className="px-4 py-3">{t('shifts.startTime')}</th><th className="px-4 py-3">{t('shifts.endTime')}</th><th className="px-4 py-3">{t('common.actions')}</th></tr></thead><tbody>{form.shifts.map((row, index) => <tr key={row.master_id || index} className="border-b border-border/60"><td className="px-4 py-3 text-muted-foreground">{index + 1}</td><td className="px-4 py-3"><input required value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} placeholder={t('shifts.namePlaceholder')} className="w-full min-w-40 rounded-md border border-border bg-background p-2.5" /></td><td className="px-4 py-3"><input required type="time" value={row.start_time} onChange={(event) => updateRow(index, { start_time: event.target.value })} className="rounded-md border border-border bg-background p-2.5" /></td><td className="px-4 py-3"><input required type="time" value={row.end_time} onChange={(event) => updateRow(index, { end_time: event.target.value })} className="rounded-md border border-border bg-background p-2.5" /></td><td className="px-4 py-3"><button type="button" disabled={form.shifts.length === 1} onClick={() => removeRow(index)} className="rounded-md p-2 text-muted-foreground hover:text-red-300 disabled:opacity-30" title={t('shifts.removeRow')}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div><p className="px-4 py-3 text-xs text-muted-foreground">{t('shifts.timeHelp')}</p></div></form></Modal>}
  </div>;
};
