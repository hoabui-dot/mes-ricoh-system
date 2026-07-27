import React, { useEffect, useMemo, useState } from 'react';
import { Link2, Plus, RefreshCw, Router, TestTube2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { Button, Card, Confirmation, Input, Modal, SelectBase } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { authHeaders, masterDataBaseUrl } from '../../lib/masterDataApi';

type RecordRow = Record<string, any>;

export const PrintStationsScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const [stations, setStations] = useState<RecordRow[]>([]);
  const [sites, setSites] = useState<RecordRow[]>([]);
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [bindings, setBindings] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [bindingToRemove, setBindingToRemove] = useState<RecordRow | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', site_id: '', gateway_base_url: 'http://100.68.50.41:5001', deployment_mode: 'PHYSICAL' });
  const [bindingForm, setBindingForm] = useState({ workstation_id: '', role: 'PRIMARY', allocated_printer_quantity: '1' });
  const [candidates, setCandidates] = useState<RecordRow[]>([]);
  const [capacity, setCapacity] = useState<RecordRow | null>(null);

  const api = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${masterDataBaseUrl()}${path}`, { ...options, headers: { ...authHeaders(user), 'Content-Type': 'application/json', ...(options.headers || {}) }, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.message || body.error || t('printStation.loadFailed')) as Error & { code?: string }; error.code = body.error; throw error; }
    return body.data ?? body;
  };

  const bindingErrorMessage = (error: any) => {
    const code = String(error?.code || '');
    const key: Record<string, string> = {
      PRINT_PRIMARY_BINDING_OVERLAP: 'printStation.primaryBindingOverlap',
      PRINT_BINDING_OVERLAP: 'printStation.bindingOverlap',
      PRINT_BINDING_DUPLICATE: 'printStation.bindingDuplicate',
      WORKSTATION_ALREADY_HAS_PRINT_STATION: 'printStation.workstationAlreadyBound',
      INVALID_ALLOCATED_PRINTER_QUANTITY: 'printStation.invalidAllocation',
      PRINT_STATION_RUNTIME_NOT_AVAILABLE: 'printStation.runtimeUnavailable',
      PRINT_STATION_ALLOCATION_EXCEEDS_CAPACITY: 'printStation.capacityExceeded',
    };
    return key[code] ? t(key[code]) : error?.message || t('printStation.bindingFailed');
  };

  const load = async () => {
    setLoading(true);
    try {
      const [nextStations, nextSites] = await Promise.all([api('/print-stations?limit=500'), api('/sites?limit=500')]);
      setStations(Array.isArray(nextStations) ? nextStations : []);
      setSites(Array.isArray(nextSites) ? nextSites : []);
      if (!form.site_id && Array.isArray(nextSites) && nextSites[0]) setForm((current) => ({ ...current, site_id: nextSites[0].master_id }));
      if (selected) {
        const refreshed = (nextStations as RecordRow[]).find((row) => row.master_id === selected.master_id);
        if (refreshed) { setSelected(refreshed); setBindings(await api(`/print-stations/${refreshed.master_id}/workstations`)); }
      }
    } catch (error: any) { toast.error(error.message || t('printStation.loadFailed')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const siteOptions = useMemo(() => sites.map((site) => ({ value: site.master_id, label: `${site.code} · ${text(site.name)}` })), [sites, text]);
  const selectStation = async (station: RecordRow) => {
    setSelected(station);
    try {
      const [nextBindings, candidateResult] = await Promise.all([api(`/print-stations/${station.master_id}/workstations`), api(`/print-stations/${station.master_id}/workstation-candidates`)]);
      setBindings(Array.isArray(nextBindings) ? nextBindings : []);
      setCandidates(Array.isArray(candidateResult?.candidates) ? candidateResult.candidates : []);
      const nextCapacity = candidateResult?.capacity ?? null;
      setCapacity(nextCapacity?.remaining === 0 ? { ...nextCapacity, remaining: null } : nextCapacity);
    }
    catch (error: any) { toast.error(error.message); }
  };

  const createStation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim() || !form.gateway_base_url.trim()) { toast.error(t('printStation.required')); return; }
    setSaving(true);
    try {
      const created = await api('/print-stations', { method: 'POST', body: JSON.stringify({ code: form.code.trim(), name: { vi: form.name.trim(), en: form.name.trim(), ja: form.name.trim(), ko: form.name.trim() }, description: form.description.trim() ? { vi: form.description.trim(), en: form.description.trim(), ja: form.description.trim(), ko: form.description.trim() } : null, site_id: form.site_id, gateway_base_url: form.gateway_base_url.trim(), deployment_mode: form.deployment_mode, capabilities: ['PRINT'] }) });
      toast.success(t('printStation.created')); setShowCreate(false); setForm({ code: '', name: '', description: '', site_id: sites[0]?.master_id || '', gateway_base_url: 'http://100.68.50.41:5001', deployment_mode: 'PHYSICAL' }); await load(); await selectStation(created);
    } catch (error: any) { toast.error(error.message || t('printStation.saveFailed')); }
    finally { setSaving(false); }
  };

  const testConnection = async () => {
    if (!selected) return;
    setTesting(true);
    try { const updated = await api(`/print-stations/${selected.master_id}/test-connection`, { method: 'POST' }); setSelected(updated); toast.success(t('printStation.healthPassed')); await load(); }
    catch (error: any) { toast.warning(error.message || t('printStation.healthSkipped')); await load(); }
    finally { setTesting(false); }
  };

  const bindWorkstation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !bindingForm.workstation_id) return;
    const quantity = Number(bindingForm.allocated_printer_quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || (capacity?.remaining != null && quantity > Number(capacity.remaining))) { toast.error(t('printStation.invalidAllocation')); return; }
    setSaving(true);
    try { await api(`/workstations/${bindingForm.workstation_id}/print-station-bindings`, { method: 'POST', body: JSON.stringify({ print_station_id: selected.master_id, role: bindingForm.role, allocated_printer_quantity: quantity }) }); toast.success(t('printStation.bindingCreated')); setBindingForm({ workstation_id: '', role: 'PRIMARY', allocated_printer_quantity: '1' }); await selectStation(selected); await load(); }
    catch (error: any) { toast.error(bindingErrorMessage(error)); }
    finally { setSaving(false); }
  };

  const removeBinding = async () => {
    if (!bindingToRemove || !selected) return;
    setSaving(true);
    try { await api(`/workstation-print-station-bindings/${bindingToRemove.binding_id}`, { method: 'DELETE' }); toast.success(t('printStation.bindingRemoved')); setBindingToRemove(null); await selectStation(selected); await load(); }
    catch (error: any) { toast.error(bindingErrorMessage(error)); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black text-foreground">{t('printStation.title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('printStation.subtitle')}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{t('common.refresh')}</Button><Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />{t('printStation.add')}</Button></div></div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-subtle text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">{t('printStation.code')}</th><th className="px-4 py-3">{t('printStation.name')}</th><th className="px-4 py-3">{t('printStation.bindings')}</th><th className="px-4 py-3">{t('printStation.capacity')}</th><th className="px-4 py-3">{t('printStation.allocated')}</th><th className="px-4 py-3">{t('printStation.remaining')}</th><th className="px-4 py-3">{t('printStation.runtimeStatus')}</th></tr></thead><tbody className="divide-y divide-border">{loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t('common.loading')}</td></tr> : stations.map((station) => <tr key={station.master_id} onClick={() => void selectStation(station)} className={`cursor-pointer hover:bg-hover ${selected?.master_id === station.master_id ? 'bg-action/10' : ''}`}><td className="px-4 py-3 font-mono font-semibold">{station.code}</td><td className="px-4 py-3"><div className="font-medium">{text(station.name)}</div></td><td className="px-4 py-3">{station.active_binding_count || 0}</td><td className="px-4 py-3">{station.effective_allocation_capacity ?? t('printStation.unknown')}</td><td className="px-4 py-3">{station.allocated_printer_quantity ?? 0}</td><td className="px-4 py-3">{station.remaining_printer_quantity ?? t('printStation.unknown')}</td><td className="px-4 py-3"><StatusBadge status={station.runtime_status || station.status} /></td></tr>)}{!loading && !stations.length ? <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t('printStation.noStations')}</td></tr> : null}</tbody></table></div></Card>
      {selected ? <Card className="space-y-5 p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Router className="h-5 w-5 text-action" /><h2 className="text-lg font-bold">{text(selected.name)}</h2></div><p className="mt-1 font-mono text-xs text-muted-foreground">{selected.code}</p></div><Button variant="outline" size="icon" title={t('printStation.test')} onClick={() => void testConnection()} disabled={testing}><TestTube2 className={`h-4 w-4 ${testing ? 'animate-pulse' : ''}`} /></Button></div><div className="grid gap-3 text-sm sm:grid-cols-3"><div><div className="text-xs text-muted-foreground">{t('printStation.capacity')}</div><div>{selected.effective_allocation_capacity ?? t('printStation.unknown')}</div></div><div><div className="text-xs text-muted-foreground">{t('printStation.allocated')}</div><div>{selected.allocated_printer_quantity ?? 0}</div></div><div><div className="text-xs text-muted-foreground">{t('printStation.remaining')}</div><div>{selected.remaining_printer_quantity ?? t('printStation.unknown')}</div></div><div><div className="text-xs text-muted-foreground">{t('printStation.ready')}</div><div>{selected.ready_printer_count ?? t('printStation.unknown')}</div></div><div><div className="text-xs text-muted-foreground">{t('printStation.runtimeStatus')}</div><StatusBadge status={selected.runtime_status || selected.status} /></div><div><div className="text-xs text-muted-foreground">{t('printStation.kafka')}</div><StatusBadge status={selected.kafka_status || 'UNKNOWN'} /></div></div><div className="border-t border-border pt-4"><h3 className="mb-3 text-sm font-bold">{t('printStation.bindings')}</h3>{bindings.length ? <div className="space-y-2">{bindings.map((binding) => <div key={binding.binding_id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-subtle p-3"><div><div className="font-semibold">{binding.workstation_code}</div><div className="text-xs text-muted-foreground">{t('printStation.allocated')}: {binding.allocated_printer_quantity} · {binding.role === 'PRIMARY' ? t('printStation.bindingPrimary') : t('printStation.bindingBackup')}</div></div><div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-action" />{binding.is_active ? <Button variant="ghost" size="icon" title={t('printStation.removeBinding')} onClick={() => setBindingToRemove(binding)} disabled={saving}><Trash2 className="h-4 w-4 text-destructive" /></Button> : null}</div></div>)}</div> : <p className="text-sm text-muted-foreground">{t('printStation.noBindings')}</p>}</div><form onSubmit={bindWorkstation} className="space-y-3 border-t border-border pt-4"><h3 className="text-sm font-bold">{t('printStation.bind')}</h3><div className="text-xs text-muted-foreground">{t('printStation.remaining')}: {capacity?.remaining ?? t('printStation.unknown')}</div><SelectBase label={t('printStation.selectWorkstation')} value={bindingForm.workstation_id} onValueChange={(value) => setBindingForm((current) => ({ ...current, workstation_id: value }))} options={candidates.map((row) => ({ value: row.workstation_id, label: `${row.workstation_code} · ${text(row.workstation_name)}` }))} placeholder={t('printStation.selectWorkstation')} /><Input type="number" min={1} max={capacity?.remaining ?? undefined} label={t('printStation.allocated')} value={bindingForm.allocated_printer_quantity} onChange={(event) => setBindingForm((current) => ({ ...current, allocated_printer_quantity: event.target.value }))} /><SelectBase label={t('printStation.status')} value={bindingForm.role} onValueChange={(value) => setBindingForm((current) => ({ ...current, role: value }))} options={[{ value: 'PRIMARY', label: t('printStation.bindingPrimary') }, { value: 'BACKUP', label: t('printStation.bindingBackup') }]} /><Button type="submit" disabled={saving || !bindingForm.workstation_id || capacity?.remaining === 0}><Link2 className="h-4 w-4" />{t('printStation.bind')}</Button></form></Card> : <Card className="flex min-h-64 items-center justify-center p-5 text-center text-sm text-muted-foreground">{t('printStation.selectStation')}</Card>}
    </div>
    <Modal open={showCreate} title={t('printStation.add')} onClose={() => setShowCreate(false)} footerLeft={<Button variant="outline" onClick={() => setShowCreate(false)}><X className="h-4 w-4" />{t('common.cancel')}</Button>} footer={<Button form="print-station-create" type="submit" disabled={saving}><Plus className="h-4 w-4" />{t('common.save')}</Button>}><form id="print-station-create" onSubmit={createStation} className="space-y-4"><Input aria-label={t('printStation.code')} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder={t('printStation.code')} /><Input aria-label={t('printStation.name')} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t('printStation.name')} /><SelectBase label={t('printStation.site')} value={form.site_id || sites[0]?.master_id || ''} onValueChange={(value) => setForm((current) => ({ ...current, site_id: value }))} options={siteOptions} placeholder={t('printStation.site')} /><label className="block space-y-1 text-sm font-medium"><span>{t('printStation.description')}</span><textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label><label className="block space-y-1 text-sm font-medium"><span>{t('printStation.gateway')}</span><Input value={form.gateway_base_url} onChange={(event) => setForm((current) => ({ ...current, gateway_base_url: event.target.value }))} /><span className="block text-xs font-normal text-muted-foreground">{t('printStation.gatewayHelp')}</span></label><SelectBase label={t('printStation.mode')} value={form.deployment_mode} onValueChange={(value) => setForm((current) => ({ ...current, deployment_mode: value }))} options={[{ value: 'PHYSICAL', label: t('printStation.mode.PHYSICAL') }, { value: 'SIMULATION', label: t('printStation.mode.SIMULATION') }, { value: 'HYBRID', label: t('printStation.mode.HYBRID') }]} /></form></Modal>
    <Confirmation open={Boolean(bindingToRemove)} title={t('printStation.removeBinding')} description={t('printStation.removeBindingConfirm', { workstation: bindingToRemove?.workstation_code || '' })} confirmLabel={t('common.remove')} cancelLabel={t('common.cancel')} destructive onClose={() => setBindingToRemove(null)} onConfirm={() => void removeBinding()} />
  </div>;
};
