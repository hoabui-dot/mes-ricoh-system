import React, { useEffect, useMemo, useState } from 'react';
import { Factory, Pencil, Plus, RefreshCw, Users, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { authHeaders, fetchResource, masterDataBaseUrl, postResource, putResource } from '../../lib/masterDataApi';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { LocalizedTextInput } from '../../components/LocalizedTextInput';
import { translatedEnum } from '../../lib/i18nLabels';
import { SelectBase } from '../../components/ui';

type ModalMode = 'create' | 'edit';

const WORK_CENTER_TYPES = ['Production', 'Inspection'] as const;
const blank = { code: '', code_reservation_id: '', name: { vi: '' }, site_id: '', shopfloor_id: '', area_id: '', work_center_type: 'Production', active_flag: true, capabilities: [] as any[], composition: [] as any[] };

export const WorkCentersScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [shopfloors, setShopfloors] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [workstationCapabilities, setWorkstationCapabilities] = useState<any[]>([]);
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
      const [wc, siteRows, areaRows, shopfloorRows, operationRows, workstationRows, capabilityRows] = await Promise.all([
        fetchResource('work-centers', user),
        fetchResource('sites', user),
        fetchResource('production-areas', user),
        fetchResource('shopfloors', user),
        fetchResource('operations', user),
        fetchResource('workstations', user),
        fetchResource('workstation-operation-capabilities', user),
      ]);
      setWorkCenters(wc);
      setSites(siteRows);
      setAreas(areaRows); setShopfloors(shopfloorRows);
      setOperations(operationRows);
      setWorkstations(workstationRows); setWorkstationCapabilities(capabilityRows);
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

  const openModal = async (mode: ModalMode, row?: any) => {
    setModal({ mode, row });
    let capabilities: any[] = []; let composition: any[] = [];
    if (row) { capabilities = await fetchResource('resource-capabilities', user, `?work_center_id=${row.master_id}`); const response = await fetch(`${masterDataBaseUrl()}/work-centers/${row.master_id}/composition`, { headers: authHeaders(user) }); const payload = response.ok ? await response.json() : { data: [] }; composition = Object.values((payload.data || []).reduce((acc: Record<string, any>, item: any) => { acc[item.workstation_id] ||= { workstation_id: item.workstation_id, operation_ids: [] }; acc[item.workstation_id].operation_ids.push(item.operation_id); return acc; }, {})); }
    let nextForm = row ? { ...row, name: typeof row.name === 'string' ? { vi: row.name } : row.name, capabilities, composition } : { ...blank, site_id: sites[0]?.master_id || '', area_id: areas[0]?.master_id || '' };
    if (!row) { const response = await fetch(`${masterDataBaseUrl()}/business-codes/reservations`, { method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: 'WorkCenter' }) }); if (response.ok) { const payload = await response.json(); nextForm = { ...nextForm, code: payload.data?.code, code_reservation_id: payload.data?.reservation_id }; } }
    setForm(nextForm);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = {
        code: form.code,
        code_reservation_id: form.code_reservation_id,
        name: form.name,
        site_id: form.site_id,
        area_id: form.area_id,
        shopfloor_id: form.shopfloor_id,
        work_center_type: form.work_center_type,
        active_flag: Boolean(form.active_flag),
      };
      const saved = modal?.mode === 'edit' ? await putResource('work-centers', modal.row.master_id, payload, user) : await postResource('work-centers', payload, user);
      const workCenterId = modal?.mode === 'edit' ? modal.row.master_id : saved.master_id;
      for (const capability of form.capabilities || []) {
        if (!capability.operation_id || Number(capability.cycle_time_sec) <= 0) continue;
        const capabilityPayload = { operation_id: capability.operation_id, work_center_id: workCenterId, capability_type: capability.capability_type || 'Eligible', cycle_time_sec: Number(capability.cycle_time_sec), active_flag: capability.active_flag !== false };
        if (capability.master_id) await putResource('resource-capabilities', capability.master_id, capabilityPayload, user);
        else await postResource('resource-capabilities', capabilityPayload, user);
      }
      if (form.composition?.length) {
        const response = await fetch(`${masterDataBaseUrl()}/work-centers/${workCenterId}/composition`, { method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ workstations: form.composition }) });
        if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.message || failure.error || t('workCenters.compositionSaveFailed')); }
      }
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
              <input readOnly required value={form.code} placeholder={t('common.code')} className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-amber-200" />
              <LocalizedTextInput required label={t('common.name')} value={form.name} onChange={(name) => setForm({ ...form, name })} />
              <SelectBase required value={form.site_id} onValueChange={(value) => setForm({ ...form, site_id: value })} options={sites.map((site) => ({ value: site.master_id, label: `${text(site.name) || site.code} (${site.code})` }))} aria-label={t('common.site')} />
              <SelectBase required value={form.shopfloor_id} onValueChange={(value) => setForm({ ...form, shopfloor_id: value })} options={shopfloors.filter((shopfloor) => !form.site_id || shopfloor.site_id === form.site_id).map((shopfloor) => ({ value: shopfloor.master_id, label: `${text(shopfloor.name) || shopfloor.code} (${shopfloor.code})` }))} aria-label={t('resourceFoundation.shopfloors')} />
              <SelectBase required value={form.area_id} onValueChange={(value) => setForm({ ...form, area_id: value })} options={areas.map((area) => ({ value: area.master_id, label: area.code }))} aria-label={t('common.area')} />
              <SelectBase value={form.work_center_type} onValueChange={(value) => setForm({ ...form, work_center_type: value })} options={WORK_CENTER_TYPES.map((type) => ({ value: type, label: translatedEnum(t, 'workCenters.type', type) }))} aria-label={t('common.type')} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active_flag} onChange={(e) => setForm({ ...form, active_flag: e.target.checked })} /> {form.active_flag ? t('common.active') : t('common.inactive')}</label>
            </div>
            <div className="space-y-3 rounded-md border border-border bg-surface-subtle p-4">
              <div><h4 className="font-semibold">{t('workCenters.capabilitiesTitle')}</h4><p className="text-xs text-muted-foreground">{t('workCenters.capabilitiesHelp')}</p></div>
              {(form.capabilities || []).map((capability: any, index: number) => <div key={capability.master_id || index} className="grid grid-cols-[1fr_140px_auto] items-end gap-2">
                <label className="space-y-1 text-xs"><span className="text-muted-foreground">{t('common.operation')}</span><SelectBase value={capability.operation_id} onValueChange={(value) => setForm({ ...form, capabilities: form.capabilities.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, operation_id: value } : item) })} options={operations.map((operation) => ({ value: operation.master_id, label: `${operation.code} - ${operation.name?.vi || operation.name?.en || ''}` }))} aria-label={t('common.operation')} /></label>
                <label className="space-y-1 text-xs"><span className="text-muted-foreground">{t('workCenters.cycleTimeSec')}</span><input required type="number" min="0.001" step="0.001" value={capability.cycle_time_sec || ''} onChange={(event) => setForm({ ...form, capabilities: form.capabilities.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, cycle_time_sec: event.target.value } : item) })} className="w-full rounded-md border border-border bg-background p-2 text-foreground" /></label>
                <button type="button" onClick={() => setForm({ ...form, capabilities: form.capabilities.filter((_item: any, itemIndex: number) => itemIndex !== index) })} className="rounded-md p-2 text-muted-foreground hover:bg-hover hover:text-danger" aria-label={t('common.remove')}><Trash2 className="h-4 w-4" /></button>
              </div>)}
              <button type="button" onClick={() => setForm({ ...form, capabilities: [...(form.capabilities || []), { operation_id: operations[0]?.master_id || '', cycle_time_sec: '' }] })} className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-hover">{t('workCenters.addCapability')}</button>
            </div>
            <div className="space-y-3 rounded-md border border-border bg-surface-subtle p-4">
              <div><h4 className="font-semibold">{t('workCenters.compositionTitle')}</h4><p className="text-xs text-muted-foreground">{t('workCenters.compositionHelp')}</p></div>
              {(form.composition || []).map((entry: any, index: number) => { const selected = workstationCapabilities.filter((capability) => capability.workstation_id === entry.workstation_id); return <div key={index} className="rounded-md border border-border p-3"><div className="flex gap-2"><SelectBase value={entry.workstation_id} onValueChange={(value) => setForm({ ...form, composition: form.composition.map((item: any, itemIndex: number) => itemIndex === index ? { workstation_id: value, operation_ids: [] } : item) })} options={workstations.filter((workstation) => !form.shopfloor_id || workstation.shopfloor_id === form.shopfloor_id).map((workstation) => ({ value: workstation.master_id, label: `${text(workstation.name) || workstation.code} (${workstation.code})` }))} aria-label={t('workCenters.workstation')} /><button type="button" onClick={() => setForm({ ...form, composition: form.composition.filter((_item: any, itemIndex: number) => itemIndex !== index) })} className="rounded-md p-2 text-muted-foreground" aria-label={t('common.remove')}><Trash2 className="h-4 w-4" /></button></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{selected.map((capability) => <label key={capability.operation_id} className="flex items-center gap-2 rounded border border-border p-2 text-sm"><input type="checkbox" checked={(entry.operation_ids || []).includes(capability.operation_id)} onChange={(event) => setForm({ ...form, composition: form.composition.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, operation_ids: event.target.checked ? [...(item.operation_ids || []), capability.operation_id] : (item.operation_ids || []).filter((id: string) => id !== capability.operation_id) } : item) })} />{text(capability.operation_name) || capability.operation_code} <span className="font-mono text-xs text-muted-foreground">{capability.operation_code} · {capability.cycle_time_sec}s</span></label>)}</div>{entry.workstation_id && !selected.length ? <div className="mt-2 text-xs text-danger">{t('workCenters.noSupportedOperations')}</div> : null}</div>; })}
              <button type="button" onClick={() => setForm({ ...form, composition: [...(form.composition || []), { workstation_id: '', operation_ids: [] }] })} className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-hover">{t('workCenters.addWorkstation')}</button>
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
