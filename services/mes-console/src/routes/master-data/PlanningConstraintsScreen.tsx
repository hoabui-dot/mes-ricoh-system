import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw, Save } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Button, Card, Input, SelectBase } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { fetchResource, masterDataBaseUrl, postResource, putResource, authHeaders } from '../../lib/masterDataApi';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';

type Entity = 'resource-capabilities' | 'resource-calendars' | 'production-standards' | 'operation-skill-requirements';
type Row = Record<string, any>;

const titleKeys: Record<Entity, string> = {
  'resource-capabilities': 'resourceFoundation.capabilities',
  'resource-calendars': 'resourceFoundation.calendars',
  'production-standards': 'resourceFoundation.productionStandards',
  'operation-skill-requirements': 'resourceFoundation.operationSkillRequirements',
};

function name(text: (value: unknown) => string, value: unknown, code?: unknown) {
  return <><span className="font-semibold text-foreground">{text(value) || '-'}</span>{code ? <span className="ml-2 font-mono text-xs text-muted-foreground">{String(code)}</span> : null}</>;
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: any; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block space-y-1"><span className="text-sm font-medium text-foreground">{label}{required ? ' *' : ''}</span><Input type={type} required={required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function PlanningConstraintsScreen({ entity }: { entity: Entity }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const editing = location.pathname.endsWith('/new') || location.pathname.endsWith('/edit');
  const detail = Boolean(id) && !editing;
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<Row>({ name: '', active_flag: true, eligibility: true, priority_no: 1, speed_factor: 1, resource_type: 'Equipment', availability_status: 'Available', available_minutes: 540, capacity_factor: 1, base_quantity: 1, standard_yield: 1, setup_time_min: 0, cycle_time_sec: 1, labor_count: 1, efficiency_factor: 1, required_persons: 1, mandatory_flag: true, effective_from: new Date().toISOString().slice(0, 16), valid_from: new Date().toISOString().slice(0, 16), calendar_date: new Date().toISOString().slice(0, 10) });
  const [options, setOptions] = useState<Record<string, Row[]>>({});
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const resources = ['sites', 'item-revisions', 'operations', 'routing-operations', 'work-centers', 'workstations', 'equipment', 'shifts', 'skills', 'reason-codes'];
      const values = await Promise.all(resources.map((resource) => fetchResource(resource, user)));
      const normalizedOptions = Object.fromEntries(resources.map((resource, index) => [resource, resource === 'item-revisions' ? values[index].filter((row: Row) => row.lifecycle_status === 'Released') : values[index]]));
      setOptions(normalizedOptions);
      if (detail && id) {
        const response = await fetch(`${masterDataBaseUrl()}/${entity}/${id}`, { headers: authHeaders(user) });
        if (!response.ok) throw new Error(t('resourceFoundation.loadFailed'));
        const payload = await response.json(); setForm(payload.data ?? payload);
      } else if (!editing) setRows(await fetchResource(entity, user));
    } catch (err) { setError(err); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [entity, id, editing]);
  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = { ...form };
      for (const key of ['priority_no', 'available_minutes', 'required_persons', 'labor_count']) if (payload[key] !== undefined) payload[key] = Number(payload[key]);
      for (const key of ['speed_factor', 'min_lot_size', 'max_lot_size', 'capacity_factor', 'base_quantity', 'standard_yield', 'setup_time_min', 'cycle_time_sec', 'efficiency_factor']) if (payload[key] !== undefined && payload[key] !== '') payload[key] = Number(payload[key]);
      if (entity === 'resource-calendars') payload.effective_from = new Date(`${payload.calendar_date}T00:00:00Z`).toISOString();
      const saved = id ? await putResource(entity, id, payload, user) : await postResource(entity, payload, user);
      const savedRow = saved?.data || saved;
      toast.success(t('resourceFoundation.saved')); navigate(`/master-data/${entity}/${savedRow?.master_id || id || ''}`); return saved;
    } catch (err: any) { toast.error(err.message); }
  };
  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;
  const title = t(titleKeys[entity]);
  if (editing) return <ConstraintForm entity={entity} title={title} form={form} set={set} save={save} options={options} t={t} text={text} id={id} />;
  if (detail && id) return <ConstraintDetail entity={entity} title={title} row={form} text={text} t={t} onBack={() => navigate(`/master-data/${entity}`)} />;
  return <ConstraintList entity={entity} title={title} rows={rows} text={text} t={t} loading={loading} onRefresh={load} onCreate={() => navigate(`/master-data/${entity}/new`)} onOpen={(row: Row) => navigate(`/master-data/${entity}/${row.master_id}`)} />;
}

function ConstraintForm({ entity, title, form, set, save, options, t, text, id }: any) {
  const opts = (resource: string, code = 'code') => (options[resource] || []).map((row: Row) => ({ value: row.master_id, label: <span>{name(text, row.name, row[code])}</span> }));
  return <form onSubmit={save} className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">{id ? `${t('common.edit')} ${title}` : `${t('common.create')} ${title}`}</h1><p className="mt-1 text-sm text-muted-foreground">{t('resourceFoundation.planningHelp')}</p></div><Link to={`/master-data/${entity}`}><Button type="button" variant="outline"><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button></Link></div><Card className="grid gap-4 p-5 md:grid-cols-2">
    <Field label={t('common.name')} value={form.name} onChange={(value) => set('name', value)} required /><Field label={t('common.code')} value={form.code} onChange={(value) => set('code', value)} required />
    {entity === 'resource-capabilities' ? <><SelectField label={t('common.site')} value={form.site_id} set={set} keyName="site_id" options={opts('sites')} required /><SelectField label={t('resourceFoundation.productRevision')} value={form.product_revision_id} set={set} keyName="product_revision_id" options={opts('item-revisions')} /><Field label={t('resourceFoundation.itemGroup')} value={form.item_group} onChange={(value) => set('item_group', value)} /><SelectField label={t('resourceFoundation.operation')} value={form.operation_id} set={set} keyName="operation_id" options={opts('operations')} required /><SelectField label={t('nav.workCenters')} value={form.work_center_id} set={set} keyName="work_center_id" options={opts('work-centers')} required /><SelectField label={t('resourceFoundation.equipment')} value={form.equipment_id} set={set} keyName="equipment_id" options={[{ value: '', label: t('common.none') }, ...opts('equipment')]} /><Field label={t('resourceFoundation.priority')} type="number" value={form.priority_no} onChange={(value) => set('priority_no', value)} required /><Field label={t('resourceFoundation.speedFactor')} type="number" value={form.speed_factor} onChange={(value) => set('speed_factor', value)} required /><Field label={t('resourceFoundation.minLotSize')} type="number" value={form.min_lot_size} onChange={(value) => set('min_lot_size', value)} /><Field label={t('resourceFoundation.maxLotSize')} type="number" value={form.max_lot_size} onChange={(value) => set('max_lot_size', value)} /><Field label={t('resourceFoundation.setupFamily')} value={form.setup_family} onChange={(value) => set('setup_family', value)} /><Check label={t('resourceFoundation.eligibility')} checked={form.eligibility !== false} onChange={(value) => set('eligibility', value)} /></> : null}
    {entity === 'resource-calendars' ? <><SelectField label={t('common.site')} value={form.site_id} set={set} keyName="site_id" options={opts('sites')} required /><Field label={t('resourceFoundation.resourceType')} value={form.resource_type} onChange={(value) => set('resource_type', value)} required /><SelectField label={t('resourceFoundation.resource')} value={form.resource_id} set={set} keyName="resource_id" options={form.resource_type === 'WorkCenter' ? opts('work-centers') : form.resource_type === 'Workstation' ? opts('workstations') : opts('equipment')} required /><SelectField label={t('resourceFoundation.shift')} value={form.shift_id} set={set} keyName="shift_id" options={opts('shifts')} required /><Field label={t('resourceFoundation.calendarDate')} type="date" value={form.calendar_date} onChange={(value) => set('calendar_date', value)} required /><Field label={t('resourceFoundation.availabilityStatus')} value={form.availability_status} onChange={(value) => set('availability_status', value)} required /><Field label={t('resourceFoundation.availableMinutes')} type="number" value={form.available_minutes} onChange={(value) => set('available_minutes', value)} required /><Field label={t('resourceFoundation.capacityFactor')} type="number" value={form.capacity_factor} onChange={(value) => set('capacity_factor', value)} required /><SelectField label={t('resourceFoundation.reason')} value={form.reason_id} set={set} keyName="reason_id" options={[{ value: '', label: t('common.none') }, ...opts('reason-codes')]} /></> : null}
    {entity === 'production-standards' ? <><SelectField label={t('common.site')} value={form.site_id} set={set} keyName="site_id" options={opts('sites')} required /><SelectField label={t('resourceFoundation.productRevision')} value={form.item_revision_id} set={set} keyName="item_revision_id" options={opts('item-revisions')} required /><SelectField label={t('resourceFoundation.routingOperation')} value={form.routing_operation_id} set={set} keyName="routing_operation_id" options={opts('routing-operations')} required /><SelectField label={t('nav.workCenters')} value={form.work_center_id} set={set} keyName="work_center_id" options={opts('work-centers')} required /><SelectField label={t('resourceFoundation.equipment')} value={form.equipment_id} set={set} keyName="equipment_id" options={[{ value: '', label: t('common.none') }, ...opts('equipment')]} /><Field label={t('resourceFoundation.baseQuantity')} type="number" value={form.base_quantity} onChange={(value) => set('base_quantity', value)} required /><Field label={t('resourceFoundation.setupTime')} type="number" value={form.setup_time_min} onChange={(value) => set('setup_time_min', value)} /><Field label={t('resourceFoundation.cycleTime')} type="number" value={form.cycle_time_sec} onChange={(value) => set('cycle_time_sec', value)} required /><Field label={t('resourceFoundation.requiredPersons')} type="number" value={form.labor_count} onChange={(value) => set('labor_count', value)} required /><Field label={t('resourceFoundation.standardYield')} type="number" value={form.standard_yield} onChange={(value) => set('standard_yield', value)} /><Field label={t('resourceFoundation.efficiency')} type="number" value={form.efficiency_factor} onChange={(value) => set('efficiency_factor', value)} /><Field label={t('resourceFoundation.sourceMethod')} value={form.source_method} onChange={(value) => set('source_method', value)} /><Field label={t('resourceFoundation.reviewDue')} type="date" value={form.review_due_date?.slice(0, 10)} onChange={(value) => set('review_due_date', value)} /></> : null}
    {entity === 'operation-skill-requirements' ? <><SelectField label={t('resourceFoundation.routingOperation')} value={form.routing_operation_id} set={set} keyName="routing_operation_id" options={opts('routing-operations')} required /><SelectField label={t('resourceFoundation.skill')} value={form.skill_id} set={set} keyName="skill_id" options={opts('skills')} required /><Field label={t('resourceFoundation.minimumLevel')} value={form.minimum_level} onChange={(value) => set('minimum_level', value)} required /><Field label={t('resourceFoundation.requiredPersons')} type="number" value={form.required_persons} onChange={(value) => set('required_persons', value)} required /><Check label={t('resourceFoundation.mandatory')} checked={form.mandatory_flag !== false} onChange={(value) => set('mandatory_flag', value)} /></> : null}
    <Check label={t('common.active')} checked={form.active_flag !== false} onChange={(value) => set('active_flag', value)} />
  </Card><div className="flex justify-end"><Button type="submit"><Save className="h-4 w-4" />{t('common.save')}</Button></div></form>;
}

function SelectField({ label, value, set, keyName, options, required = false }: any) { return <label className="block space-y-1"><span className="text-sm font-medium text-foreground">{label}{required ? ' *' : ''}</span><SelectBase value={value} onValueChange={(next) => set(keyName, next)} options={options} placeholder={label} required={required} /></label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }

function ConstraintList({ entity, title, rows, text, t, loading, onRefresh, onCreate, onOpen }: any) {
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{t('resourceFoundation.planningHelp')}</p></div><div className="flex gap-2"><Button variant="outline" onClick={onRefresh}><RefreshCw className="h-4 w-4" />{t('common.refresh')}</Button><Button onClick={onCreate}><Plus className="h-4 w-4" />{t('common.create')}</Button></div></div><Card className="overflow-x-auto p-0"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b bg-surface-subtle text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">{t('common.name')}</th><th className="px-4 py-3">{t('common.code')}</th><th className="px-4 py-3">{t('resourceFoundation.operation')}</th><th className="px-4 py-3">{t('nav.workCenters')}</th><th className="px-4 py-3">{t('common.status')}</th><th className="px-4 py-3">{t('resourceFoundation.effectivePeriod')}</th></tr></thead><tbody className="divide-y divide-border">{loading ? <tr><td colSpan={6} className="px-4 py-8 text-center">{t('common.loading')}</td></tr> : rows.map((row: Row) => <tr key={row.master_id} className="cursor-pointer hover:bg-hover" onClick={() => onOpen(row)}><td className="px-4 py-3">{name(text, row.item_name || row.operation_name || row.skill_name || row.name, row.item_code || row.operation_code || row.skill_code)}</td><td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.code}</td><td className="px-4 py-3">{name(text, row.operation_name, row.operation_code)}</td><td className="px-4 py-3">{name(text, row.work_center_name, row.work_center_code)}</td><td className="px-4 py-3"><StatusBadge status={row.lifecycle_status || (row.active_flag === false ? 'Inactive' : row.availability_status || (row.eligibility === false ? 'Denied' : 'Active'))} /></td><td className="px-4 py-3 text-xs text-muted-foreground">{row.calendar_date || row.valid_from || row.effective_from || '-'}</td></tr>)}{!loading && !rows.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{t('common.empty')}</td></tr> : null}</tbody></table></Card></div>;
}

function ConstraintDetail({ title, row, text, t, onBack }: any) {
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">{name(text, row.name || row.item_name || row.operation_name || row.skill_name, row.code)}</h1><p className="mt-1 text-sm text-muted-foreground">{title}</p></div><Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button></div><Card className="grid gap-4 p-5 md:grid-cols-3"><Detail label={t('common.status')} value={row.lifecycle_status || row.availability_status || (row.eligibility === false ? t('resourceFoundation.denied') : t('common.active'))} /><Detail label={t('common.code')} value={row.code} /><Detail label={t('resourceFoundation.operation')} value={name(text, row.operation_name, row.operation_code)} /><Detail label={t('nav.workCenters')} value={name(text, row.work_center_name, row.work_center_code)} /><Detail label={t('resourceFoundation.effectivePeriod')} value={row.valid_from || row.calendar_date || row.effective_from || '-'} /></Card></div>;
}
function Detail({ label, value }: { label: string; value: React.ReactNode }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium text-foreground">{value}</div></div>; }
