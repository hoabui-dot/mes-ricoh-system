import React, { useEffect, useState } from 'react';
import { Clock, Pencil, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { fetchResource, postResource, putResource } from '../../lib/masterDataApi';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';

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
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950 text-xs text-slate-400 uppercase"><tr><th className="px-5 py-3">{t('common.code')}</th><th className="px-5 py-3">{t('common.name')}</th><th className="px-5 py-3">{t('shifts.time')}</th><th className="px-5 py-3">{t('common.status')}</th><th className="px-5 py-3 text-right">{t('common.actions')}</th></tr></thead>
          <tbody className="divide-y divide-slate-800">{shifts.map((shift) => <tr key={shift.master_id} className="hover:bg-slate-800/50"><td className="px-5 py-4 font-mono text-amber-300 font-bold">{shift.code}</td><td className="px-5 py-4">{shift.name}</td><td className="px-5 py-4 text-slate-300">{shift.start_time} - {shift.end_time}{shift.crosses_midnight ? ` (${t('shifts.nextDay')})` : ''}</td><td className="px-5 py-4"><span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs">{translatedEnum(t, 'status.master', shift.lifecycle_status)}</span></td><td className="px-5 py-4 text-right"><button onClick={() => openModal(shift)} className="p-2 bg-slate-800 rounded-lg"><Pencil className="w-4 h-4" /></button></td></tr>)}</tbody>
        </table>
      </div>
      {modal && <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-6"><form onSubmit={save} className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-full max-w-xl space-y-4"><h3 className="font-bold text-lg">{modal.master_id ? t('shifts.edit') : t('shifts.create')}</h3><div className="grid grid-cols-2 gap-3"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('shifts.code')} className="bg-slate-950 border border-slate-800 rounded-lg p-3" /><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('shifts.name')} className="bg-slate-950 border border-slate-800 rounded-lg p-3" /><select required value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3">{sites.map((site) => <option key={site.master_id} value={site.master_id}>{site.code}</option>)}</select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.crosses_midnight} onChange={(e) => setForm({ ...form, crosses_midnight: e.target.checked })} /> {t('shifts.crossesMidnight')}</label><input type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3" /><input type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3" /></div><div className="flex justify-end gap-3"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-slate-800 rounded-lg">{t('common.cancel')}</button><button className="px-5 py-2 bg-amber-600 rounded-lg font-semibold">{t('common.save')}</button></div></form></div>}
    </div>
  );
};
