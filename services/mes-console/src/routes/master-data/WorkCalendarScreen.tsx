import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { MasterDataApiError, authHeaders, fetchResource, masterDataBaseUrl } from '../../lib/masterDataApi';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';
import { Button, Calendar, SelectBase } from '../../components/ui';
import { BaseDataTable, BaseModal, type BaseDataTableColumn } from '../../components/base';

type Preset = 'month' | 'quarter' | 'year' | 'specific';
type DateRange = { from: string; to: string };
type DraftSchedule = { key: string; employee_id: string; employee_name: string; employee_code: string; schedule_date: string; shift_id: string; start_time: string; end_time: string };

const displayName = (value: unknown, fallback = '') => typeof value === 'string'
  ? value
  : String((value as Record<string, string> | null)?.vi || (value as Record<string, string> | null)?.en || fallback);

function monthRange(month: Date): DateRange {
  const from = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const to = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function assignmentRange(start: string, preset: Preset, specificDate: string): DateRange {
  if (preset === 'specific') return { from: start, to: specificDate };
  const from = new Date(`${start}T00:00:00.000Z`);
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const endMonth = preset === 'month' ? month : preset === 'quarter' ? Math.floor(month / 3) * 3 + 2 : 11;
  const to = new Date(Date.UTC(year, endMonth + 1, 0));
  return { from: start, to: to.toISOString().slice(0, 10) };
}

function datesBetween(range: DateRange, days: number[]) {
  const result: string[] = [];
  for (const cursor = new Date(`${range.from}T00:00:00.000Z`); cursor <= new Date(`${range.to}T00:00:00.000Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (days.includes(cursor.getUTCDay() || 7)) result.push(cursor.toISOString().slice(0, 10));
  }
  return result;
}


export const WorkCalendarScreen: React.FC = () => {
  const { user } = useAuth();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterWorkCenterId = searchParams.get('work_center_id') || '';
  const today = new Date().toISOString().slice(0, 10);

  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [formWorkCenterId, setFormWorkCenterId] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [specificDate, setSpecificDate] = useState(today);
  const [preset, setPreset] = useState<Preset>('month');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [assigning, setAssigning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [removedDraftKeys, setRemovedDraftKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const activeWorkCenterId = assigning ? formWorkCenterId : filterWorkCenterId;
  const filterWorkCenter = workCenters.find((row) => row.master_id === filterWorkCenterId);
  const formWorkCenter = workCenters.find((row) => row.master_id === formWorkCenterId);
  const visibleRange = useMemo(() => monthRange(month), [month]);
  const range = useMemo(() => assignmentRange(startDate, preset, specificDate), [startDate, preset, specificDate]);
  const candidateDates = useMemo(() => datesBetween(range, days), [range, days]);
  const availableDays = useMemo(() => [1, 2, 3, 4, 5, 6, 7].filter((day) => datesBetween(range, [day]).length > 0), [range.from, range.to]);
  const dayCount = candidateDates.length;
  const dayLabels = [t('workCalendar.day.mon'), t('workCalendar.day.tue'), t('workCalendar.day.wed'), t('workCalendar.day.thu'), t('workCalendar.day.fri'), t('workCalendar.day.sat'), t('workCalendar.day.sun')];

  const loadSchedules = async (workCenterId: string, dateRange: DateRange) => {
    if (!workCenterId) { setSchedules([]); return; }
    const rows = await fetchResource('employee-schedules', user, `?work_center_id=${encodeURIComponent(workCenterId)}&from=${dateRange.from}&to=${dateRange.to}`);
    setSchedules(rows);
    if (rows[0]?.schedule_date) setSelectedDate(new Date(String(rows[0].schedule_date)));
  };

  const loadWorkCenters = async () => {
    setLoading(true); setError(null);
    try { setWorkCenters(await fetchResource('work-centers', user)); } catch (err) { setError(err); } finally { setLoading(false); }
  };

  useEffect(() => { void loadWorkCenters(); }, []);
  useEffect(() => {
    document.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((input) => input.setAttribute('lang', 'en-GB'));
  }, [assigning, preset]);
  useEffect(() => { setRemovedDraftKeys([]); }, [formWorkCenterId, shiftId, employeeIds.join(','), range.from, range.to, days.join(','), preset]);
  useEffect(() => {
    setDays((current) => {
      const valid = current.filter((day) => availableDays.includes(day));
      return valid.length ? valid : availableDays;
    });
  }, [availableDays.join(',')]);
  useEffect(() => {
    if (!activeWorkCenterId) { setEmployees([]); setShifts([]); setSchedules([]); return; }
    setLoading(true); setError(null);
    void Promise.all([
      fetchResource('employees', user, `?work_center_id=${encodeURIComponent(activeWorkCenterId)}`),
      fetchResource('shifts', user, `?work_center_id=${encodeURIComponent(activeWorkCenterId)}`),
      loadSchedules(activeWorkCenterId, visibleRange),
    ]).then(([employeeRows, shiftRows]) => {
      setEmployees(employeeRows);
      setShifts(shiftRows);
      setShiftId((current) => current && shiftRows.some((row) => row.master_id === current) ? current : shiftRows[0]?.master_id || '');
    }).catch(setError).finally(() => setLoading(false));
  }, [activeWorkCenterId, visibleRange.from, visibleRange.to]);

  const scheduleByDate = useMemo(() => {
    const grouped = new Map<string, any[]>();
    schedules.forEach((row) => grouped.set(String(row.schedule_date).slice(0, 10), [...(grouped.get(String(row.schedule_date).slice(0, 10)) || []), row]));
    return grouped;
  }, [schedules]);
  const rowsForDate = (date: Date) => {
    const keys = new Set([date.toISOString().slice(0, 10), `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`]);
    return [...keys].flatMap((key) => scheduleByDate.get(key) || []).filter((row, index, all) => all.findIndex((candidate) => candidate.schedule_id === row.schedule_id) === index);
  };
  const detailRows = detailDate ? rowsForDate(detailDate) : [];
  const scheduledDates = schedules.map((row) => new Date(String(row.schedule_date)));

  const generatedDraftRows = useMemo<DraftSchedule[]>(() => employeeIds.flatMap((employeeId) => {
    const employee = employees.find((row) => row.master_id === employeeId);
    const shift = shifts.find((row) => row.master_id === shiftId);
    return candidateDates.map((scheduleDate) => ({ key: `${employeeId}-${scheduleDate}`, employee_id: employeeId, employee_name: displayName(employee?.name, employee?.code), employee_code: employee?.code || '', schedule_date: scheduleDate, shift_id: shiftId, start_time: shift?.start_time || '', end_time: shift?.end_time || '' }));
  }), [employeeIds, employees, shifts, shiftId, candidateDates]);
  const draftRows = generatedDraftRows.filter((row) => !removedDraftKeys.includes(row.key));
  const totalRows = draftRows.length;
  const draftColumns = useMemo<BaseDataTableColumn<DraftSchedule>[]>(() => [
    { id: 'date', header: t('workCalendar.date'), accessorKey: 'schedule_date', cell: ({ row }) => formatDate(`${row.original.schedule_date}T00:00:00Z`) },
    { id: 'employee', header: t('workCalendar.employee'), accessorFn: (row) => row.employee_name, cell: ({ row }) => <><div className="font-semibold">{row.original.employee_name}</div><div className="font-mono text-xs text-muted-foreground">{row.original.employee_code}</div></> },
    { id: 'time', header: t('workCalendar.time'), accessorFn: (row) => row.start_time, cell: ({ row }) => `${row.original.start_time.slice(0, 5)} - ${row.original.end_time.slice(0, 5)}` },
    { id: 'action', header: t('common.actions'), enableSorting: false, cell: ({ row }) => <Button type="button" variant="ghost" size="icon" title={t('workCalendar.removeDate')} aria-label={t('workCalendar.removeDate')} onClick={() => setRemovedDraftKeys((current) => [...current, row.original.key])}><Trash2 className="h-4 w-4 text-rose-300" /></Button> },
  ], [t, formatDate]);

  const submit = async () => {
    if (!formWorkCenterId || !shiftId || !employeeIds.length || !totalRows || startDate < today || (preset === 'specific' && specificDate < startDate) || range.to < range.from) throw new Error(t('workCalendar.validationRequired'));
    const response = await fetch(`${masterDataBaseUrl()}/employee-schedules/bulk`, { method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_ids: employeeIds, shift_id: shiftId, work_center_id: formWorkCenterId, date_range: range, days_of_week: days, schedule_entries: draftRows.map((row) => ({ employee_id: row.employee_id, schedule_date: row.schedule_date })) }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const conflict = Array.isArray(payload.conflicts) ? payload.conflicts[0] : null;
      if (payload.error === 'EMPLOYEE_SCHEDULE_TIME_CONFLICT' && conflict) throw new Error(t('workCalendar.timeConflict', { employee: conflict.employee_code, date: String(conflict.conflicting_date || conflict.schedule_date).slice(0, 10), shift: conflict.conflicting_shift_code }));
      throw new Error(payload.message || payload.error || t('workCalendar.bulkFailed'));
    }
    const targetMonth = new Date(`${range.from}T00:00:00.000Z`);
    setConfirm(false); setAssigning(false); setEmployeeIds([]); setMonth(targetMonth);
    navigate(`/work-calendar?work_center_id=${encodeURIComponent(formWorkCenterId)}`);
    setSearchParams({ work_center_id: formWorkCenterId }, { replace: true });
    await loadSchedules(formWorkCenterId, monthRange(targetMonth));
    toast.success(t('workCalendar.bulkCreated', { count: payload.created_count || 0 }));
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={loadWorkCenters} />;
  if (error instanceof MasterDataApiError && error.resource === 'employees' && error.status === 404) return <ErrorBoundaryCard error={error} onRetry={loadWorkCenters} />;

  const calendar = <div className="rounded-lg border border-border bg-surface p-3 sm:p-5"><Calendar month={month} onMonthChange={setMonth} showOutsideDays className="mx-auto w-full max-w-none [--cell-size:clamp(3.2rem,10vw,7.4rem)]" classNames={{ month_grid: 'w-full border-collapse', weekdays: 'flex w-full', weekday: 'flex-1 text-center text-xs font-medium text-muted-foreground', week: 'mt-1 flex w-full', day: 'relative h-[var(--cell-size)] w-full flex-1 p-0 text-center', month: 'flex w-full flex-col gap-3' }} components={{ DayButton: (props: any) => { const rows = rowsForDate(props.day.date as Date); return <button {...props} className="flex h-full w-full flex-col items-stretch overflow-hidden rounded-md border border-transparent p-1.5 text-left hover:border-action/60 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"><span className="mb-1 flex items-center justify-between text-xs font-semibold"><span>{(props.day.date as Date).getDate()}</span>{rows.length > 3 && <span className="rounded bg-action/20 px-1 text-[10px] text-action">+{rows.length - 3}</span>}</span><span className="space-y-0.5 overflow-hidden">{rows.slice(0, 3).map((row: any) => <span key={row.schedule_id} className="block truncate rounded border border-sky-800/70 bg-sky-950/60 px-1 py-0.5 text-[10px] leading-4 text-sky-100" title={`${displayName(row.employee_name, row.employee_code)} · ${row.start_time}-${row.end_time}`}>{displayName(row.employee_name, row.employee_code)} · {row.start_time?.slice(0, 5)} - {row.end_time?.slice(0, 5)}</span>)}</span></button>; } }} modifiers={{ scheduled: scheduledDates }} modifiersClassNames={{ scheduled: 'bg-sky-950/70 text-sky-100 ring-1 ring-inset ring-sky-800/80' }} onDayClick={(date) => { setSelectedDate(date); setDetailDate(date); }} />{!filterWorkCenterId && <div className="border-t border-border py-8 text-center text-sm text-muted-foreground">{t('workCalendar.emptyCalendar')}</div>}{filterWorkCenterId && !loading && schedules.length === 0 && <div className="border-t border-border py-8 text-center text-sm text-muted-foreground">{t('workCalendar.noSchedules')}</div>}<BaseModal open={Boolean(detailDate)} title={detailDate ? `${t('workCalendar.dayDetail')} · ${formatDate(detailDate)}` : t('workCalendar.dayDetail')} onClose={() => setDetailDate(null)} size="md" placement="center" footer={<Button type="button" onClick={() => setDetailDate(null)}>{t('common.close')}</Button>}>{detailRows.length ? <div className="space-y-2">{detailRows.map((row: any) => <div key={row.schedule_id} className="rounded-md border border-border bg-surface-subtle p-3"><div className="font-semibold text-foreground">{displayName(row.employee_name, row.employee_code)}</div><div className="mt-1 font-mono text-sm text-sky-200">{row.start_time?.slice(0, 5)} - {row.end_time?.slice(0, 5)}</div></div>)}</div> : <div className="py-8 text-center text-sm text-muted-foreground">{t('workCalendar.noSchedulesForDate')}</div>}</BaseModal></div>;

  if (!assigning) return <div className="space-y-6"><div className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-3"><div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-3 text-sky-300"><CalendarDays className="h-6 w-6" /></div><div><h1 className="text-xl font-bold">{t('workCalendar.title')}</h1><p className="text-xs text-slate-400">{t('workCalendar.subtitle')}</p></div></div><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-64 space-y-1 text-sm"><span className="text-slate-400">{t('workCalendar.workCenterFilter')}</span><SelectBase value={filterWorkCenterId} onValueChange={(value) => setSearchParams(value ? { work_center_id: value } : {}, { replace: true })} options={[{ value: '', label: t('workCalendar.selectWorkCenter') }, ...workCenters.map((wc) => ({ value: wc.master_id, label: wc.code, secondaryLabel: displayName(wc.name, wc.code) }))]} aria-label={t('workCalendar.workCenterFilter')} /></label><button type="button" onClick={() => { setFormWorkCenterId(filterWorkCenterId); setAssigning(true); }} disabled={!filterWorkCenterId} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"><Plus className="h-4 w-4" />{t('workCalendar.assignSchedule')}</button><button type="button" onClick={loadWorkCenters} className="inline-flex h-11 items-center justify-center rounded-md bg-slate-800 p-3" title={t('common.refresh')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></div>{filterWorkCenter && <div className="text-sm text-muted-foreground">{t('workCalendar.viewingWorkCenter')}: <span className="font-semibold text-foreground">{displayName(filterWorkCenter.name, filterWorkCenter.code)}</span> <span className="font-mono text-xs">({filterWorkCenter.code})</span></div>}{calendar}</div>;

  return <div className="space-y-6"><div className="flex items-center justify-between"><div><button type="button" onClick={() => setAssigning(false)} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" />{t('common.back')}</button><h1 className="text-xl font-bold">{t('workCalendar.assignSchedule')}</h1><p className="text-xs text-muted-foreground">{formWorkCenter ? `${displayName(formWorkCenter.name, formWorkCenter.code)} (${formWorkCenter.code})` : ''}</p></div></div><div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]"><div className="space-y-5 rounded-lg border border-border bg-surface p-5"><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><label className="space-y-1 text-sm"><span className="text-muted-foreground">{t('workCalendar.workCenter')} *</span><SelectBase required value={formWorkCenterId} onValueChange={(value) => { setFormWorkCenterId(value); setEmployeeIds([]); }} options={[{ value: '', label: t('workCalendar.selectWorkCenter') }, ...workCenters.map((wc) => ({ value: wc.master_id, label: wc.code, secondaryLabel: displayName(wc.name, wc.code) }))]} aria-label={t('workCalendar.workCenter')} /></label><label className="space-y-1 text-sm"><span className="text-muted-foreground">{t('workCalendar.shift')} *</span><SelectBase required value={shiftId} onValueChange={setShiftId} options={shifts.map((shift) => ({ value: shift.master_id, label: `${shift.name} (${shift.start_time?.slice(0, 5)}-${shift.end_time?.slice(0, 5)})` }))} aria-label={t('workCalendar.shift')} /></label></div><div><div className="mb-2 text-sm text-muted-foreground">{t('workCalendar.employees')} *</div><div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">{employees.map((employee) => <label key={employee.master_id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-subtle p-2.5"><input type="checkbox" checked={employeeIds.includes(employee.master_id)} onChange={(event) => setEmployeeIds((prev) => event.target.checked ? [...prev, employee.master_id] : prev.filter((id) => id !== employee.master_id))} /><span><span className="block font-mono text-xs text-sky-300">{employee.code}</span><span className="block text-sm">{displayName(employee.name, employee.code)}</span></span></label>)}</div></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><label className="space-y-1 text-sm"><span className="text-muted-foreground">{t('workCalendar.startDate')} *</span><input type="date" min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full rounded-lg border border-border bg-background p-3" /></label>{preset === 'specific' && <label className="space-y-1 text-sm"><span className="text-muted-foreground">{t('workCalendar.specificDate')} *</span><input type="date" min={today} value={specificDate} onChange={(event) => setSpecificDate(event.target.value)} className="w-full rounded-lg border border-border bg-background p-3" /></label>}<div className={`space-y-1 text-sm ${preset === 'specific' ? 'md:col-span-2' : ''}`}><span className="text-muted-foreground">{t('workCalendar.period')} *</span><div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1 sm:grid-cols-4">{(['month', 'quarter', 'year', 'specific'] as const).map((item) => <button key={item} type="button" onClick={() => setPreset(item)} className={`rounded-md py-2 text-sm ${preset === item ? 'bg-action text-white' : 'text-muted-foreground'}`}>{t(`workCalendar.period.${item}`)}</button>)}</div></div></div><div className="space-y-2"><div className="text-sm text-muted-foreground">{t('workCalendar.daysOfWeek')}</div><div className="flex flex-wrap gap-2">{availableDays.map((day) => <label key={day} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><input type="checkbox" className="mr-2" checked={days.includes(day)} onChange={(event) => setDays((prev) => event.target.checked ? [...prev, day].sort() : prev.filter((item) => item !== day))} />{dayLabels[day - 1]}</label>)}{!availableDays.length && <span className="text-sm text-danger-foreground">{t('workCalendar.validationRequired')}</span>}</div></div><div className="rounded-lg border border-sky-900/70 bg-sky-950/30 p-4 text-sm">{t('workCalendar.bulkPreview', { employeeCount: employeeIds.length, dayCount, totalRows, from: range.from, to: range.to })}</div><Button disabled={!formWorkCenterId || !totalRows || !shiftId} onClick={() => setConfirm(true)}>{t('common.save')}</Button></div><div className="rounded-lg border border-border bg-surface p-5"><h3 className="mb-3 font-bold">{t('workCalendar.scheduleList')}</h3><BaseDataTable data={draftRows} columns={draftColumns} getRowId={(row) => row.key} pageSizeOptions={[10, 25, 50]} emptyState={<span>{t('workCalendar.noBulkRun')}</span>} /></div></div><BaseModal open={confirm} title={t('workCalendar.confirmTitle')} onClose={() => setConfirm(false)} size="sm" placement="center" footerLeft={<Button type="button" variant="secondary" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>} footer={<Button type="button" onClick={() => void submit().catch((err) => toast.error(err.message))}>{t('common.save')}</Button>}><p className="text-sm text-muted-foreground">{t('workCalendar.confirmBody', { totalRows, employeeCount: employeeIds.length, from: range.from, to: range.to })}</p></BaseModal></div>;
};
