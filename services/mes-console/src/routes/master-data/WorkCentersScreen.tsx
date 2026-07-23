import React, { useEffect, useMemo, useState } from 'react';
import { Factory, Pencil, Plus, RefreshCw, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { authHeaders, fetchResource, masterDataBaseUrl, postResource, putResource } from '../../lib/masterDataApi';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { LocalizedTextInput } from '../../components/LocalizedTextInput';
import { translatedEnum } from '../../lib/i18nLabels';

type ModalMode = 'create' | 'edit';

const WORK_CENTER_TYPES = ['Production', 'Inspection'] as const;
const blank = { code: '', name: { vi: '' }, site_id: '', area_id: '', work_center_type: 'Production', active_flag: true };

export const WorkCentersScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [headcount, setHeadcount] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [modal, setModal] = useState<{ mode: ModalMode; row?: any } | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailFilter, setDetailFilter] = useState<'all' | 'on' | 'off'>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [wc, siteRows, areaRows] = await Promise.all([
        fetchResource('work-centers', user),
        fetchResource('sites', user),
        fetchResource('production-areas', user),
      ]);
      setWorkCenters(wc);
      setSites(siteRows);
      setAreas(areaRows);
      const counts: Record<string, any> = {};
      await Promise.all(wc.map(async (row: any) => {
        const resp = await fetch(`${masterDataBaseUrl()}/work-centers/${row.master_id}/headcount`, { headers: authHeaders(user) });
        counts[row.master_id] = resp.ok ? await resp.json() : { default_headcount: 0, on_shift_now_count: 0 };
      }));
      setHeadcount(counts);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openModal = (mode: ModalMode, row?: any) => {
    setModal({ mode, row });
    setForm(row ? { ...row, name: typeof row.name === 'string' ? { vi: row.name } : row.name } : { ...blank, site_id: sites[0]?.master_id || '', area_id: areas[0]?.master_id || '' });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = {
        code: form.code,
        name: form.name,
        site_id: form.site_id,
        area_id: form.area_id,
        work_center_type: form.work_center_type,
        active_flag: Boolean(form.active_flag),
      };
      if (modal?.mode === 'edit') await putResource('work-centers', modal.row.master_id, payload, user);
      else await postResource('work-centers', payload, user);
      toast.success(t('workCenters.saved'));
      setModal(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openDetail = async (row: any) => {
    setDetail(row);
    setDetailFilter('all');
    const today = new Date().toISOString().slice(0, 10);
    const [empRows, scheduleResp] = await Promise.all([
      fetchResource('employees', user, `?work_center_id=${row.master_id}`),
      fetch(`${masterDataBaseUrl()}/employee-schedules?work_center_id=${row.master_id}&date=${today}`, { headers: authHeaders(user) }),
    ]);
    setEmployees(empRows);
    const scheduleJson = scheduleResp.ok ? await scheduleResp.json() : { data: [] };
    setSchedules(scheduleJson.data || []);
  };

  const detailRows = useMemo(() => {
    const byEmployee = new Map(schedules.map((row: any) => [row.employee_id, row]));
    const scheduled = schedules.map((row: any) => ({
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      employee_name: row.employee_name,
      state: row.is_on_shift_now ? t('workCenters.state.on') : t('workCenters.state.off'),
      on: Boolean(row.is_on_shift_now),
    }));
    const unscheduled = employees
      .filter((employee) => !byEmployee.has(employee.master_id))
      .map((employee) => ({
        employee_id: employee.master_id,
        employee_code: employee.code,
        employee_name: employee.name,
        state: t('workCenters.state.noSchedule'),
        on: false,
      }));
    return [...scheduled, ...unscheduled].filter((row) => {
      if (detailFilter === 'on') return row.on;
      if (detailFilter === 'off') return !row.on;
      return true;
    });
  }, [employees, schedules, detailFilter, t]);

  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-action/10 border border-cyan-500/20 rounded-lg text-cyan-300"><Factory className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('workCenters.title')}</h1>
            <p className="text-xs text-slate-400">{t('workCenters.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={load} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => openModal('create')} className="px-4 py-2.5 bg-action hover:bg-action-hover text-white text-sm font-semibold rounded-lg flex items-center space-x-2"><Plus className="w-4 h-4" /><span>{t('workCenters.create')}</span></button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase text-slate-400 border-b border-slate-800">
            <tr><th className="px-5 py-3">{t('common.code')}</th><th className="px-5 py-3">{t('common.name')}</th><th className="px-5 py-3">{t('common.type')}</th><th className="px-5 py-3">{t('common.status')}</th><th className="px-5 py-3">{t('workCenters.headcount')}</th><th className="px-5 py-3 text-right">{t('common.actions')}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {workCenters.map((row) => (
              <tr key={row.master_id} onClick={() => openDetail(row)} className="hover:bg-slate-800/50 cursor-pointer">
                <td className="px-5 py-4 font-mono font-bold text-cyan-300">{row.code}</td>
                <td className="px-5 py-4 text-slate-100">{text(row.name)}</td>
                <td className="px-5 py-4 text-slate-300">{translatedEnum(t, 'workCenters.type', row.work_center_type)}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs border ${row.active_flag ? 'border-emerald-800 bg-emerald-950/70 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>{row.active_flag ? t('common.active') : t('common.inactive')}</span>
                    <span className="px-2.5 py-1 rounded-full text-xs border border-slate-700 bg-slate-800 text-slate-300">{translatedEnum(t, 'status.master', row.lifecycle_status)}</span>
                  </div>
                </td>
                <td className="px-5 py-4"><span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-amber-200"><Users className="w-3.5 h-3.5" />{headcount[row.master_id]?.on_shift_now_count ?? 0} / {headcount[row.master_id]?.default_headcount ?? 0}</span></td>
                <td className="px-5 py-4 text-right"><button onClick={(event) => { event.stopPropagation(); openModal('edit', row); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"><Pencil className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-6 z-50">
          <form onSubmit={save} className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-full max-w-xl space-y-4">
            <h3 className="font-bold text-lg">{modal.mode === 'edit' ? t('workCenters.edit') : t('workCenters.create')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('common.code')} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
              <LocalizedTextInput required label={t('common.name')} value={form.name} onChange={(name) => setForm({ ...form, name })} />
              <select required value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3">{sites.map((site) => <option key={site.master_id} value={site.master_id}>{site.code}</option>)}</select>
              <select required value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3">{areas.map((area) => <option key={area.master_id} value={area.master_id}>{area.code}</option>)}</select>
              <select value={form.work_center_type} onChange={(e) => setForm({ ...form, work_center_type: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                {WORK_CENTER_TYPES.map((type) => <option key={type} value={type}>{translatedEnum(t, 'workCenters.type', type)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active_flag} onChange={(e) => setForm({ ...form, active_flag: e.target.checked })} /> {form.active_flag ? t('common.active') : t('common.inactive')}</label>
            </div>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-slate-800 rounded-lg">{t('common.cancel')}</button><button className="px-5 py-2 bg-action rounded-lg font-semibold">{t('common.save')}</button></div>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-6 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-3xl">
            <div className="flex justify-between items-center p-5 border-b border-slate-800"><div><h3 className="font-bold">{detail.code} - {text(detail.name)}</h3><p className="text-xs text-slate-400">{t('workCenters.detailTitle')}</p></div><button onClick={() => setDetail(null)}><X className="w-5 h-5" /></button></div>
            <div className="p-5 space-y-4">
              <div className="inline-flex bg-slate-950 border border-slate-800 rounded-lg p-1">
                {([['all', t('workCenters.filter.all')], ['on', t('workCenters.filter.on')], ['off', t('workCenters.filter.off')]] as const).map(([key, label]) => <button key={key} onClick={() => setDetailFilter(key)} className={`px-3 py-1.5 rounded-md text-sm ${detailFilter === key ? 'bg-action text-white' : 'text-slate-400'}`}>{label}</button>)}
              </div>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                {detailRows.map((row) => <div key={row.employee_id} className="flex items-center justify-between px-4 py-3"><div><div className="font-mono text-cyan-300">{row.employee_code}</div><div className="text-sm text-slate-200">{row.employee_name}</div></div><span className={`px-2.5 py-1 rounded-full text-xs ${row.on ? 'bg-emerald-950 text-amber-200 border border-emerald-800' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>{row.state}</span></div>)}
                {detailRows.length === 0 && <div className="p-6 text-center text-slate-500">{t('workCenters.noMatchingEmployees')}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
