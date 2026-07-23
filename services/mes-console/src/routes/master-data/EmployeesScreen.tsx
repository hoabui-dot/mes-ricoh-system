import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { MasterDataApiError, authHeaders, fetchResource, masterDataBaseUrl, postResource, putResource } from '../../lib/masterDataApi';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';

const EMPLOYEE_STATUSES = ['Active', 'Inactive', 'OnLeave'] as const;
const blank = { code: '', name: '', site_id: '', default_work_center_id: '', employee_status: 'Active', hired_date: '' };

export const EmployeesScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [employees, setEmployees] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [filters, setFilters] = useState({ work_center_id: '', status: '' });
  const [form, setForm] = useState<any>(blank);
  const [selectedSkills, setSelectedSkills] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [emp, siteRows, wcRows, skillRows] = await Promise.all([
        fetchResource('employees', user, filters.work_center_id ? `?work_center_id=${filters.work_center_id}` : ''),
        fetchResource('sites', user),
        fetchResource('work-centers', user),
        fetchResource('skills', user),
      ]);
      setEmployees(emp);
      setSites(siteRows);
      setWorkCenters(wcRows);
      setSkills(skillRows);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filters.work_center_id]);

  const filteredEmployees = useMemo(() => employees.filter((employee) => !filters.status || employee.employee_status === filters.status), [employees, filters.status]);
  const isEmployeeEndpointMissing = error instanceof MasterDataApiError && error.resource === 'employees' && error.status === 404;

  const openModal = (row?: any) => {
    setModal(row || {});
    setForm(row ? { ...row, hired_date: row.hired_date || '' } : { ...blank, site_id: sites[0]?.master_id || '', default_work_center_id: workCenters[0]?.master_id || '' });
    setSelectedSkills({});
    if (row?.master_id) {
      fetch(`${masterDataBaseUrl()}/employees/${row.master_id}/skills`, { headers: authHeaders(user) })
        .then((resp) => resp.ok ? resp.json() : { data: [] })
        .then((json) => setSelectedSkills(Object.fromEntries((json.data || []).map((item: any) => [item.skill_id, item.level]))))
        .catch(() => setSelectedSkills({}));
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = {
        code: form.code,
        name: form.name,
        site_id: form.site_id,
        default_work_center_id: form.default_work_center_id || null,
        employee_status: form.employee_status,
        hired_date: form.hired_date || null,
      };
      const saved = modal?.master_id ? await putResource('employees', modal.master_id, payload, user) : await postResource('employees', payload, user);
      const employeeId = modal?.master_id || saved.master_id;
      await fetch(`${masterDataBaseUrl()}/employees/${employeeId}/skills`, {
        method: 'PUT',
        headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: Object.entries(selectedSkills).filter(([, level]) => level).map(([skill_id, level]) => ({ skill_id, level })) }),
      });
      toast.success(modal?.master_id ? t('employees.updated') : t('employees.created'));
      setModal(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (isEmployeeEndpointMissing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-action/10 border border-action/20 rounded-lg text-amber-200"><Users className="w-6 h-6" /></div>
            <div><h1 className="text-xl font-bold">{t('employees.title')}</h1><p className="text-xs text-slate-400">{t('employees.subtitle')}</p></div>
          </div>
          <button onClick={load} className="p-2.5 bg-slate-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200">
            <Users className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100">{t('employees.loadFailed')}</h2>
          <p className="mt-2 text-sm text-slate-400">{t('employees.loadFailedHint')}</p>
          <button onClick={load} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white">
            <RefreshCw className="h-4 w-4" />{t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-action/10 border border-action/20 rounded-lg text-amber-200"><Users className="w-6 h-6" /></div>
          <div><h1 className="text-xl font-bold">{t('employees.title')}</h1><p className="text-xs text-slate-400">{t('employees.subtitle')}</p></div>
        </div>
        <div className="flex gap-3"><button onClick={load} className="p-2.5 bg-slate-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={() => openModal()} className="px-4 py-2.5 bg-action rounded-lg text-sm font-semibold flex gap-2"><Plus className="w-4 h-4" />{t('employees.create')}</button></div>
      </div>

      <div className="flex gap-3">
        <select value={filters.work_center_id} onChange={(e) => setFilters({ ...filters, work_center_id: e.target.value })} className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-sm"><option value="">{t('common.all')} {t('nav.workCenters')}</option>{workCenters.map((wc) => <option key={wc.master_id} value={wc.master_id}>{wc.code}</option>)}</select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-sm"><option value="">{t('common.all')} {t('common.status')}</option>{EMPLOYEE_STATUSES.map((status) => <option key={status} value={status}>{translatedEnum(t, 'status.employee', status)}</option>)}</select>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-950 text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">{t('nav.employees')}</th><th className="px-5 py-3">{t('nav.workCenters')}</th><th className="px-5 py-3">{t('common.status')}</th><th className="px-5 py-3">{t('employees.hired')}</th><th className="px-5 py-3 text-right">{t('common.actions')}</th></tr></thead>
          <tbody className="divide-y divide-slate-800">{filteredEmployees.map((employee) => <tr key={employee.master_id} className="hover:bg-slate-800/50"><td className="px-5 py-4"><div className="font-mono text-amber-200">{employee.code}</div><div className="text-slate-100">{employee.name}</div></td><td className="px-5 py-4 text-slate-300">{workCenters.find((wc) => wc.master_id === employee.default_work_center_id)?.code || '-'}</td><td className="px-5 py-4"><span className="px-2.5 py-1 rounded-full text-xs border border-slate-700 bg-slate-800">{translatedEnum(t, 'status.employee', employee.employee_status)}</span></td><td className="px-5 py-4 text-slate-400">{employee.hired_date || '-'}</td><td className="px-5 py-4 text-right"><button onClick={() => openModal(employee)} className="p-2 bg-slate-800 rounded-lg"><Pencil className="w-4 h-4" /></button></td></tr>)}</tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-6">
          <form onSubmit={save} className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-full max-w-2xl space-y-4">
            <h3 className="font-bold text-lg">{modal.master_id ? t('common.edit') : t('employees.create')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('employees.code')} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('employees.fullName')} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
              <select required value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3">{sites.map((site) => <option key={site.master_id} value={site.master_id}>{site.code}</option>)}</select>
              <select value={form.default_work_center_id || ''} onChange={(e) => setForm({ ...form, default_work_center_id: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3"><option value="">{t('employees.noDefault')}</option>{workCenters.map((wc) => <option key={wc.master_id} value={wc.master_id}>{wc.code}</option>)}</select>
              <select value={form.employee_status} onChange={(e) => setForm({ ...form, employee_status: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3">{EMPLOYEE_STATUSES.map((status) => <option key={status} value={status}>{translatedEnum(t, 'status.employee', status)}</option>)}</select>
              <input type="date" value={form.hired_date || ''} onChange={(e) => setForm({ ...form, hired_date: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg p-3" />
            </div>
            <div className="border border-slate-800 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold text-slate-400 mb-2">{t('employees.skillPreview')}</div>
              <div className="grid grid-cols-2 gap-2">{skills.map((skill) => <label key={skill.master_id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(selectedSkills[skill.master_id])} onChange={(e) => setSelectedSkills({ ...selectedSkills, [skill.master_id]: e.target.checked ? skill.minimum_level || 'L1' : '' })} />{skill.code}<select disabled={!selectedSkills[skill.master_id]} value={selectedSkills[skill.master_id] || skill.minimum_level || 'L1'} onChange={(e) => setSelectedSkills({ ...selectedSkills, [skill.master_id]: e.target.value })} className="ml-auto bg-slate-950 border border-slate-800 rounded px-2 py-1"><option>L1</option><option>L2</option><option>L3</option></select></label>)}</div>
            </div>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-slate-800 rounded-lg">{t('common.cancel')}</button><button className="px-5 py-2 bg-action rounded-lg font-semibold">{t('common.save')}</button></div>
          </form>
        </div>
      )}
    </div>
  );
};
