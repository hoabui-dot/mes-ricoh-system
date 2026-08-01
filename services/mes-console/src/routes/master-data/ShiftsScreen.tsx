import React, { useEffect, useState } from 'react';
import { Clock, Pencil, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { fetchResource, postResource, putResource } from '../../lib/masterDataApi';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';
import { Modal, SelectBase } from '../../components/ui';
import { BaseDataTable, type BaseDataTableColumn } from '../../components/base';

const blank = { code: '', name: '', site_id: '', start_time: '08:00', end_time: '17:00', crosses_midnight: false };

export const ShiftsScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [shifts, setShifts] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [form, setForm] = useState<any>(blank);
  const [modal, setModal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [shiftRows, siteRows] = await Promise.all([fetchResource('shifts', user), fetchResource('sites', user)]);
      setShifts(shiftRows);
      setSites(siteRows);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openModal = (row?: any) => {
    setModal(row || {});
    setForm(row ? { ...row } : { ...blank, site_id: sites[0]?.master_id || '' });
  };

  const shiftColumns: BaseDataTableColumn<any>[] = [
    { id: 'code', header: t('common.code'), accessorKey: 'code', cell: ({ row }) => <span className="font-mono font-bold text-amber-300">{row.original.code}</span> },
    { id: 'name', header: t('common.name'), accessorKey: 'name' },
    { id: 'time', header: t('shifts.time'), accessorFn: (row) => `${row.start_time} - ${row.end_time}`, cell: ({ row }) => <span className="text-muted-foreground">{row.original.start_time} - {row.original.end_time}{row.original.crosses_midnight ? ` (${t('shifts.nextDay')})` : ''}</span> },
    { id: 'status', header: t('common.status'), accessorKey: 'lifecycle_status', cell: ({ row }) => <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs">{translatedEnum(t, 'status.master', row.original.lifecycle_status)}</span> },
    { id: 'actions', header: t('common.actions'), align: 'right', cell: ({ row }) => <div className="text-right"><button onClick={() => openModal(row.original)} className="rounded-md bg-slate-800 p-2" title={t('common.edit')} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></button></div> },
  ];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = { code: form.code, name: form.name, site_id: form.site_id, start_time: form.start_time, end_time: form.end_time, crosses_midnight: Boolean(form.crosses_midnight) };
      if (modal?.master_id) await putResource('shifts', modal.master_id, payload, user);
      else await postResource('shifts', payload, user);
      toast.success(modal?.master_id ? t('shifts.updated') : t('shifts.created'));
      setModal(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-600/10 border border-amber-500/20 rounded-lg text-amber-300"><Clock className="w-6 h-6" /></div>
          <div><h1 className="text-xl font-bold">{t('shifts.title')}</h1><p className="text-xs text-slate-400">{t('shifts.subtitle')}</p></div>
        </div>
        <div className="flex gap-3"><button onClick={load} className="p-2.5 bg-slate-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={() => openModal()} className="px-4 py-2.5 bg-amber-600 rounded-lg text-sm font-semibold flex gap-2"><Plus className="w-4 h-4" />{t('shifts.create')}</button></div>
      </div>
      <BaseDataTable data={shifts} columns={shiftColumns} loading={loading} getRowId={(row) => row.master_id} onRowClick={openModal} stickyHeader />
      {modal && <Modal open title={modal.master_id ? t('shifts.edit') : t('shifts.create')} onClose={() => setModal(null)} footerLeft={<button type="button" onClick={() => setModal(null)} className="rounded-md border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-foreground hover:bg-hover">{t('common.cancel')}</button>} footer={<button type="submit" form="shift-form" className="rounded-md bg-action px-5 py-2 text-sm font-semibold text-white">{t('common.save')}</button>}><form id="shift-form" onSubmit={save} className="space-y-4"><div className="grid grid-cols-2 gap-3"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('shifts.code')} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('shifts.name')} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /><SelectBase required value={form.site_id} onValueChange={(value) => setForm({ ...form, site_id: value })} options={sites.map((site) => ({ value: site.master_id, label: site.code }))} aria-label={t('common.site')} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.crosses_midnight} onChange={(e) => setForm({ ...form, crosses_midnight: e.target.checked })} /> {t('shifts.crossesMidnight')}</label><input type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /><input type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-full rounded-md border border-border bg-background p-3 text-foreground" /></div></form></Modal>}
    </div>
  );
};
