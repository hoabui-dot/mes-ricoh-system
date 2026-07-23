import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { MasterDataApiError, authHeaders, fetchResource, masterDataBaseUrl } from '../../lib/masterDataApi';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';

type Preset = 'month' | 'quarter' | 'year';

function rangeFrom(start: string, preset: Preset) {
  const from = new Date(`${start}T00:00:00.000Z`);
  const to = new Date(from);
  if (preset === 'month') to.setUTCMonth(to.getUTCMonth() + 1);
  if (preset === 'quarter') to.setUTCMonth(to.getUTCMonth() + 3);
  if (preset === 'year') to.setUTCFullYear(to.getUTCFullYear() + 1);
  to.setUTCDate(to.getUTCDate() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function countDates(from: string, to: string, days: number[]) {
  let count = 0;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dow = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (days.includes(dow)) count += 1;
  }
  return count;
}

export const WorkCalendarScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [employees, setEmployees] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [workCenterId, setWorkCenterId] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [preset, setPreset] = useState<Preset>('month');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [confirm, setConfirm] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [empRows, wcRows, shiftRows] = await Promise.all([fetchResource('employees', user, workCenterId ? `?work_center_id=${workCenterId}` : ''), fetchResource('work-centers', user), fetchResource('shifts', user)]);
      setEmployees(empRows);
      setWorkCenters(wcRows);
      setShifts(shiftRows);
      if (!shiftId && shiftRows[0]) setShiftId(shiftRows[0].master_id);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [workCenterId]);

  const range = useMemo(() => rangeFrom(startDate, preset), [startDate, preset]);
  const dayCount = useMemo(() => countDates(range.from, range.to, days), [range, days]);
  const totalRows = employeeIds.length * dayCount;
  const isEmployeeEndpointMissing = error instanceof MasterDataApiError && error.resource === 'employees' && error.status === 404;
  const dayLabels = [
    t('workCalendar.day.mon'),
    t('workCalendar.day.tue'),
    t('workCalendar.day.wed'),
    t('workCalendar.day.thu'),
    t('workCalendar.day.fri'),
    t('workCalendar.day.sat'),
    t('workCalendar.day.sun'),
  ];

  const submit = async () => {
    const resp = await fetch(`${masterDataBaseUrl()}/employee-schedules/bulk`, {
      method: 'POST',
      headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_ids: employeeIds, shift_id: shiftId, work_center_id: workCenterId || null, date_range: range, days_of_week: days }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.message || json.error || t('workCalendar.bulkFailed'));
    setResults(json.data || []);
    setConfirm(false);
    toast.success(t('workCalendar.bulkCreated', { count: json.created_count || 0 }));
  };

  if (isEmployeeEndpointMissing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg">
          <div className="flex items-center space-x-3"><div className="p-3 bg-action/10 border border-sky-500/20 rounded-lg text-sky-300"><CalendarDays className="w-6 h-6" /></div><div><h1 className="text-xl font-bold">{t('workCalendar.title')}</h1><p className="text-xs text-slate-400">{t('workCalendar.subtitle')}</p></div></div>
          <button onClick={load} className="p-2.5 bg-slate-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200">
            <CalendarDays className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100">{t('employees.loadFailed')}</h2>
          <p className="mt-2 text-sm text-slate-400">{t('workCalendar.loadFailedHint')}</p>
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
        <div className="flex items-center space-x-3"><div className="p-3 bg-action/10 border border-sky-500/20 rounded-lg text-sky-300"><CalendarDays className="w-6 h-6" /></div><div><h1 className="text-xl font-bold">{t('workCalendar.title')}</h1><p className="text-xs text-slate-400">{t('workCalendar.subtitle')}</p></div></div>
        <button onClick={load} className="p-2.5 bg-slate-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1 text-sm"><span className="text-slate-400">{t('workCalendar.workCenterFilter')}</span><select value={workCenterId} onChange={(e) => { setWorkCenterId(e.target.value); setEmployeeIds([]); }} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3"><option value="">{t('common.all')}</option>{workCenters.map((wc) => <option key={wc.master_id} value={wc.master_id}>{wc.code}</option>)}</select></label>
            <label className="space-y-1 text-sm"><span className="text-slate-400">{t('workCalendar.shift')}</span><select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3">{shifts.map((shift) => <option key={shift.master_id} value={shift.master_id}>{shift.code} ({shift.start_time}-{shift.end_time})</option>)}</select></label>
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-2">{t('workCalendar.employees')}</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">{employees.map((employee) => <label key={employee.master_id} className="flex gap-2 items-center border border-slate-800 rounded-lg p-2.5 bg-slate-950/60"><input type="checkbox" checked={employeeIds.includes(employee.master_id)} onChange={(e) => setEmployeeIds((prev) => e.target.checked ? [...prev, employee.master_id] : prev.filter((id) => id !== employee.master_id))} /><span><span className="block font-mono text-xs text-sky-300">{employee.code}</span><span className="block text-sm">{employee.name}</span></span></label>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1 text-sm"><span className="text-slate-400">{t('workCalendar.startDate')}</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3" /></label>
            <div className="space-y-1 text-sm"><span className="text-slate-400">{t('workCalendar.period')}</span><div className="grid grid-cols-3 bg-slate-950 border border-slate-800 rounded-lg p-1">{(['month', 'quarter', 'year'] as const).map((item) => <button key={item} onClick={() => setPreset(item)} className={`py-2 rounded-md capitalize ${preset === item ? 'bg-action text-white' : 'text-slate-400'}`}>{t(`workCalendar.period.${item}`)}</button>)}</div></div>
          </div>
          <div className="space-y-2"><div className="text-sm text-slate-400">{t('workCalendar.daysOfWeek')}</div><div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 7].map((day) => <label key={day} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"><input type="checkbox" className="mr-2" checked={days.includes(day)} onChange={(e) => setDays((prev) => e.target.checked ? [...prev, day].sort() : prev.filter((item) => item !== day))} />{dayLabels[day - 1]}</label>)}</div></div>
          <div className="border border-sky-900/70 bg-sky-950/30 rounded-lg p-4 text-sm">{t('workCalendar.bulkPreview', { employeeCount: employeeIds.length, dayCount, totalRows, from: range.from, to: range.to })}</div>
          <button disabled={!totalRows || !shiftId} onClick={() => setConfirm(true)} className="px-5 py-3 bg-action disabled:bg-slate-800 disabled:text-slate-500 rounded-lg font-semibold">{t('workCalendar.assignSchedule')}</button>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
          <h3 className="font-bold mb-3">{t('workCalendar.bulkResult')}</h3>
          <div className="max-h-[34rem] overflow-auto border border-slate-800 rounded-lg divide-y divide-slate-800">{results.map((row, index) => <div key={`${row.employee_id}-${row.schedule_date}-${index}`} className="flex justify-between px-3 py-2 text-sm"><span className="font-mono text-slate-300">{row.schedule_date}</span><span className={row.status === 'created' ? 'text-amber-200' : 'text-amber-300'}>{translatedEnum(t, 'workCalendar.resultStatus', row.status)}</span></div>)}{results.length === 0 && <div className="p-6 text-center text-slate-500">{t('workCalendar.noBulkRun')}</div>}</div>
        </div>
      </div>
      {confirm && <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-6"><div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md space-y-4"><h3 className="font-bold text-lg">{t('workCalendar.confirmTitle')}</h3><p className="text-sm text-slate-300">{t('workCalendar.confirmBody', { totalRows, employeeCount: employeeIds.length, from: range.from, to: range.to })}</p><div className="flex justify-end gap-3"><button onClick={() => setConfirm(false)} className="px-4 py-2 bg-slate-800 rounded-lg">{t('common.cancel')}</button><button onClick={() => void submit().catch((err) => toast.error(err.message))} className="px-5 py-2 bg-action rounded-lg font-semibold">{t('common.save')}</button></div></div></div>}
    </div>
  );
};
