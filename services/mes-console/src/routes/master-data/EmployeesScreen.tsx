import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Users } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { MasterDataApiError, authHeaders, fetchResource, masterDataBaseUrl, postResource, putResource } from '../../lib/masterDataApi';
import { useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';
import { Modal, SelectBase } from '../../components/ui';
import { BaseDataTable, type BaseDataTableColumn } from '../../components/base';

const EMPLOYEE_STATUSES = ['Active', 'Inactive', 'OnLeave'] as const;
const SKILL_LEVELS = ['L1', 'L2', 'L3'] as const;
const QUALIFICATION_STATUSES = ['Active', 'Suspended', 'Expired'] as const;
const blank = { code: '', name: '', site_id: '', default_work_center_id: '', employee_status: 'Active', hired_date: '' };

type EmployeeSkillAssignment = {
  skill_id: string;
  level: string;
  qualification_status: string;
  expires_at?: string | null;
  active_flag?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  skill_code?: string;
  skill_name?: unknown;
};

function localizedText(value: unknown, locale: SupportedLocale): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return String(record[locale] || record.vi || record.en || record.ja || record.ko || '');
}

export const EmployeesScreen: React.FC = () => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const location = useLocation();
  const [employees, setEmployees] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [filters, setFilters] = useState({ work_center_id: '', status: '' });
  const [form, setForm] = useState<any>(blank);
  const [skillAssignments, setSkillAssignments] = useState<EmployeeSkillAssignment[]>([]);
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
  const activeSkillAssignments = useMemo(() => skillAssignments.filter((assignment) => assignment.active_flag !== false && !assignment.effective_to), [skillAssignments]);
  const historicalSkillAssignments = useMemo(() => skillAssignments.filter((assignment) => assignment.active_flag === false || assignment.effective_to), [skillAssignments]);
  const activeAssignmentBySkillId = useMemo(() => new Map(activeSkillAssignments.map((assignment) => [assignment.skill_id, assignment])), [activeSkillAssignments]);
  const isEmployeeEndpointMissing = error instanceof MasterDataApiError && error.resource === 'employees' && error.status === 404;
  const employeeByQuery = new URLSearchParams(location.search).get('employee_id');

  useEffect(() => {
    if (!employeeByQuery || loading || modal) return;
    const employee = employees.find((row) => row.master_id === employeeByQuery);
    if (employee) openModal(employee);
  }, [employeeByQuery, employees, loading, modal]);

  const skillSummary = (row: any) => {
    const summary = Array.isArray(row.active_skill_summary) ? row.active_skill_summary : [];
    if (!summary.length) return t('common.empty');
    return summary.slice(0, 2).map((skill: any) => `${skill.skill_code || '-'} ${skill.level || ''}`.trim()).join(', ') + (summary.length > 2 ? ` +${summary.length - 2}` : '');
  };

  const scheduleSummary = (row: any) => {
    if (row.today_shift_code) return row.today_shift_code;
    const count = Number(row.upcoming_schedule_count || 0);
    return count ? `${count} ${t('employees.scheduledDays')}` : t('employees.unscheduled');
  };

  const employeeColumns: BaseDataTableColumn<any>[] = [
    { id: 'employee', header: t('nav.employees'), accessorFn: (row) => `${row.code || ''} ${row.name || ''}`, cell: ({ row }) => <><div className="font-mono text-amber-200">{row.original.code}</div><div className="text-foreground">{row.original.name}</div></> },
    { id: 'site', header: t('common.site'), accessorFn: (row) => row.site_code || '-' },
    { id: 'workCenter', header: t('nav.workCenters'), accessorFn: (row) => row.default_work_center_code || workCenters.find((wc) => wc.master_id === row.default_work_center_id)?.code || '-' },
    { id: 'skills', header: t('employees.skills'), accessorFn: skillSummary, cell: ({ row }) => <div className="max-w-56 text-sm"><div>{skillSummary(row.original)}</div><div className="text-xs text-muted-foreground">{row.original.active_skill_count || 0} {t('skills.activeAssignment')}</div></div> },
    { id: 'schedule', header: t('employees.schedule'), accessorFn: scheduleSummary },
    { id: 'status', header: t('common.status'), accessorKey: 'employee_status', cell: ({ row }) => <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs">{translatedEnum(t, 'status.employee', row.original.employee_status)}</span> },
    { id: 'hired', header: t('employees.hired'), accessorFn: (row) => row.hired_date || '-' },
    { id: 'actions', header: t('common.actions'), align: 'right', cell: ({ row }) => <div className="text-right"><button onClick={() => openModal(row.original)} className="rounded-md bg-slate-800 p-2" title={t('common.edit')} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></button></div> },
  ];

  const openModal = (row?: any) => {
    setModal(row || {});
    setForm(row ? { ...row, hired_date: row.hired_date || '' } : { ...blank, site_id: sites[0]?.master_id || '', default_work_center_id: workCenters[0]?.master_id || '' });
    setSkillAssignments([]);
    if (row?.master_id) {
      fetch(`${masterDataBaseUrl()}/employees/${row.master_id}/skills`, { headers: authHeaders(user) })
        .then((resp) => resp.ok ? resp.json() : { data: [] })
        .then((json) => setSkillAssignments(json.data || []))
        .catch(() => setSkillAssignments([]));
    }
  };

  const upsertSkillAssignment = (skill: any, patch: Partial<EmployeeSkillAssignment> | null) => {
    const current = activeAssignmentBySkillId.get(skill.master_id);
    if (!patch) {
      setSkillAssignments(skillAssignments.map((assignment) => assignment.skill_id === skill.master_id && assignment.active_flag !== false && !assignment.effective_to ? { ...assignment, active_flag: false, effective_to: new Date().toISOString() } : assignment));
      return;
    }
    const nextAssignment: EmployeeSkillAssignment = {
      skill_id: skill.master_id,
      skill_code: skill.code,
      skill_name: skill.name,
      level: patch.level || current?.level || skill.minimum_level || 'L1',
      qualification_status: patch.qualification_status || current?.qualification_status || 'Active',
      expires_at: patch.expires_at ?? current?.expires_at ?? null,
      active_flag: true,
      effective_from: current?.effective_from || null,
      effective_to: null,
    };
    if (current) {
      setSkillAssignments(skillAssignments.map((assignment) => assignment === current ? { ...assignment, ...nextAssignment } : assignment));
    } else {
      setSkillAssignments([...skillAssignments, nextAssignment]);
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
      const activeSkills = skillAssignments
        .filter((assignment) => assignment.active_flag !== false && !assignment.effective_to)
        .map((assignment) => ({ skill_id: assignment.skill_id, level: assignment.level, qualification_status: assignment.qualification_status || 'Active', expires_at: assignment.expires_at || null }));
      if (new Set(activeSkills.map((assignment) => assignment.skill_id)).size !== activeSkills.length) throw new Error(t('employees.duplicateSkill'));
      await fetch(`${masterDataBaseUrl()}/employees/${employeeId}/skills`, {
        method: 'PUT',
        headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: activeSkills }),
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
        <Modal open title={modal.master_id ? t('common.edit') : t('employees.create')} onClose={() => setModal(null)} footerLeft={<button type="button" onClick={() => setModal(null)} className="rounded-md border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-foreground hover:bg-hover">{t('common.cancel')}</button>} footer={<button type="submit" form="employee-form" className="rounded-md bg-action px-5 py-2 text-sm font-semibold text-white">{t('common.save')}</button>} className="max-w-4xl">
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
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase font-semibold text-slate-400">{t('employees.skillPreview')}</div>
                  <div className="text-xs text-muted-foreground">{t('employees.skillOwnerHelp')}</div>
                </div>
                <div className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">{activeSkillAssignments.length} {t('skills.activeAssignment')}</div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {skills.map((skill) => {
                  const assignment = activeAssignmentBySkillId.get(skill.master_id);
                  return (
                    <div key={skill.master_id} className="grid gap-2 rounded border border-border bg-slate-950 p-3 text-sm md:grid-cols-[minmax(0,1fr)_96px_150px_150px] md:items-center">
                      <label className="flex min-w-0 items-center gap-2">
                        <input type="checkbox" checked={Boolean(assignment)} onChange={(e) => upsertSkillAssignment(skill, e.target.checked ? {} : null)} />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-100">{localizedText(skill.name, locale)}</span>
                          <span className="block text-xs italic text-slate-400">{skill.code}</span>
                        </span>
                      </label>
                      <SelectBase label={t('common.level')} disabled={!assignment} value={assignment?.level || skill.minimum_level || 'L1'} onValueChange={(value) => upsertSkillAssignment(skill, { level: value })} className="h-9 w-full" options={SKILL_LEVELS.map((level) => ({ value: level, label: level }))} aria-label={`${skill.code} level`} />
                      <SelectBase label={t('skills.qualification')} disabled={!assignment} value={assignment?.qualification_status || 'Active'} onValueChange={(value) => upsertSkillAssignment(skill, { qualification_status: value })} className="h-9 w-full" options={QUALIFICATION_STATUSES.map((status) => ({ value: status, label: status }))} aria-label={`${skill.code} qualification`} />
                      <label className="space-y-1">
                        <span className="block text-xs font-medium text-slate-300">{t('skills.expiresAt')}</span>
                        <input type="date" disabled={!assignment} value={assignment?.expires_at ? String(assignment.expires_at).slice(0, 10) : ''} onChange={(e) => upsertSkillAssignment(skill, { expires_at: e.target.value || null })} className="h-9 w-full rounded border border-slate-800 bg-slate-950 px-3 text-sm disabled:opacity-50" />
                      </label>
                    </div>
                  );
                })}
              </div>
              {historicalSkillAssignments.length ? (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-2 text-xs uppercase font-semibold text-slate-400">{t('employees.skillHistory')}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {historicalSkillAssignments.map((assignment) => (
                      <div key={`${assignment.skill_id}-${assignment.effective_from}-${assignment.effective_to}`} className="rounded border border-border px-3 py-2 text-xs text-muted-foreground">
                        <div className="font-mono text-slate-200">{assignment.skill_code}</div>
                        <div>{assignment.level} · {assignment.qualification_status} · {t('skills.endedAssignment')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
