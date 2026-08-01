import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { MasterDataApiError, authHeaders, fetchResource, masterDataBaseUrl, postResource, putResource } from '../../lib/masterDataApi';
import { useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';
import { Modal, SelectBase } from '../../components/ui';
import { BaseDataTable, type BaseDataTableColumn } from '../../components/base';

const EMPLOYEE_STATUSES = ['Active', 'Inactive', 'OnLeave'] as const;
const blank = { code: '', name: '', site_id: '', default_work_center_id: '', employee_status: 'Active', hired_date: '' };

function localizedText(value: unknown, locale: SupportedLocale): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return String(record[locale] || record.vi || record.en || record.ja || record.ko || '');
}

export const EmployeesScreen: React.FC = () => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
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
        fetchResource('skills', user, '?scope=Employee'),
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
  const employeeColumns: BaseDataTableColumn<any>[] = [
    { id: 'employee', header: t('nav.employees'), accessorFn: (row) => `${row.code || ''} ${row.name || ''}`, cell: ({ row }) => <><div className="font-mono text-amber-200">{row.original.code}</div><div className="text-foreground">{row.original.name}</div></> },
    { id: 'workCenter', header: t('nav.workCenters'), accessorFn: (row) => workCenters.find((wc) => wc.master_id === row.default_work_center_id)?.code || '-' },
    { id: 'status', header: t('common.status'), accessorKey: 'employee_status', cell: ({ row }) => <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs">{translatedEnum(t, 'status.employee', row.original.employee_status)}</span> },
    { id: 'hired', header: t('employees.hired'), accessorFn: (row) => row.hired_date || '-' },
    { id: 'actions', header: t('common.actions'), align: 'right', cell: ({ row }) => <div className="text-right"><button onClick={() => openModal(row.original)} className="rounded-md bg-slate-800 p-2" title={t('common.edit')} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></button></div> },
  ];

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
        <SelectBase label={t('nav.workCenters')} value={filters.work_center_id} onValueChange={(value) => setFilters({ ...filters, work_center_id: value })} className="h-10 w-auto min-w-48" options={[{ value: '', label: `${t('common.all')} ${t('nav.workCenters')}` }, ...workCenters.map((wc) => ({ value: wc.master_id, label: localizedText(wc.name, locale), secondaryLabel: wc.code }))]} aria-label={t('nav.workCenters')} />
        <SelectBase label={t('common.status')} value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })} className="h-10 w-auto min-w-40" options={[{ value: '', label: `${t('common.all')} ${t('common.status')}` }, ...EMPLOYEE_STATUSES.map((status) => ({ value: status, label: translatedEnum(t, 'status.employee', status) }))]} aria-label={t('common.status')} />
      </div>

      <BaseDataTable data={filteredEmployees} columns={employeeColumns} loading={loading} getRowId={(row) => row.master_id} onRowClick={openModal} stickyHeader />

      {modal && (
        <Modal open title={modal.master_id ? t('common.edit') : t('employees.create')} onClose={() => setModal(null)} footerLeft={<button type="button" onClick={() => setModal(null)} className="rounded-md border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-foreground hover:bg-hover">{t('common.cancel')}</button>} footer={<button type="submit" form="employee-form" className="rounded-md bg-action px-5 py-2 text-sm font-semibold text-white">{t('common.save')}</button>} className="max-w-2xl">
          <form id="employee-form" onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className="block text-sm font-medium text-slate-200">{t('employees.code')} *</span><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('employees.code')} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
              <label className="space-y-1"><span className="block text-sm font-medium text-slate-200">{t('employees.fullName')} *</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('employees.fullName')} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
              <SelectBase label={`${t('common.site')} *`} required value={form.site_id} onValueChange={(value) => setForm({ ...form, site_id: value })} options={sites.map((site) => ({ value: site.master_id, label: localizedText(site.name, locale), secondaryLabel: site.code }))} aria-label={t('common.site')} />
              <SelectBase label={t('nav.workCenters')} value={form.default_work_center_id || ''} onValueChange={(value) => setForm({ ...form, default_work_center_id: value })} options={[{ value: '', label: t('employees.noDefault') }, ...workCenters.map((wc) => ({ value: wc.master_id, label: localizedText(wc.name, locale), secondaryLabel: wc.code }))]} aria-label={t('nav.workCenters')} />
              <SelectBase label={t('common.status')} value={form.employee_status} onValueChange={(value) => setForm({ ...form, employee_status: value })} options={EMPLOYEE_STATUSES.map((status) => ({ value: status, label: translatedEnum(t, 'status.employee', status) }))} aria-label={t('common.status')} />
              <label className="space-y-1"><span className="block text-sm font-medium text-slate-200">{t('employees.hired')}</span><input type="date" value={form.hired_date || ''} onChange={(e) => setForm({ ...form, hired_date: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
            </div>
            <div className="border border-slate-800 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold text-slate-400 mb-2">{t('employees.skillPreview')}</div>
              <div className="grid grid-cols-1 gap-2">{skills.map((skill) => <div key={skill.master_id} className="flex items-center gap-2 text-sm"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={Boolean(selectedSkills[skill.master_id])} onChange={(e) => setSelectedSkills({ ...selectedSkills, [skill.master_id]: e.target.checked ? skill.minimum_level || 'L1' : '' })} /><span className="min-w-0"><span className="block font-medium text-slate-100">{localizedText(skill.name, locale)}</span><span className="block text-xs italic text-slate-400">{skill.code}</span></span></label><SelectBase label={t('common.level')} disabled={!selectedSkills[skill.master_id]} value={selectedSkills[skill.master_id] || skill.minimum_level || 'L1'} onValueChange={(value) => setSelectedSkills({ ...selectedSkills, [skill.master_id]: value })} className="h-9 w-24" options={['L1', 'L2', 'L3'].map((level) => ({ value: level, label: level }))} aria-label={`${skill.code} level`} /></div>)}</div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
