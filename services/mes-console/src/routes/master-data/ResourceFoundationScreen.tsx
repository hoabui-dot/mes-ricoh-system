import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Plus, RefreshCw, Save, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { LocalizedTextInput } from '../../components/LocalizedTextInput';
import { createProductionLineAggregate, deleteResource, fetchProductionLineResourceScopes, fetchResource, masterDataBaseUrl, postResource, putResource, authHeaders, saveProductionLineResourceScopes, saveProductionLineWorkCenters } from '../../lib/masterDataApi';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { Button, Card, Checkbox, ComboboxBase, Confirmation, FieldHelpPopover, Input, Modal, SelectBase } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { ResourceHierarchy } from '../../components/ResourceHierarchy';
import { GeneratedCodeField } from '../../components/GeneratedCodeField';
import { ResourceHierarchyContext } from '../../components/ResourceHierarchyContext';
import { StatusSwitchField } from '../../components/StatusSwitchField';
import { BaseCardGrid, BaseDataTable, type BaseDataTableColumn } from '../../components/base';
import { formatNumberForDisplay } from '../../lib/numeric/uomNumeric';

type Entity = 'factories' | 'shopfloors' | 'production-areas' | 'production-lines' | 'work-centers' | 'workstations' | 'equipment' | 'machines' | 'resource-assignments';
type AnyRecord = Record<string, any>;

const PRODUCTION_LINE_TYPES = ['Production', 'Assembly', 'Packaging', 'Inspection'] as const;

const labels: Record<Entity, string> = {
  factories: 'resourceFoundation.factories',
  shopfloors: 'resourceFoundation.shopfloors',
  'production-areas': 'resourceFoundation.productionAreas',
  'production-lines': 'resourceFoundation.productionLines',
  'work-centers': 'nav.workCenters',
  workstations: 'resourceFoundation.workstations',
  equipment: 'resourceFoundation.machines',
  machines: 'resourceFoundation.machines',
  'resource-assignments': 'resourceFoundation.assignments',
};

function identity(text: (value: unknown) => string, row: AnyRecord | undefined, prefix: string) {
  if (!row) return '-';
  return <><span className="font-semibold text-foreground">{text(row[`${prefix}_name`] ?? row.name) || '-'}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{row[`${prefix}_code`] ?? row.code ?? '-'}</span></>;
}

function optionLabel(text: (value: unknown) => string, row: AnyRecord, prefix = '') {
  const name = text(row[`${prefix}name`] ?? row.name) || '-';
  const code = row[`${prefix}code`] ?? row.code ?? '-';
  const context = row.area_code || row.work_center_code || row.site_code;
  return <span><span className="font-semibold">{name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{code}{context ? ` · ${context}` : ''}</span></span>;
}

function Field({ label, value, onChange, type = 'text', required = false, testId }: { label: string; value: any; onChange: (value: string) => void; type?: string; required?: boolean; testId?: string }) {
  return <label className="block space-y-1"><span className="text-sm font-medium text-foreground">{label}{required ? ' *' : ''}</span><Input data-testid={testId} type={type} required={required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label>;
}

function emptyResourceForm(): AnyRecord {
  return { name: { vi: '' }, description: { vi: '' }, status: 'Active', active_flag: true, lifecycle_status: 'Draft', expected_unit_count: 0, max_concurrent_jobs: 1, default_efficiency: 1, execution_status: 'Available', planning_resource_flag: true, assignment_role: 'Primary', scheduling_flag: true, oee_aggregation_flag: false, effective_from: new Date().toISOString().slice(0, 16) };
}

export function ResourceFoundationScreen({ entity }: { entity: Entity }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const formMode = location.pathname.endsWith('/new') || location.pathname.endsWith('/edit');
  const detailMode = Boolean(id) && !formMode;
  const [rows, setRows] = useState<AnyRecord[]>([]);
  const [sites, setSites] = useState<AnyRecord[]>([]);
  const [areas, setAreas] = useState<AnyRecord[]>([]);
  const [shopfloors, setShopfloors] = useState<AnyRecord[]>([]);
  const [workCenters, setWorkCenters] = useState<AnyRecord[]>([]);
  const [workstations, setWorkstations] = useState<AnyRecord[]>([]);
  const [equipment, setEquipment] = useState<AnyRecord[]>([]);
  const [operations, setOperations] = useState<AnyRecord[]>([]);
  const [skills, setSkills] = useState<AnyRecord[]>([]);
  const [machineGroups, setMachineGroups] = useState<AnyRecord[]>([]);
  const [resourceAssignments, setResourceAssignments] = useState<AnyRecord[]>([]);
  const [machineUnitsByEquipment, setMachineUnitsByEquipment] = useState<Record<string, AnyRecord[]>>({});
  const [detail, setDetail] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<AnyRecord>(emptyResourceForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [machineActionOpen, setMachineActionOpen] = useState(false);
  const [machineActionLoading, setMachineActionLoading] = useState(false);
  const [machineAction, setMachineAction] = useState<'delete' | 'deactivate' | null>(null);
  const [machineTarget, setMachineTarget] = useState<AnyRecord | null>(null);
  const [machineImpact, setMachineImpact] = useState<AnyRecord | null>(null);
  const [machineConfirmationOpen, setMachineConfirmationOpen] = useState(false);
  const [machineConfirmationKind, setMachineConfirmationKind] = useState<'edit' | 'delete' | 'deactivate'>('delete');
  const [releaseConfirmationOpen, setReleaseConfirmationOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const confirmedMachineSave = useRef(false);
  const loadRequestRef = useRef(0);
  const [formSectionsLoading, setFormSectionsLoading] = useState({ basic: false, machineGroups: false, operations: false, skills: false, availability: false });

  const load = async () => {
    const requestId = ++loadRequestRef.current;
    const isCurrent = () => requestId === loadRequestRef.current;
    const isWorkstationForm = entity === 'workstations' && formMode;
    setLoading(true); setError(null);
    if (isWorkstationForm) setFormSectionsLoading({ basic: true, machineGroups: true, operations: true, skills: true, availability: true });
    try {
      const [siteRows, areaRows, shopfloorRows, wcRows, wsRows, eqRows, groupRows, operationRows, skillRows, assignmentRows] = await Promise.all([
        fetchResource('sites', user), fetchResource('production-areas', user), fetchResource('shopfloors', user), fetchResource('work-centers', user),
        fetchResource('workstations', user), fetchResource('equipment', user), fetchResource('machine-groups', user), fetchResource('operations', user), fetchResource('skills', user), fetchResource('resource-assignments', user),
      ]);
      if (!isCurrent()) return;
      let machineRows = eqRows;
      if (isWorkstationForm) {
        const availabilityResponse = await fetch(`${masterDataBaseUrl()}/workstations/machine-availability${id ? `?workstation_id=${encodeURIComponent(id)}` : ''}`, { headers: authHeaders(user), cache: 'no-store' });
        if (!availabilityResponse.ok) throw new Error(t('resourceFoundation.loadFailed'));
        const availabilityPayload = await availabilityResponse.json();
        const availability = availabilityPayload.data || [];
        machineRows = eqRows.map((machine: AnyRecord) => ({ ...machine, ...(availability.find((item: AnyRecord) => item.machine_id === machine.master_id) || {}) }));
        const unitEntries = await Promise.all(eqRows.map(async (machine: AnyRecord) => {
          const response = await fetch(`${masterDataBaseUrl()}/machines/${machine.master_id}/units`, { headers: authHeaders(user), cache: 'no-store' });
          if (!response.ok) return [machine.master_id, []] as const;
          const payload = await response.json();
          return [machine.master_id, payload.data || []] as const;
        }));
        if (!isCurrent()) return;
        setMachineUnitsByEquipment(Object.fromEntries(unitEntries));
        if (!isCurrent()) return;
        setFormSectionsLoading((current) => ({ ...current, availability: false }));
      }
      if (!isCurrent()) return;
      setSites(siteRows); setAreas(areaRows); setShopfloors(shopfloorRows); setWorkCenters(wcRows); setWorkstations(wsRows); setEquipment(machineRows); setMachineGroups(groupRows); setOperations(operationRows); setSkills(skillRows); setResourceAssignments(assignmentRows);
      if (isWorkstationForm) setFormSectionsLoading((current) => ({ ...current, basic: false, operations: false }));
      if (id) {
        const response = await fetch(`${masterDataBaseUrl()}/${entity}/${id}`, { headers: authHeaders(user), cache: 'no-store' });
        if (!response.ok) throw new Error(t('resourceFoundation.loadFailed'));
        const payload = await response.json();
        const record = payload.data ?? payload;
        const normalizedRecord: AnyRecord = {
          ...record,
          name: record.name || { vi: '' },
          description: record.description || { vi: '' },
          quantity: Number(record.quantity ?? 1),
          default_efficiency: Number(record.default_efficiency ?? 1),
          active_flag: record.active_flag !== false,
          planning_resource_flag: record.planning_resource_flag === true,
          execution_status: record.execution_status || 'Available',
        };
        if (entity === 'production-lines') normalizedRecord.resource_scopes = await fetchProductionLineResourceScopes(id, user);
        if (entity === 'workstations') {
          const availabilityResponse = await fetch(`${masterDataBaseUrl()}/workstations/machine-availability?workstation_id=${encodeURIComponent(id)}`, { headers: authHeaders(user), cache: 'no-store' });
          if (availabilityResponse.ok) {
            const availabilityPayload = await availabilityResponse.json();
            normalizedRecord.machine_availability = availabilityPayload.data || [];
          } else {
            normalizedRecord.machine_availability = [];
          }
        }
        if (entity === 'machines' || entity === 'equipment' || entity === 'workstations' || entity === 'work-centers') {
          const skillType = entity === 'workstations' ? 'Workstation' : entity === 'work-centers' ? 'WorkCenter' : 'Machine';
          const skillResponse = await fetch(`${masterDataBaseUrl()}/resource-skill-assignments?resource_type=${skillType}&resource_id=${encodeURIComponent(id)}`, { headers: authHeaders(user), cache: 'no-store' });
          if (skillResponse.ok) {
            const skillPayload = await skillResponse.json();
            normalizedRecord.skill_ids = (skillPayload.data || []).map((assignment: AnyRecord) => assignment.skill_id).filter(Boolean);
          }
        }
        if (!isCurrent()) return;
        setDetail(normalizedRecord);
        setForm(normalizedRecord);
        if (isWorkstationForm) setFormSectionsLoading({ basic: false, machineGroups: false, operations: false, skills: false, availability: false });
      } else if (formMode) {
        const entityType = entity === 'production-lines' ? 'ProductionLine' : entity === 'work-centers' ? 'WorkCenter' : entity === 'workstations' ? 'Workstation' : entity === 'machines' || entity === 'equipment' ? 'Machine' : entity === 'factories' ? 'Factory' : entity === 'shopfloors' ? 'Shopfloor' : '';
        if (entityType) {
          const reservationResponse = await fetch(`${masterDataBaseUrl()}/business-codes/reservations`, { method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: entityType }) });
          if (reservationResponse.ok) { const reservation = await reservationResponse.json(); if (!isCurrent()) return; setForm((current) => ({ ...current, code: reservation.data?.code, code_reservation_id: reservation.data?.reservation_id })); }
        }
        if (isWorkstationForm) setFormSectionsLoading({ basic: false, machineGroups: false, operations: false, skills: false, availability: false });
      } else if (entity === 'resource-assignments') {
        const assignmentRows = await fetchResource(entity, user); if (!isCurrent()) return; setRows(assignmentRows);
      } else {
        const resourceRows = await fetchResource(entity, user); if (!isCurrent()) return; setRows(resourceRows);
      }
    } catch (err) { if (!isCurrent()) return; setError(err); if (isWorkstationForm) setFormSectionsLoading({ basic: false, machineGroups: false, operations: false, skills: false, availability: false }); } finally { if (isCurrent()) setLoading(false); }
  };

  useEffect(() => {
    loadRequestRef.current += 1;
    if (formMode && !id) { setDetail(null); setForm(emptyResourceForm()); }
    if (!formMode) setMachineUnitsByEquipment({});
    void load();
  }, [entity, id, formMode]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (entity === 'production-lines') {
        const selectedShopfloor = shopfloors.find((row: AnyRecord) => row.master_id === form.shopfloor_id);
        const selectedArea = areas.find((row: AnyRecord) => row.master_id === form.area_id);
        if (!form.site_id || !selectedShopfloor || !selectedArea) {
          toast.error(t('resourceFoundation.productionLineHierarchyRequired'));
          return;
        }
        if (selectedShopfloor.site_id !== form.site_id || selectedArea.site_id !== form.site_id) {
          toast.error(t('resourceFoundation.productionLineHierarchyMismatch'));
          return;
        }
        if (!PRODUCTION_LINE_TYPES.includes(form.line_type as typeof PRODUCTION_LINE_TYPES[number])) {
          toast.error(t('resourceFoundation.lineTypeInvalid'));
          return;
        }
        if (!id && (!Array.isArray(form.line_work_centers) || form.line_work_centers.length === 0)) {
          toast.error(t('resourceFoundation.noWorkCenterCoverage'));
          return;
        }
        if (!id && (!Array.isArray(form.line_workstation_ids) || form.line_workstation_ids.length === 0)) {
          toast.error(t('resourceFoundation.noResourceScope'));
          return;
        }
      }
      const machineEntity = entity === 'equipment' || entity === 'machines';
      const skillScope = machineEntity ? 'Machine' : entity === 'workstations' ? 'Workstation' : entity === 'work-centers' ? 'WorkCenter' : '';
      if (machineEntity && (!Array.isArray(form.skill_ids) || form.skill_ids.length === 0)) {
        toast.error(t('skills.requiredForMachine'));
        return;
      }
      const workstationEntity = entity === 'workstations';
      if (workstationEntity && (!Array.isArray(form.machine_groups) || form.machine_groups.length === 0)) {
        toast.error(t('resourceFoundation.atLeastOneMachineGroup'));
        return;
      }
      if (workstationEntity) {
        const usage = new Map<string, number>();
        for (const group of form.machine_groups as AnyRecord[]) {
          const lines = Array.isArray(group.requirements)
            ? group.requirements
            : [group.primary_machine_id ? { machine_id: group.primary_machine_id, role: 'Primary', required_quantity: 1 } : null, ...(Array.isArray(group.supporting_machines) ? group.supporting_machines : [])].filter(Boolean);
          for (const line of lines) if (line.machine_id) usage.set(line.machine_id, (usage.get(line.machine_id) || 0) + Number(line.required_quantity || 1));
        }
        const overCapacity = equipment.find((machine: AnyRecord) => (usage.get(machine.master_id) || 0) > Number(machine.available_unit_count ?? machine.quantity ?? 1));
        if (overCapacity) { toast.error(t('resourceFoundation.machineQuantityExceeded', { machine: text(overCapacity.name) || overCapacity.code, available: Number(overCapacity.available_unit_count ?? overCapacity.quantity ?? 1), requested: usage.get(overCapacity.master_id) })); return; }
        if ((form.machine_groups as AnyRecord[]).some((group) => {
          const lines = Array.isArray(group.requirements) ? group.requirements : [];
          return group.primary_machine_id ? false : !lines.some((line: AnyRecord) => line.role === 'Primary' && line.machine_id);
        })) { toast.error(t('resourceFoundation.machineGroupPrimaryRequired')); return; }
        const unpinned = (form.machine_groups as AnyRecord[]).flatMap((group) => (group.requirements || []).filter((line: AnyRecord) => line.machine_id && Number(line.required_quantity || 1) !== (line.pinned_machine_unit_ids || []).length));
        if (unpinned.length) { toast.error(t('resourceFoundation.machineSerialSelectionRequired')); return; }
      }
      const payload: AnyRecord = machineEntity ? {
        ...(id ? {} : { code: form.code, code_reservation_id: form.code_reservation_id }),
        name: form.name,
        site_id: form.site_id,
        work_center_id: form.work_center_id || null,
        description: form.description,
        equipment_type: form.equipment_type,
        manufacturer: form.manufacturer,
        model: form.model,
        quantity: Number(form.expected_unit_count ?? form.quantity ?? 0),
        default_efficiency: Number(form.default_efficiency ?? 1),
        lifecycle_status: form.lifecycle_status || 'Draft',
        planning_resource_flag: form.planning_resource_flag === true,
      } : workstationEntity ? {
        name: form.name,
        description: form.description,
        work_center_id: form.work_center_id,
        machine_groups: form.machine_groups || [],
        execution_mode: form.execution_mode || 'Kiosk',
        active_flag: form.active_flag !== false,
        max_concurrent_jobs: Number(form.max_concurrent_jobs ?? 1),
        machine_requirement_flag: form.machine_requirement_flag !== false,
      } : { ...form };
      if (entity === 'production-areas') payload.sequence_no = Number(payload.sequence_no || 0);
      if (entity === 'workstations') payload.execution_mode = payload.execution_mode || 'Kiosk';
      if (entity === 'resource-assignments') payload.effective_from = new Date(payload.effective_from).toISOString();
      if (id && (machineEntity || workstationEntity)) {
        const impactResponse = await fetch(`${masterDataBaseUrl()}/${workstationEntity ? 'workstations' : 'machines'}/${id}/change-impact`, { headers: authHeaders(user) });
        const impactPayload = await impactResponse.json().catch(() => ({}));
        if (!impactResponse.ok) throw new Error(impactPayload.message || impactPayload.error || t('resourceFoundation.loadFailed'));
        if (impactPayload.data?.blocking && !confirmedMachineSave.current) {
          setMachineConfirmationKind('edit'); setMachineConfirmationOpen(true); return;
        }
        confirmedMachineSave.current = false;
      }
      const saved = id ? await putResource(entity, id, payload, user) : entity === 'production-lines'
        ? await createProductionLineAggregate({ ...payload, work_centers: form.line_work_centers, workstation_ids: form.line_workstation_ids }, user)
        : await postResource(entity, payload, user);
      if (entity === 'workstations' && id) {
        const workstationId = id || saved?.master_id;
        const groupResponse = await fetch(`${masterDataBaseUrl()}/workstations/${workstationId}/machine-groups`, { method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ groups: form.machine_groups || [] }) });
        if (!groupResponse.ok) { const groupError = await groupResponse.json().catch(() => ({})); throw Object.assign(new Error(groupError.message || groupError.error || t('resourceFoundation.saveFailed')), { code: groupError.error, details: groupError.details }); }
      }
      if (skillScope && Array.isArray(form.skill_ids)) {
        const resourceId = id || saved?.master_id;
        const skillResponse = await fetch(`${masterDataBaseUrl()}/resource-skill-assignments/${skillScope}/${resourceId}`, { method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ skill_ids: form.skill_ids }) });
        if (!skillResponse.ok) { const skillError = await skillResponse.json().catch(() => ({})); throw new Error(skillError.message || skillError.error || t('skills.saveFailed')); }
      }
      toast.success(t('resourceFoundation.saved')); navigate(id ? `/master-data/${entity}/${id}` : `/master-data/${entity}`);
      return saved;
    } catch (err: any) {
      const code = String(err.code || err.message || '');
      const resourceErrorKey = `resourceFoundation.errors.${code}`;
      const translated = code === 'WORK_CENTER_AND_MACHINE_GROUPS_REQUIRED'
        ? t('resourceFoundation.workCenterAndMachineGroupsRequired')
        : code === 'WORKSTATION_CAPABILITY_DUPLICATE'
          ? t('resourceFoundation.workstationCapabilityDuplicate')
          : code === 'MACHINE_UNIT_PRIMARY_CONFLICT' || code === 'PRIMARY_EQUIPMENT_ASSIGNMENT_OVERLAP'
            ? t('resourceFoundation.machinePrimaryConflict')
            : code === 'MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE'
              ? t('resourceFoundation.machineQuantityUnavailable')
              : code === 'MACHINE_UNIT_ALREADY_ASSIGNED'
                ? t('resourceFoundation.machinePrimaryConflict')
                : t(resourceErrorKey) !== resourceErrorKey
                  ? t(resourceErrorKey)
                  : t('resourceFoundation.errors.PRODUCTION_LINE_AGGREGATE_CONFLICT');
      toast.error(translated);
    }
  };

  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const releaseResource = async () => {
    if (!id || !['workstations', 'production-lines'].includes(entity)) return;
    setReleasing(true);
    try {
      const response = await fetch(`${masterDataBaseUrl()}/${entity}/${id}/release`, { method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || t('resourceFoundation.releaseFailed'));
      await load();
      toast.success(t(entity === 'production-lines' ? 'resourceFoundation.lineReleased' : 'resourceFoundation.released'));
      setReleaseConfirmationOpen(false);
    } catch (err: any) { toast.error(err.message || t('resourceFoundation.releaseFailed')); }
    finally { setReleasing(false); }
  };
  const openMachineAction = async (target: AnyRecord, action: 'delete' | 'deactivate') => {
    const resourceType = entity === 'workstations' ? 'workstations' : 'machines';
    setMachineTarget({ ...target, __resourceType: resourceType }); setMachineAction(action); setMachineImpact(null); setMachineActionOpen(true); setMachineActionLoading(true);
    try {
      const response = await fetch(`${masterDataBaseUrl()}/${resourceType}/${target.master_id}/dependencies`, { headers: authHeaders(user) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || t('resourceFoundation.loadFailed'));
      const data = payload.data || {};
      setMachineImpact({ referenced: Boolean(data.requirements?.length || data.groups?.length || data.machine_groups?.length || data.assignments?.length || data.capabilities?.length || data.calendars?.length || data.production_standards?.length || data.machine_units?.length || data.compositions?.length || data.skills?.length), machine_units: data.machine_units?.length || 0, workstation_requirements: data.requirements?.length || 0, machine_groups: (data.machine_groups || data.groups || []).length, resource_assignments: data.assignments?.length || 0, capabilities: data.capabilities?.length || 0, calendars: data.calendars?.length || 0, production_standards: data.production_standards?.length || 0, compositions: data.compositions?.length || 0, skills: data.skills?.length || 0 });
    } catch (err: any) { toast.error(err.message); setMachineActionOpen(false); } finally { setMachineActionLoading(false); }
  };
  const closeMachineAction = () => { setMachineActionOpen(false); setMachineTarget(null); setMachineImpact(null); setMachineAction(null); };
  const confirmMachineAction = async () => {
    if (!machineTarget || !machineAction) return;
    try {
      const resourceType = machineTarget.__resourceType || 'machines';
      if (machineAction === 'delete') await deleteResource(resourceType, machineTarget.master_id, user);
      else await putResource(resourceType, machineTarget.master_id, { lifecycle_status: 'Inactive' }, user);
      toast.success(t('resourceFoundation.saved')); closeMachineAction(); setMachineConfirmationOpen(false); await load();
    } catch (err: any) { toast.error(err.message); }
  };
  const requestMachineConfirmation = () => { setMachineConfirmationKind(machineAction === 'deactivate' ? 'deactivate' : 'delete'); setMachineConfirmationOpen(true); };
  const confirmMachineEdit = async () => {
    confirmedMachineSave.current = true; setMachineConfirmationOpen(false);
    await save({ preventDefault: () => undefined } as React.FormEvent);
  };
  const resourceTitle = t(labels[entity]);
  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;
  if (formMode) return <><ResourceForm entity={entity} title={resourceTitle} form={form} set={set} setMany={(changes: AnyRecord) => setForm((current) => ({ ...current, ...changes }))} save={save} sites={sites} areas={areas} shopfloors={shopfloors} workCenters={workCenters} workstations={workstations} equipment={equipment} machineGroups={machineGroups} machineUnitsByEquipment={machineUnitsByEquipment} operations={operations} setOperations={setOperations} skills={skills} text={text} t={t} id={id} user={user} loading={loading} formSectionsLoading={formSectionsLoading} /><Confirmation open={machineConfirmationOpen && machineConfirmationKind === 'edit'} title={t(entity === 'workstations' ? 'resourceFoundation.confirmEditWorkstation' : 'resourceFoundation.confirmEditMachine')} description={t(entity === 'workstations' ? 'resourceFoundation.editWorkstationImpactConfirm' : 'resourceFoundation.editImpactConfirm')} confirmLabel={t('common.save')} cancelLabel={t('common.cancel')} onClose={() => setMachineConfirmationOpen(false)} onConfirm={() => void confirmMachineEdit()} /></>;
  if (detailMode && detail) return <><ResourceDetail entity={entity} row={detail} text={text} t={t} user={user} workCenterCatalog={workCenters} workstationCatalog={workstations} resourceAssignments={resourceAssignments} onReload={load} onBack={() => navigate(`/master-data/${entity}`)} onRelease={() => setReleaseConfirmationOpen(true)} releasing={releasing} /><Confirmation open={releaseConfirmationOpen} title={t(entity === 'production-lines' ? 'resourceFoundation.releaseLine' : 'resourceFoundation.release')} description={t(entity === 'production-lines' ? 'resourceFoundation.releaseLineConfirm' : 'resourceFoundation.releaseConfirm')} confirmLabel={t(entity === 'production-lines' ? 'resourceFoundation.releaseLine' : 'resourceFoundation.release')} cancelLabel={t('common.cancel')} onClose={() => setReleaseConfirmationOpen(false)} onConfirm={() => void releaseResource()} /></>;
  const workstationAction = machineTarget?.__resourceType === 'workstations';
  const actionLabel = (kind: 'delete' | 'deactivate') => workstationAction ? t(kind === 'delete' ? 'resourceFoundation.deleteWorkstation' : 'resourceFoundation.deactivateWorkstation') : t(kind === 'delete' ? 'resourceFoundation.deleteMachine' : 'resourceFoundation.deactivateMachine');
  return <><ResourceList entity={entity} title={resourceTitle} rows={rows} loading={loading} text={text} t={t} sites={sites} areas={areas} shopfloors={shopfloors} workCenters={workCenters} workstations={workstations} equipment={equipment} onRefresh={load} onCreate={() => navigate(`/master-data/${entity}/new`)} onOpen={(row: AnyRecord) => entity === 'resource-assignments' ? undefined : navigate(`/master-data/${entity}/${row.master_id}`)} onEdit={(row: AnyRecord) => navigate(`/master-data/${entity}/${row.master_id}/edit`)} onDelete={(row: AnyRecord) => void openMachineAction(row, 'delete')} />
    <Modal open={machineActionOpen} title={actionLabel(machineAction === 'delete' ? 'delete' : 'deactivate')} onClose={closeMachineAction} footerLeft={<Button type="button" variant="outline" onClick={closeMachineAction}>{t('common.cancel')}</Button>} footer={machineAction === 'delete' && machineImpact?.referenced ? <Button type="button" onClick={() => setMachineAction('deactivate')}>{actionLabel('deactivate')}</Button> : <Button type="button" variant={machineAction === 'delete' ? 'destructive' : 'default'} disabled={machineActionLoading || (machineAction === 'delete' && machineImpact?.referenced)} onClick={requestMachineConfirmation}>{actionLabel(machineAction === 'delete' ? 'delete' : 'deactivate')}</Button>} className="max-w-xl">
      <div className="space-y-4"><div className="rounded border border-border bg-muted/30 p-3"><div className="font-semibold">{machineTarget ? text(machineTarget.name) : '-'}</div><div className="font-mono text-xs text-muted-foreground">{machineTarget?.code}</div></div>{machineActionLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : <><p className="text-sm text-muted-foreground">{machineAction === 'delete' && machineImpact?.referenced ? t(workstationAction ? 'resourceFoundation.deleteWorkstationBlocked' : 'resourceFoundation.deleteBlocked') : t(workstationAction ? 'resourceFoundation.deleteWorkstationConfirm' : 'resourceFoundation.deleteConfirm')}</p><div className="grid gap-2 text-sm sm:grid-cols-2">{(workstationAction ? [['machine_groups', t('resourceFoundation.machineGroups')], ['workstation_requirements', t('resourceFoundation.workstationRequirements')], ['resource_assignments', t('resourceFoundation.assignments')], ['capabilities', t('resourceFoundation.supportedOperations')], ['calendars', t('resourceFoundation.machineCalendars')], ['compositions', t('resourceFoundation.compositions')], ['skills', t('skills.resourceSkills')]] : [['machine_units', t('resourceFoundation.machineUnits')], ['workstation_requirements', t('resourceFoundation.workstationRequirements')], ['machine_groups', t('resourceFoundation.machineGroups')], ['resource_assignments', t('resourceFoundation.assignments')], ['capabilities', t('resourceFoundation.machineCapabilities')], ['calendars', t('resourceFoundation.machineCalendars')], ['production_standards', t('resourceFoundation.machineProductionStandards')]]).map(([key, label]) => <div key={String(key)} className="flex justify-between rounded border border-border px-3 py-2"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{machineImpact?.[key] || 0}</span></div>)}</div></>}</div>
    </Modal><Confirmation open={machineConfirmationOpen} title={machineConfirmationKind === 'edit' ? t(machineTarget?.__resourceType === 'workstations' ? 'resourceFoundation.confirmEditWorkstation' : 'resourceFoundation.confirmEditMachine') : actionLabel(machineConfirmationKind === 'delete' ? 'delete' : 'deactivate')} description={machineConfirmationKind === 'edit' ? t(machineTarget?.__resourceType === 'workstations' ? 'resourceFoundation.editWorkstationImpactConfirm' : 'resourceFoundation.editImpactConfirm') : machineConfirmationKind === 'delete' ? t(machineTarget?.__resourceType === 'workstations' ? 'resourceFoundation.deleteWorkstationConfirm' : 'resourceFoundation.deleteConfirm') : t(machineTarget?.__resourceType === 'workstations' ? 'resourceFoundation.deactivateWorkstationConfirm' : 'resourceFoundation.deactivateConfirm')} confirmLabel={machineConfirmationKind === 'edit' ? t('common.save') : actionLabel(machineConfirmationKind === 'delete' ? 'delete' : 'deactivate')} cancelLabel={t('common.cancel')} destructive={machineConfirmationKind !== 'edit'} onClose={() => setMachineConfirmationOpen(false)} onConfirm={() => void (machineConfirmationKind === 'edit' ? confirmMachineEdit() : confirmMachineAction())} /></>;
}

function ResourceForm({ entity, title, form, set, setMany, save, sites, areas, shopfloors, workCenters, workstations, equipment, machineGroups, machineUnitsByEquipment, operations, setOperations, skills, text, t, id, user, loading, formSectionsLoading }: AnyRecord) {
  const [machineUnits, setMachineUnits] = useState<AnyRecord[]>([]);
  useEffect(() => {
    if (entity !== 'resource-assignments' || !form.equipment_id) { setMachineUnits([]); return; }
    let cancelled = false;
    fetch(`${masterDataBaseUrl()}/machines/${form.equipment_id}/units`, { headers: authHeaders(user), cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { data: [] })
      .then((payload) => { if (!cancelled) setMachineUnits(payload.data || []); })
      .catch(() => { if (!cancelled) setMachineUnits([]); });
    return () => { cancelled = true; };
  }, [entity, form.equipment_id, user]);
  const siteOptions = sites.map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const areaOptions = areas.map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const shopfloorOptions = shopfloors.map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const activeHierarchyRecord = (row: AnyRecord) => row.active_flag !== false && !['Inactive', 'Obsolete'].includes(String(row.lifecycle_status));
  const productionLineSiteOptions = sites.filter(activeHierarchyRecord).map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const productionLineShopfloorOptions = shopfloors.filter((shopfloor: AnyRecord) => activeHierarchyRecord(shopfloor) && shopfloor.site_id === form.site_id).map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const productionLineAreaOptions = areas.filter((area: AnyRecord) => activeHierarchyRecord(area) && area.site_id === form.site_id).map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const wcOptions = workCenters.map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const wsOptions = workstations.map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const selectedLineWorkCenters = Array.isArray(form.line_work_centers) ? form.line_work_centers : [];
  const selectedLineWorkstationIds = Array.isArray(form.line_workstation_ids) ? form.line_workstation_ids : [];
  const selectedLineWorkCenterIds = new Set(selectedLineWorkCenters.map((item: AnyRecord) => String(item.work_center_id)));
  const availableLineWorkCenters = workCenters.filter((row: AnyRecord) => activeHierarchyRecord(row) && row.site_id === form.site_id && row.area_id === form.area_id && !selectedLineWorkCenterIds.has(String(row.master_id)));
  const selectedLineWorkstationSet = new Set(selectedLineWorkstationIds.map((value: unknown) => String(value)));
  const availableLineWorkstations = workstations.filter((row: AnyRecord) => activeHierarchyRecord(row) && selectedLineWorkCenterIds.has(String(row.work_center_id)) && !selectedLineWorkstationSet.has(String(row.master_id)));
  const eqOptions = equipment.map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }));
  const machineGroupOptions = machineGroups.filter((group: AnyRecord) => !form.workstation_id || group.workstation_id === form.workstation_id).map((group: AnyRecord) => ({ value: group.master_id, label: optionLabel(text, group) }));
  const factoryEntity = entity === 'factories';
  const machineEntity = entity === 'equipment' || entity === 'machines';
  const workstationLoading = entity === 'workstations' && Object.values(formSectionsLoading || {}).some(Boolean);
  return <form data-testid={machineEntity ? 'machine-form' : entity === 'workstations' ? 'workstation-form' : undefined} onSubmit={save} className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">{id ? `${t('common.edit')} ${title}` : `${t('common.create')} ${title}`}</h1><p className="mt-1 text-sm text-muted-foreground">{t('resourceFoundation.formHelp')}</p></div></div>{workstationLoading ? <Card className="space-y-2 border-action/40 bg-surface-subtle p-4"><div className="font-semibold">{t('common.loading')}</div>{[['basic', t('resourceFoundation.basicData')], ['machineGroups', t('resourceFoundation.machineGroups')], ['skills', t('skills.resourceSkills')], ['availability', t('resourceFoundation.availableUnits')]].map(([key, label]) => <div key={String(key)} className="flex items-center justify-between text-sm"><span>{label}</span><span className="text-muted-foreground">{formSectionsLoading?.[key] ? t('common.loading') : t('resourceFoundation.hydrationReady')}</span></div>)}</Card> : null}<Card className="grid gap-4 p-5 md:grid-cols-2">
    <LocalizedTextInput data-testid={machineEntity ? 'machine-name-input' : entity === 'workstations' ? 'workstation-name-input' : entity === 'resource-assignments' ? 'resource-assignment-name-input' : undefined} label={t('common.name')} required value={form.name || {}} onChange={(value: any) => set('name', value)} />
    {['factories', 'shopfloors', 'production-areas', 'production-lines', 'work-centers', 'workstations', 'equipment', 'machines'].includes(entity) ? <GeneratedCodeField label={t('common.code')} value={form.code} helper={t('resourceFoundation.codePreviewHelp')} /> : null}
    {entity === 'shopfloors' ? <label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.factories')}</span><SelectBase value={form.site_id} onValueChange={(value) => set('site_id', value)} options={siteOptions} placeholder={t('resourceFoundation.factories')} required /></label> : null}
    {entity === 'factories' ? <><Field label={t('resourceFoundation.timezone')} value={form.timezone || 'Asia/Ho_Chi_Minh'} onChange={(value) => set('timezone', value)} required /><StatusSwitchField label={t('common.active')} checked={form.lifecycle_status !== 'Inactive'} onCheckedChange={(checked) => set('lifecycle_status', checked ? 'Released' : 'Inactive')} activeLabel={t('common.active')} inactiveLabel={t('common.inactive')} /></> : null}
    {entity === 'production-areas' ? <label className="block space-y-1"><span className="text-sm font-medium">{t('common.site')}</span><SelectBase value={form.site_id} onValueChange={(value) => set('site_id', value)} options={siteOptions} placeholder={t('common.site')} required /></label> : null}
    {entity === 'production-areas' ? <><Field label={t('resourceFoundation.areaType')} value={form.area_type || 'Workshop'} onChange={(value) => set('area_type', value)} /><Field label={t('resourceFoundation.sequence')} type="number" value={form.sequence_no ?? 0} onChange={(value) => set('sequence_no', value)} /><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.parentArea')}</span><SelectBase value={form.parent_area_id} onValueChange={(value) => set('parent_area_id', value)} options={[{ value: '', label: t('common.none') }, ...areaOptions]} placeholder={t('resourceFoundation.parentArea')} /></label></> : null}
    {entity === 'production-lines' ? <>
      <label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.factories')} *</span><SelectBase data-testid="production-line-factory-select" value={form.site_id} onValueChange={(value) => setMany({ site_id: value, shopfloor_id: '', area_id: '' })} options={productionLineSiteOptions} placeholder={t('resourceFoundation.selectFactoryFirst')} required /></label>
      <label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.shopfloors')} *</span><SelectBase data-testid="production-line-shopfloor-select" value={form.shopfloor_id} onValueChange={(value) => setMany({ shopfloor_id: value, area_id: '' })} options={productionLineShopfloorOptions} placeholder={form.site_id ? t('resourceFoundation.shopfloors') : t('resourceFoundation.selectFactoryFirst')} disabled={!form.site_id} required /></label>
      <label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.area')} *</span><SelectBase data-testid="production-line-area-select" value={form.area_id} onValueChange={(value) => set('area_id', value)} options={productionLineAreaOptions} placeholder={form.shopfloor_id ? t('resourceFoundation.area') : t('resourceFoundation.selectShopfloorFirst')} disabled={!form.site_id || !form.shopfloor_id} required /></label>
      <label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.lineType')} *</span><SelectBase data-testid="production-line-type-select" value={form.line_type || 'Production'} onValueChange={(value) => set('line_type', value)} options={PRODUCTION_LINE_TYPES.map((value) => ({ value, label: t(`resourceFoundation.lineType.${value}`) }))} placeholder={t('resourceFoundation.lineType')} required /></label>
      <p className="text-xs text-muted-foreground md:col-span-2">{t('resourceFoundation.productionLineHierarchyHelp')}</p>
      {!id ? <div className="md:col-span-2 rounded-md border border-action/30 bg-action/5 p-4" aria-label={t('resourceFoundation.workstations')}>
        <div className="flex items-start gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action text-sm font-bold text-action-foreground">1</div><div><h2 className="font-semibold">{t('nav.workCenters')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('resourceFoundation.workCenterCoverageHelp')}</p></div></div>
        <div className="mt-4 flex items-start gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-action text-sm font-bold text-action">2</div><div><h2 className="font-semibold">{t('resourceFoundation.workstations')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('workCenters.workstationsHelp')}</p></div></div>
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{t('resourceFoundation.noResourceScope')}</p>
      </div> : null}
      {!id ? <div className="space-y-4 md:col-span-2 rounded-md border border-border bg-surface-subtle p-4" data-testid="production-line-resource-config"><div><h2 className="font-semibold">{t('resourceFoundation.workstations')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('resourceFoundation.workCenterCoverageHelp')}</p></div><div className="flex flex-col gap-2 sm:flex-row"><SelectBase data-testid="production-line-create-work-center-select" value="" onValueChange={(value) => { const row = workCenters.find((item: AnyRecord) => item.master_id === value); if (row) setMany({ line_work_centers: [...selectedLineWorkCenters, { work_center_id: row.master_id, work_center_code: row.code, work_center_name: row.name, sequence_no: selectedLineWorkCenters.length + 1, mandatory_flag: true }] }); }} options={availableLineWorkCenters.map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row) }))} placeholder={t('resourceFoundation.selectWorkCenter')} disabled={!form.site_id || !form.area_id} /><span className="self-center text-xs text-muted-foreground">{selectedLineWorkCenters.length} {t('resourceFoundation.workCentersTab')}</span></div>{selectedLineWorkCenters.length ? <div className="space-y-2">{selectedLineWorkCenters.map((row: AnyRecord, index: number) => <div key={row.work_center_id} className="flex items-center gap-3 rounded border border-border bg-background p-3"><div className="min-w-0 flex-1"><div className="font-semibold">{text(row.work_center_name) || row.work_center_code}</div><div className="font-mono text-xs text-muted-foreground">{row.work_center_code}</div></div><span className="text-xs text-muted-foreground">#{index + 1}</span><Button type="button" size="icon" variant="ghost" title={t('common.remove')} onClick={() => { const workCenterId = String(row.work_center_id); setMany({ line_work_centers: selectedLineWorkCenters.filter((item: AnyRecord) => String(item.work_center_id) !== workCenterId), line_workstation_ids: selectedLineWorkstationIds.filter((workstationId: string) => String(workstations.find((item: AnyRecord) => item.master_id === workstationId)?.work_center_id) !== workCenterId) }); }}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">{t('resourceFoundation.noWorkCenterCoverage')}</div>}<div className="flex flex-col gap-2 sm:flex-row"><SelectBase data-testid="production-line-create-workstation-select" value="" onValueChange={(value) => set('line_workstation_ids', [...selectedLineWorkstationIds, value])} options={availableLineWorkstations.map((row: AnyRecord) => ({ value: row.master_id, label: optionLabel(text, row), secondaryLabel: row.code }))} placeholder={t('resourceFoundation.workstations')} disabled={!selectedLineWorkCenters.length} /><span className="self-center text-xs text-muted-foreground">{selectedLineWorkstationIds.length} {t('resourceFoundation.workstations')}</span></div>{selectedLineWorkstationIds.length ? <div className="space-y-2">{selectedLineWorkstationIds.map((workstationId: string) => { const row = workstations.find((item: AnyRecord) => item.master_id === workstationId); return <div key={workstationId} className="flex items-center gap-3 rounded border border-border bg-background p-3"><div className="min-w-0 flex-1"><div className="font-semibold">{row ? text(row.name) || row.code : workstationId}</div><div className="font-mono text-xs text-muted-foreground">{row?.code || workstationId}</div><div className="text-xs text-muted-foreground">{row?.work_center_code || ''}</div></div><Button type="button" size="icon" variant="ghost" title={t('common.remove')} onClick={() => set('line_workstation_ids', selectedLineWorkstationIds.filter((value: string) => value !== workstationId))}><Trash2 className="h-4 w-4" /></Button></div>; })}</div> : <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">{t('resourceFoundation.noResourceScope')}</div>}</div> : null}
    </> : null}
    {entity === 'work-centers' ? <><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.shopfloors')}</span><SelectBase value={form.shopfloor_id} onValueChange={(value) => set('shopfloor_id', value)} options={shopfloorOptions} placeholder={t('resourceFoundation.shopfloors')} required /></label><ResourceHierarchyContext label={t('resourceFoundation.hierarchyLabel')} factory={text(sites.find((s: AnyRecord) => s.master_id === workCenters.find((w: AnyRecord) => w.master_id === form.master_id)?.site_id)?.name)} shopfloor={text(shopfloors.find((s: AnyRecord) => s.master_id === form.shopfloor_id)?.name)} /></> : null}
    {entity === 'workstations' ? <><label className="block space-y-1"><span className="text-sm font-medium">{t('nav.workCenters')}</span><SelectBase data-testid="workstation-work-center-select" value={form.work_center_id} onValueChange={(value) => set('work_center_id', value)} options={wcOptions} placeholder={t('nav.workCenters')} required /></label><ResourceHierarchyContext label={t('resourceFoundation.hierarchyLabel')} factory={text(sites.find((s: AnyRecord) => s.master_id === workCenters.find((w: AnyRecord) => w.master_id === form.work_center_id)?.site_id)?.name)} shopfloor={text(shopfloors.find((s: AnyRecord) => s.master_id === form.work_center_id)?.name)} workCenter={text(workCenters.find((w: AnyRecord) => w.master_id === form.work_center_id)?.name)} /><MachineRequirementSerialEditor groups={form.machine_groups || []} setGroups={(groups: AnyRecord[]) => set('machine_groups', groups)} machines={equipment} unitsByEquipment={machineUnitsByEquipment} currentWorkstationId={id} text={text} t={t} />{id ? <><AssignedMachinesPanel assignments={form.assignments || []} text={text} t={t} /><WorkstationReadinessSummary row={form} text={text} t={t} /><AssignmentHistoryPanel assignments={form.assignments || []} text={text} t={t} /></> : <InitialAssignmentNotice t={t} />}</> : null}
    {entity === 'work-centers' ? <><Field label={t('resourceFoundation.resourceType')} value={form.resource_type || 'MachineGroup'} onChange={(value) => set('resource_type', value)} /><Field label={t('resourceFoundation.capacityModel')} value={form.capacity_model || 'TimeBased'} onChange={(value) => set('capacity_model', value)} /></> : null}
    {entity === 'workstations' ? <label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.executionMode')}</span><SelectBase value={form.execution_mode || 'Kiosk'} onValueChange={(value) => set('execution_mode', value)} options={['Kiosk', 'Manual', 'Automatic'].map((value) => ({ value, label: t(`resourceFoundation.executionMode.${value}`) }))} placeholder={t('resourceFoundation.executionMode')} required /></label> : null}
    {machineEntity ? <><label className="block space-y-1"><span className="text-sm font-medium">{t('common.site')} *</span><SelectBase data-testid="machine-site-select" value={form.site_id} onValueChange={(value) => set('site_id', value)} options={siteOptions} placeholder={t('common.site')} required /></label><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.workCenter')}</span><SelectBase data-testid="machine-work-center-select" value={form.work_center_id} onValueChange={(value) => set('work_center_id', value)} options={[{ value: '', label: t('common.none') }, ...wcOptions]} placeholder={t('common.none')} /></label><LocalizedTextInput label={t('resourceFoundation.description')} value={form.description || {}} onChange={(value: any) => set('description', value)} /><Field testId="machine-type-input" label={t('resourceFoundation.equipmentType')} value={form.equipment_type} onChange={(value) => set('equipment_type', value)} required /><Field label={t('resourceFoundation.manufacturer')} value={form.manufacturer} onChange={(value) => set('manufacturer', value)} /><Field label={t('resourceFoundation.model')} value={form.model} onChange={(value) => set('model', value)} /><Field testId="machine-expected-unit-count-input" label={t('resourceFoundation.expectedUnitCount')} type="number" value={form.expected_unit_count ?? form.quantity ?? 0} onChange={(value) => set('expected_unit_count', value)} required /><p className="text-xs text-muted-foreground md:col-span-2">{t('resourceFoundation.expectedUnitCountHelp')}</p><Field label={t('resourceFoundation.efficiency')} type="number" value={form.default_efficiency ?? 1} onChange={(value) => set('default_efficiency', value)} /><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.catalogLifecycle')}</span><SelectBase value={form.lifecycle_status || 'Draft'} onValueChange={(value) => set('lifecycle_status', value)} options={['Draft', 'Released', 'Inactive', 'Obsolete'].map((value) => ({ value, label: t(`status.lifecycle.${value}`) }))} placeholder={t('resourceFoundation.catalogLifecycle')} required /></label><StatusSwitchField label={t('resourceFoundation.planningPolicy')} checked={form.planning_resource_flag === true} onCheckedChange={(checked) => set('planning_resource_flag', checked)} activeLabel={t('common.active')} inactiveLabel={t('common.inactive')} /></> : null}
    {['machines', 'equipment', 'workstations', 'work-centers'].includes(entity) ? <ResourceSkillSelector scope={machineEntity ? 'Machine' : entity === 'workstations' ? 'Workstation' : 'WorkCenter'} skills={skills} selected={form.skill_ids || []} onChange={(value) => set('skill_ids', value)} text={text} t={t} /> : null}
    {entity === 'resource-assignments' ? <><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.workstation')}</span><SelectBase data-testid="resource-assignment-workstation-select" value={form.workstation_id} onValueChange={(value) => { set('workstation_id', value); set('site_id', workstations.find((row: AnyRecord) => row.master_id === value)?.site_id); set('work_center_id', workstations.find((row: AnyRecord) => row.master_id === value)?.work_center_id); }} options={wsOptions} placeholder={t('resourceFoundation.workstation')} required /></label><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.machineGroups')}</span><SelectBase value={form.machine_group_id} onValueChange={(value) => set('machine_group_id', value)} options={[{ value: '', label: t('common.none') }, ...machineGroupOptions]} placeholder={t('common.none')} /></label><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.equipment')}</span><SelectBase data-testid="resource-assignment-equipment-select" value={form.equipment_id} onValueChange={(value) => { set('equipment_id', value); set('machine_unit_id', ''); }} options={[{ value: '', label: t('common.none') }, ...eqOptions]} placeholder={t('common.none')} /></label><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.machineUnits')}</span><SelectBase data-testid="resource-assignment-machine-unit-select" value={form.machine_unit_id} onValueChange={(value) => set('machine_unit_id', value)} options={[{ value: '', label: t('common.none') }, ...machineUnits.filter((unit: AnyRecord) => unit.can_assign !== false && unit.execution_status === 'Available').map((unit: AnyRecord) => ({ value: unit.machine_unit_id, label: <span><span className="font-semibold">{unit.code}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{unit.serial_number || t('resourceFoundation.pendingIdentification')}</span></span> }))]} placeholder={t('common.none')} disabled={!form.equipment_id} /></label><Field label={t('resourceFoundation.assignmentRole')} value={form.assignment_role || 'Primary'} onChange={(value) => set('assignment_role', value)} required /><Field label={t('resourceFoundation.effectiveFrom')} type="datetime-local" value={form.effective_from?.slice(0, 16)} onChange={(value) => set('effective_from', value)} required /><Field label={t('resourceFoundation.effectiveTo')} type="datetime-local" value={form.effective_to?.slice(0, 16)} onChange={(value) => set('effective_to', value)} /></> : null}
    {!factoryEntity && entity !== 'resource-assignments' && !machineEntity ? <StatusSwitchField label={t('common.active')} checked={form.active_flag !== false} onCheckedChange={(checked) => set('active_flag', checked)} activeLabel={t('common.active')} inactiveLabel={t('common.inactive')} /> : null}
  </Card><div className="flex justify-end gap-2"><Link to={`/master-data/${entity}`}><Button type="button" variant="outline"><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button></Link><Button data-testid={machineEntity ? 'machine-save-button' : undefined} type="submit" disabled={loading || workstationLoading}><Save className="h-4 w-4" />{t('common.save')}</Button></div></form>;
}

function WorkstationOperationEditor({ operations, setOperations, capabilities, setCapabilities, text, t, user }: { operations: AnyRecord[]; setOperations: (value: AnyRecord[]) => void; capabilities: AnyRecord[]; setCapabilities: (value: AnyRecord[]) => void; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string; user: AnyRecord }) {
  const options = operations.map((operation) => ({ value: operation.master_id, label: <span><span className="font-semibold">{text(operation.name) || operation.code}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{operation.code}</span></span> }));
  const [createOpen, setCreateOpen] = useState(false); const [createIndex, setCreateIndex] = useState<number | null>(null); const [createForm, setCreateForm] = useState<AnyRecord>({ name: { vi: '' }, description: { vi: '' }, operation_type: 'Production', confirmation_mode: 'StartFinish', quantity_reporting: 'GoodOnly', requires_material_scan: false, requires_output_label: false, allow_partial_completion: false, is_schedulable: true }); const [saving, setSaving] = useState(false);
  const resetCreate = () => { setCreateOpen(false); setCreateIndex(null); setCreateForm({ name: { vi: '' }, description: { vi: '' }, operation_type: 'Production', confirmation_mode: 'StartFinish', quantity_reporting: 'GoodOnly', requires_material_scan: false, requires_output_label: false, allow_partial_completion: false, is_schedulable: true }); };
  const createOperation = async () => { try { setSaving(true); const reservation = await fetch(`${masterDataBaseUrl()}/business-codes/reservations`, { method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: 'Operation' }) }); const reservationPayload = await reservation.json(); if (!reservation.ok) throw new Error(reservationPayload.message || reservationPayload.error); const createdResponse = await postResource('operations', { ...createForm, code_reservation_id: reservationPayload.data?.reservation_id }, user); const created = createdResponse.data || createdResponse; const nextCapability = { operation_id: created.master_id, cycle_time_sec: '', setup_time_min: 0, base_quantity: 1, efficiency_factor: 1 }; setOperations([...operations, created]); setCapabilities(createIndex === null ? [...capabilities, nextCapability] : capabilities.map((item, itemIndex) => itemIndex === createIndex ? { ...item, ...nextCapability } : item)); resetCreate(); } catch (err: any) { toast.error(err.message); } finally { setSaving(false); } };
  return <Card className="space-y-4 border-action/40 bg-surface-subtle p-4 md:col-span-2"><div><div className="flex items-center gap-2"><h2 className="font-bold text-foreground">{t('resourceFoundation.supportedOperations')}</h2><FieldHelpPopover label={t('resourceFoundation.supportedOperationHelpTitle')} title={t('resourceFoundation.supportedOperationHelpTitle')} content={t('resourceFoundation.supportedOperationHelp')} /></div><p className="text-xs text-muted-foreground">{t('resourceFoundation.supportedOperationsHelp')}</p></div>{capabilities.map((capability, index) => <div key={capability.capability_id || index} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_150px_150px_150px_40px]">
    <SelectBase label={<span className="flex items-center gap-1">{t('resourceFoundation.operation')}<FieldHelpPopover label={t('resourceFoundation.supportedOperationHelpTitle')} title={t('resourceFoundation.supportedOperationHelpTitle')} content={t('resourceFoundation.supportedOperationHelp')} /></span>} value={capability.operation_id} onValueChange={(value) => value === '__create_operation__' ? (setCreateIndex(index), setCreateOpen(true)) : setCapabilities(capabilities.map((item, itemIndex) => itemIndex === index ? { ...item, operation_id: value } : item))} options={[...options, { value: '__create_operation__', label: t('operationCatalog.createInline') }]} placeholder={t('resourceFoundation.operation')} required />
    <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-medium text-foreground">{t('resourceFoundation.cycleTime')}<FieldHelpPopover label={t('resourceFoundation.cycleTimeHelpTitle')} title={t('resourceFoundation.cycleTimeHelpTitle')} content={t('resourceFoundation.cycleTimeHelp')} /></span><Input type="number" min={0.001} step={0.001} value={capability.cycle_time_sec || ''} aria-label={t('resourceFoundation.cycleTime')} placeholder={t('resourceFoundation.cycleTime')} onChange={(event) => setCapabilities(capabilities.map((item, itemIndex) => itemIndex === index ? { ...item, cycle_time_sec: event.target.value } : item))} /></label>
    <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-medium text-foreground">{t('resourceFoundation.setupTime')}<FieldHelpPopover label={t('resourceFoundation.setupTimeHelpTitle')} title={t('resourceFoundation.setupTimeHelpTitle')} content={t('resourceFoundation.setupTimeHelp')} /></span><Input type="number" min={0} step={0.001} value={capability.setup_time_min || 0} aria-label={t('resourceFoundation.setupTime')} placeholder={t('resourceFoundation.setupTime')} onChange={(event) => setCapabilities(capabilities.map((item, itemIndex) => itemIndex === index ? { ...item, setup_time_min: event.target.value } : item))} /></label>
    <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-medium text-foreground">{t('resourceFoundation.baseQuantity')}<FieldHelpPopover label={t('resourceFoundation.referenceQuantityHelpTitle')} title={t('resourceFoundation.referenceQuantityHelpTitle')} content={t('resourceFoundation.referenceQuantityHelp')} /></span><Input type="number" min={1} step={0.001} value={capability.base_quantity || 1} aria-label={t('resourceFoundation.baseQuantity')} placeholder={t('resourceFoundation.baseQuantity')} onChange={(event) => setCapabilities(capabilities.map((item, itemIndex) => itemIndex === index ? { ...item, base_quantity: event.target.value } : item))} /></label>
    <div className="flex items-end justify-end"><Button type="button" variant="ghost" size="icon" title={t('common.remove')} aria-label={t('common.remove')} onClick={() => setCapabilities(capabilities.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>
  </div>)}<Button type="button" variant="outline" onClick={() => setCapabilities([...capabilities, { operation_id: '', cycle_time_sec: '', setup_time_min: 0, base_quantity: 1, efficiency_factor: 1 }])}><Plus className="h-4 w-4" />{t('resourceFoundation.addOperation')}</Button><Modal open={createOpen} title={t('operationCatalog.createInline')} onClose={resetCreate} footerLeft={<Button type="button" variant="outline" onClick={resetCreate}>{t('common.cancel')}</Button>} footer={<Button type="button" disabled={saving} onClick={() => void createOperation()}><Save className="h-4 w-4" />{t('common.save')}</Button>}><div className="space-y-3"><LocalizedTextInput label={t('operationCatalog.name')} required value={createForm.name} onChange={(value: any) => setCreateForm((current) => ({ ...current, name: value }))} /><LocalizedTextInput label={t('operationCatalog.description')} value={createForm.description} onChange={(value: any) => setCreateForm((current) => ({ ...current, description: value }))} /><SelectBase label={t('operationCatalog.type')} value={createForm.operation_type} onValueChange={(value) => setCreateForm((current) => ({ ...current, operation_type: value }))} options={['Production', 'Inspection', 'Packing', 'Handling'].map((value) => ({ value, label: t(`operationCatalog.type.${value}`) }))} /><SelectBase label={t('operationCatalog.confirmationMode')} value={createForm.confirmation_mode} onValueChange={(value) => setCreateForm((current) => ({ ...current, confirmation_mode: value }))} options={['StartFinish', 'QuantityOnly', 'Auto'].map((value) => ({ value, label: t(`operationCatalog.confirmation.${value}`) }))} /><SelectBase label={t('operationCatalog.quantityReporting')} value={createForm.quantity_reporting} onValueChange={(value) => setCreateForm((current) => ({ ...current, quantity_reporting: value }))} options={['GoodOnly', 'GoodScrap'].map((value) => ({ value, label: t(`operationCatalog.quantity.${value}`) }))} /></div></Modal></Card>;
}

function ResourceSkillSelector({ scope, skills, selected, onChange, text, t }: { scope: string; skills: AnyRecord[]; selected: string[]; onChange: (value: string[]) => void; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const scoped = skills.filter((skill) => (skill.scope || skill.scope_type) === scope);
  return <Card className="space-y-3 border-action/40 bg-surface-subtle p-4 md:col-span-2"><div><h2 className="font-bold">{t('skills.resourceSkills')}</h2><p className="text-xs text-muted-foreground">{t('skills.resourceSkillsHelp')}</p></div><div className="grid gap-2 sm:grid-cols-2">{scoped.map((skill) => <label key={skill.master_id} className="flex items-center gap-2 rounded border border-border bg-background p-2 text-sm"><input data-testid={`machine-skill-${skill.master_id}`} type="checkbox" checked={selected.includes(skill.master_id)} onChange={(event) => onChange(event.target.checked ? [...selected, skill.master_id] : selected.filter((id) => id !== skill.master_id))} /><span className="min-w-0 flex-1">{text(skill.name) || skill.code}</span><span className="font-mono text-xs text-muted-foreground">{skill.code}</span></label>)}</div></Card>;
}

function MachineRequirementSerialEditor({ groups, setGroups, machines, unitsByEquipment, currentWorkstationId, text, t }: { groups: AnyRecord[]; setGroups: (groups: AnyRecord[]) => void; machines: AnyRecord[]; unitsByEquipment: Record<string, AnyRecord[]>; currentWorkstationId?: string; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const normalized: AnyRecord[] = groups.map((group) => ({ ...group, name: group.name || { vi: '' }, requirements: (Array.isArray(group.requirements) ? group.requirements : (group.members || []).map((member: AnyRecord) => ({ machine_id: member.machine_id || member.equipment_id, role: member.role || member.assignment_role || 'Supporting', required_quantity: 1, requirement_type: member.requirement_type || 'Required', pinned_machine_unit_ids: member.machine_unit_id ? [member.machine_unit_id] : [] }))).map((line: AnyRecord) => ({ ...line, pinned_machine_unit_ids: Array.isArray(line.pinned_machine_unit_ids) ? line.pinned_machine_unit_ids.map(String) : [] })) }));
  const update = (index: number, value: AnyRecord) => setGroups(normalized.map((group, groupIndex) => groupIndex === index ? { ...group, ...value } : group));
  const updateLine = (groupIndex: number, lineIndex: number, value: AnyRecord) => update(groupIndex, { requirements: normalized[groupIndex].requirements.map((item: AnyRecord, index: number) => index === lineIndex ? { ...item, ...value } : item) });
  const equipmentOptions = machines.map((machine) => ({ value: machine.master_id, label: text(machine.name) || machine.code, description: `${machine.code} · ${machine.available_unit_count ?? 0} ${t('resourceFoundation.availableUnits')}`, searchText: `${text(machine.name)} ${machine.code}` }));
  const selectedUnitIds = new Set(normalized.flatMap((group) => (group.requirements || []).flatMap((line: AnyRecord) => line.pinned_machine_unit_ids || [])));
  const unitsFor = (machineId: string, line: AnyRecord) => (unitsByEquipment[machineId] || []).filter((unit) => unit.active_flag !== false && unit.execution_status === 'Available' && unit.physical_identity_status === 'Identified' && unit.planning_resource_flag === true && (!unit.current_assignment_id || unit.current_workstation_id === currentWorkstationId || line.pinned_machine_unit_ids?.includes(String(unit.machine_unit_id))));
  return <Card className="space-y-4 border-action/40 bg-surface-subtle p-4 md:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-bold text-foreground">{t('resourceFoundation.machineRequirements')} *</h2><p className="text-xs text-muted-foreground">{t('resourceFoundation.machineSerialSelectionHelp')}</p></div><Button data-testid="machine-requirement-add-group" type="button" variant="outline" onClick={() => setGroups([...normalized, { name: { vi: '' }, requirements: [] }])}><Plus className="h-4 w-4" />{t('resourceFoundation.addMachineGroup')}</Button></div>{normalized.map((group, groupIndex) => <Card key={group.master_id || groupIndex} className="space-y-3 border-border bg-background p-4"><div className="flex items-start gap-3"><LocalizedTextInput data-testid={`machine-requirement-group-name-${groupIndex}`} label={t('resourceFoundation.machineGroupName')} required value={group.name} onChange={(value) => update(groupIndex, { name: value })} /><Button type="button" variant="ghost" size="icon" title={t('common.remove')} onClick={() => setGroups(normalized.filter((_, index) => index !== groupIndex))}><Trash2 className="h-4 w-4" /></Button></div><div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[800px] text-sm"><thead className="bg-surface-subtle text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{t('resourceFoundation.equipment')}</th><th className="px-3 py-2">{t('resourceFoundation.assignmentRole')}</th><th className="px-3 py-2">{t('resourceFoundation.requirementType')}</th><th className="px-3 py-2">{t('resourceFoundation.machineUnits')}</th><th className="px-3 py-2" /></tr></thead><tbody className="divide-y divide-border">{group.requirements.map((line: AnyRecord, lineIndex: number) => { const units = line.machine_id ? unitsFor(line.machine_id, line) : []; const selected = new Set((line.pinned_machine_unit_ids || []).map(String)); return <tr key={lineIndex} className="align-top"><td className="w-64 px-3 py-3"><ComboboxBase value={line.machine_id} options={equipmentOptions} onValueChange={(value) => updateLine(groupIndex, lineIndex, { machine_id: value, pinned_machine_unit_ids: [] })} placeholder={t('resourceFoundation.selectEquipment')} emptyMessage={t('common.empty')} aria-label={t('resourceFoundation.equipment')} /></td><td className="w-36 px-3 py-3"><SelectBase value={line.role || 'Supporting'} onValueChange={(value) => updateLine(groupIndex, lineIndex, { role: value })} options={[{ value: 'Primary', label: t('resourceFoundation.primary') }, { value: 'Supporting', label: t('resourceFoundation.supporting') }]} /></td><td className="w-36 px-3 py-3"><SelectBase value={line.requirement_type || 'Required'} onValueChange={(value) => updateLine(groupIndex, lineIndex, { requirement_type: value })} options={[{ value: 'Required', label: t('resourceFoundation.required') }, { value: 'Optional', label: t('resourceFoundation.optional') }]} /></td><td className="px-3 py-3"><div className="mb-2 text-xs text-muted-foreground">{line.machine_id ? `${selected.size} ${t('resourceFoundation.selectedUnits')}` : t('resourceFoundation.selectEquipmentFirst')}</div><div className="grid gap-1 sm:grid-cols-2">{units.map((unit) => { const unitId = String(unit.machine_unit_id); const checked = selected.has(unitId); const usedElsewhere = selectedUnitIds.has(unitId) && !checked; return <label key={unitId} className={`flex items-start gap-2 rounded border px-2 py-2 text-xs ${usedElsewhere ? 'opacity-50' : ''}`}><Checkbox checked={checked} disabled={usedElsewhere} onCheckedChange={(value) => { const next = [...selected].filter((id) => id !== unitId); if (value === true && !usedElsewhere) next.push(unitId); updateLine(groupIndex, lineIndex, { pinned_machine_unit_ids: next, required_quantity: next.length || 1 }); }} /><span><span className="block font-semibold">{unit.code}</span><span className="block font-mono text-muted-foreground">{unit.serial_number || t('resourceFoundation.pendingIdentification')}</span></span></label>; })}</div>{line.machine_id && !units.length ? <p className="text-xs text-amber-600">{t('resourceFoundation.noAvailableMachineUnits')}</p> : null}</td><td className="px-3 py-3"><Button type="button" variant="ghost" size="icon" title={t('common.remove')} onClick={() => update(groupIndex, { requirements: group.requirements.filter((_: AnyRecord, index: number) => index !== lineIndex) })}><Trash2 className="h-4 w-4" /></Button></td></tr>; })}</tbody></table></div><Button data-testid={`machine-requirement-add-line-${groupIndex}`} type="button" variant="outline" onClick={() => update(groupIndex, { requirements: [...group.requirements, { role: group.requirements.some((line: AnyRecord) => line.role === 'Primary') ? 'Supporting' : 'Primary', requirement_type: 'Required', required_quantity: 1, pinned_machine_unit_ids: [] }] })}><Plus className="h-4 w-4" />{t('resourceFoundation.addRequirement')}</Button></Card>)}</Card>;
}

function MachineRequirementEditor({ groups, setGroups, machines, text, t }: { groups: AnyRecord[]; setGroups: (groups: AnyRecord[]) => void; machines: AnyRecord[]; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const normalized: AnyRecord[] = groups.map((group) => ({ ...group, name: group.name || { vi: '' }, requirements: Array.isArray(group.requirements) ? group.requirements : (group.members || []).map((member: AnyRecord) => ({ machine_id: member.machine_id || member.equipment_id, role: member.role || member.assignment_role || 'Supporting', required_quantity: 1, requirement_type: member.requirement_type || 'Required' })) }));
  const usage = new Map<string, number>();
  normalized.forEach((group) => (group.requirements || []).forEach((line: AnyRecord) => { if (line.machine_id) usage.set(line.machine_id, (usage.get(line.machine_id) || 0) + Number(line.required_quantity || 1)); }));
  const capacity = (machine: AnyRecord) => Number(machine.available_unit_count ?? machine.quantity ?? 1);
  const options = (groupIndex: number, lineIndex: number) => machines.map((machine) => {
    const line = normalized[groupIndex].requirements[lineIndex];
    const usedByOtherLines = (usage.get(machine.master_id) || 0) - (line.machine_id === machine.master_id ? Number(line.required_quantity || 1) : 0);
    const duplicateInGroup = normalized[groupIndex].requirements.some((item: AnyRecord, index: number) => index !== lineIndex && item.machine_id === machine.master_id);
    return { value: machine.master_id, disabled: duplicateInGroup || usedByOtherLines + Number(line.required_quantity || 1) > capacity(machine), label: <span><span className="font-semibold">{text(machine.name) || machine.code}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{machine.code} · {Math.max(capacity(machine) - usedByOtherLines, 0)} {t('resourceFoundation.remainingUnits')}</span></span> };
  });
  const update = (index: number, value: AnyRecord) => setGroups(normalized.map((group, groupIndex) => groupIndex === index ? { ...group, ...value } : group));
  return <Card className="space-y-4 border-action/40 bg-surface-subtle p-4 md:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-bold text-foreground">{t('resourceFoundation.machineRequirements')} *</h2><p className="text-xs text-muted-foreground">{t('resourceFoundation.machineRequirementsHelp')}</p></div><Button data-testid="machine-requirement-add-group" type="button" variant="outline" onClick={() => setGroups([...normalized, { name: { vi: '' }, requirements: [] }])}><Plus className="h-4 w-4" />{t('resourceFoundation.addMachineGroup')}</Button></div>{normalized.map((group, groupIndex) => <Card key={group.master_id || groupIndex} className="space-y-3 border-border bg-background p-4"><div className="flex items-start gap-3"><LocalizedTextInput data-testid={`machine-requirement-group-name-${groupIndex}`} label={t('resourceFoundation.machineGroupName')} required value={group.name} onChange={(value) => update(groupIndex, { name: value })} /><Button type="button" variant="ghost" size="icon" title={t('common.remove')} onClick={() => setGroups(normalized.filter((_, index) => index !== groupIndex))}><Trash2 className="h-4 w-4" /></Button></div><div className="space-y-2">{group.requirements.map((line: AnyRecord, lineIndex: number) => <div key={lineIndex} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_150px_120px_40px]"><SelectBase data-testid={`machine-requirement-machine-select-${groupIndex}-${lineIndex}`} label={t('resourceFoundation.requiredEquipment')} value={line.machine_id} onValueChange={(value) => update(groupIndex, { requirements: group.requirements.map((item: AnyRecord, index: number) => index === lineIndex ? { ...item, machine_id: value } : item) })} options={options(groupIndex, lineIndex)} placeholder={t('resourceFoundation.requiredEquipment')} required /><SelectBase label={t('resourceFoundation.assignmentRole')} value={line.role || 'Supporting'} onValueChange={(value) => update(groupIndex, { requirements: group.requirements.map((item: AnyRecord, index: number) => index === lineIndex ? { ...item, role: value } : item) })} options={[{ value: 'Primary', label: t('resourceFoundation.primary') }, { value: 'Supporting', label: t('resourceFoundation.supporting') }]} /><Input type="number" min={1} value={line.required_quantity || 1} aria-label={t('resourceFoundation.requiredQuantity')} onChange={(event) => update(groupIndex, { requirements: group.requirements.map((item: AnyRecord, index: number) => index === lineIndex ? { ...item, required_quantity: Number(event.target.value) } : item) })} /><Button type="button" variant="ghost" size="icon" title={t('common.remove')} onClick={() => update(groupIndex, { requirements: group.requirements.filter((_: AnyRecord, index: number) => index !== lineIndex) })}><Trash2 className="h-4 w-4" /></Button><div className="md:col-span-4"><SelectBase label={t('resourceFoundation.requirementType')} value={line.requirement_type || 'Required'} onValueChange={(value) => update(groupIndex, { requirements: group.requirements.map((item: AnyRecord, index: number) => index === lineIndex ? { ...item, requirement_type: value } : item) })} options={[{ value: 'Required', label: t('resourceFoundation.required') }, { value: 'Optional', label: t('resourceFoundation.optional') }]} /></div></div>)}<Button data-testid={`machine-requirement-add-line-${groupIndex}`} type="button" variant="outline" onClick={() => update(groupIndex, { requirements: [...group.requirements, { role: group.requirements.some((line: AnyRecord) => line.role === 'Primary') ? 'Supporting' : 'Primary', requirement_type: 'Required', required_quantity: 1 }] })}><Plus className="h-4 w-4" />{t('resourceFoundation.addRequirement')}</Button></div></Card>)}</Card>;
}

function AssignedMachinesPanel({ assignments, text, t }: { assignments: AnyRecord[]; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const now = new Date();
  const effective = assignments.filter((assignment) => (!assignment.effective_from || new Date(assignment.effective_from) <= now) && (!assignment.effective_to || new Date(assignment.effective_to) > now));
  return <Card className="space-y-3 border-action/40 bg-surface-subtle p-4 md:col-span-2">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-foreground">{t('resourceFoundation.assignedMachines')}</h2><p className="text-xs text-muted-foreground">{t('resourceFoundation.assignedMachinesHelp')}</p></div><span className="rounded border border-border bg-background px-2 py-1 text-xs font-semibold">{effective.length}</span></div>
    {effective.length ? <div className="grid gap-2 md:grid-cols-2">{effective.map((assignment) => <div key={assignment.master_id} className="rounded-md border border-border bg-background p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{text(assignment.equipment_name) || assignment.equipment_code || t('common.notAvailable')}</div><div className="font-mono text-xs text-muted-foreground">{assignment.machine_unit_code || t('resourceFoundation.equipmentAggregate')}</div></div><StatusBadge status={assignment.execution_status || assignment.machine_execution_status || 'Unknown'} /></div><div className="mt-2 text-xs text-muted-foreground">{assignment.machine_group_code || t('common.notAvailable')} · {assignment.assignment_role || assignment.assignment_type} · {assignment.effective_from || t('common.notAvailable')}</div></div>)}</div> : <div className="rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">{t('resourceFoundation.assignedMachinesEmpty')}</div>}
  </Card>;
}

function InitialAssignmentNotice({ t }: { t: (key: string, params?: Record<string, unknown>) => string }) {
  return <Card className="space-y-2 border-dashed border-action/50 bg-surface-subtle p-4 md:col-span-2">
    <div className="font-bold text-foreground">{t('resourceFoundation.initialAssignments')}</div>
    <p className="text-sm text-muted-foreground">{t('resourceFoundation.initialAssignmentsHelp')}</p>
  </Card>;
}

function AssignmentHistoryPanel({ assignments, text, t }: { assignments: AnyRecord[]; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  return <Card className="space-y-3 border-border bg-surface-subtle p-4 md:col-span-2"><h2 className="font-bold text-foreground">{t('resourceFoundation.assignmentHistory')}</h2>{assignments.length ? <div className="space-y-2">{assignments.map((assignment) => <div key={assignment.master_id} className="rounded-md border border-border bg-background p-3"><div>{text(assignment.work_center_name) || assignment.work_center_code || t('common.notAvailable')} · {text(assignment.workstation_name) || assignment.workstation_code || t('common.notAvailable')}</div><div className="text-xs text-muted-foreground">{assignment.assignment_role || assignment.assignment_type || t('common.notAvailable')} · {assignment.effective_from || t('common.notAvailable')} → {assignment.effective_to || '∞'}</div></div>)}</div> : <div className="rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">{t('common.empty')}</div>}</Card>;
}

function WorkstationReadinessSummary({ row, text, t }: { row: AnyRecord; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const groups = Array.isArray(row.machine_groups) ? row.machine_groups : [];
  const assignments = Array.isArray(row.assignments) ? row.assignments : [];
  const now = new Date();
  const effectiveAssignments = assignments.filter((assignment: AnyRecord) => (!assignment.effective_from || new Date(assignment.effective_from) <= now) && (!assignment.effective_to || new Date(assignment.effective_to) > now));
  const availability = new Map((Array.isArray(row.machine_availability) ? row.machine_availability : []).map((item: AnyRecord) => [item.machine_id, item]));
  const groupRows = groups.map((group: AnyRecord) => {
    const requirements = Array.isArray(group.requirements) ? group.requirements : [];
    const members = Array.isArray(group.members) ? group.members : [];
    const lines = requirements.length ? requirements : members.map((member: AnyRecord) => ({ machine_id: member.machine_id || member.equipment_id, role: member.role || member.assignment_role || 'Supporting', required_quantity: member.required_quantity || 1, requirement_type: member.requirement_type || 'Required' }));
    const assigned = effectiveAssignments.filter((assignment: AnyRecord) => assignment.machine_group_id === group.master_id || assignment.machine_group_code === group.code);
    const required = lines.filter((line: AnyRecord) => line.requirement_type !== 'Optional').reduce((sum: number, line: AnyRecord) => sum + Number(line.required_quantity || 1), 0);
    const assignedQuantity = assigned.length;
    const availableQuantity = lines.reduce((sum: number, line: AnyRecord) => sum + Number(availability.get(line.machine_id)?.available_unit_count ?? 0), 0);
    const hasPrimary = lines.some((line: AnyRecord) => line.role === 'Primary') && assigned.some((assignment: AnyRecord) => (assignment.assignment_role || assignment.assignment_type) === 'Primary');
    return { group, lines, required, assignedQuantity, availableQuantity, hasPrimary };
  });
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const item of groupRows) {
    const groupName = text(item.group.name) || item.group.code || t('common.notAvailable');
    if (!item.lines.length) blockers.push(`${groupName}: ${t('resourceFoundation.machineRequirementUnsatisfied')}`);
    if (item.lines.some((line: AnyRecord) => line.role === 'Primary' && line.requirement_type !== 'Optional') && !item.hasPrimary) blockers.push(`${groupName}: ${t('resourceFoundation.primaryMachineMissing')}`);
    if (item.assignedQuantity < item.required) blockers.push(`${groupName}: ${t('resourceFoundation.machineQuantityInsufficient')}`);
    if (item.availableQuantity < item.required) blockers.push(`${groupName}: ${t('resourceFoundation.machineQuantityInsufficient')}`);
    const optional = item.lines.filter((line: AnyRecord) => line.requirement_type === 'Optional').length;
    if (optional && item.assignedQuantity < item.lines.length) warnings.push(`${groupName}: ${t('resourceFoundation.supportingMachineMissing')}`);
  }
  const status = blockers.length ? 'Blocked' : warnings.length ? 'Warning' : 'Ready';
  return <Card className="space-y-4 border-action/40 bg-surface-subtle p-5">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-foreground">{t('resourceFoundation.machineReadiness')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('resourceFoundation.machineReadinessHelp')}</p></div><StatusBadge status={status} /></div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{t('resourceFoundation.requiredQuantity')}</div><div className="mt-1 text-xl font-bold">{groupRows.reduce((sum, item) => sum + item.required, 0)}</div></div><div className="rounded-md border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{t('resourceFoundation.assignedQuantity')}</div><div className="mt-1 text-xl font-bold">{effectiveAssignments.length}</div></div><div className="rounded-md border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{t('resourceFoundation.availableQuantity')}</div><div className="mt-1 text-xl font-bold">{groupRows.reduce((sum, item) => sum + item.availableQuantity, 0)}</div></div></div>
    {groupRows.length ? <div className="space-y-2">{groupRows.map((item) => <div key={item.group.master_id || item.group.code} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm"><span className="font-semibold">{text(item.group.name) || item.group.code || t('common.notAvailable')}</span><span>{item.assignedQuantity} {t('resourceFoundation.assignedOfRequired')} {item.required} · {t('resourceFoundation.availableQuantity')}: {item.availableQuantity}</span></div>)}</div> : <div className="rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">{t('resourceFoundation.machineRequirementUnsatisfied')}</div>}
    {blockers.length ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><div className="font-semibold">{t('resourceFoundation.blockingReasons')}</div>{blockers.map((reason, index) => <div key={index}>{reason}</div>)}</div> : null}
    {warnings.length ? <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700"><div className="font-semibold">{t('resourceFoundation.warnings')}</div>{warnings.map((reason, index) => <div key={index}>{reason}</div>)}</div> : null}
  </Card>;
}

function MachineGroupsEditor({ groups, setGroups, machines, text, t }: { groups: AnyRecord[]; setGroups: (groups: AnyRecord[]) => void; machines: AnyRecord[]; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const normalized: AnyRecord[] = groups.map((group: AnyRecord) => {
    const members = Array.isArray(group.members) ? group.members : [];
    return {
      ...group,
      name: group.name || { vi: '' },
      primary_machine_id: group.primary_machine_id || members.find((member: AnyRecord) => member.role === 'Primary' || member.assignment_role === 'Primary')?.machine_id || members.find((member: AnyRecord) => member.role === 'Primary' || member.assignment_role === 'Primary')?.equipment_id || '',
      supporting_machines: group.supporting_machines || members.filter((member: AnyRecord) => member.role === 'Supporting' || member.assignment_role === 'Supporting').map((member: AnyRecord) => ({ machine_id: member.machine_id || member.equipment_id, requirement_type: member.requirement_type || 'Required' })),
      minimum_required_machines: group.minimum_required_machines || 1,
    };
  });
  const usage = new Map<string, number>();
  normalized.forEach((group) => { if (group.primary_machine_id) usage.set(group.primary_machine_id, (usage.get(group.primary_machine_id) || 0) + 1); for (const member of group.supporting_machines || []) if (member.machine_id) usage.set(member.machine_id, (usage.get(member.machine_id) || 0) + Number(member.required_quantity || 1)); });
  const capacity = (machine: AnyRecord) => Number(machine.available_unit_count ?? machine.quantity ?? 1);
  const machineOptions = (currentPrimary: string) => machines.map((machine) => { const available = capacity(machine); const used = usage.get(machine.master_id) || 0; return { value: machine.master_id, disabled: machine.master_id !== currentPrimary && used >= available, label: <span><span className="font-semibold">{text(machine.name) || machine.code}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{machine.code} · {Math.max(available - used + (machine.master_id === currentPrimary ? 1 : 0), 0)} {t('resourceFoundation.remainingUnits')}</span></span> }; });
  const update = (index: number, value: AnyRecord) => setGroups(normalized.map((group, groupIndex) => groupIndex === index ? { ...group, ...value } : group));
  return <Card className="space-y-4 border-action/40 bg-surface-subtle p-4 md:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-bold text-foreground">{t('resourceFoundation.machineGroups')} *</h2><p className="text-xs text-muted-foreground">{t('resourceFoundation.machineGroupsHelp')}</p></div><Button type="button" variant="outline" onClick={() => setGroups([...normalized, { name: { vi: '' }, supporting_machines: [], minimum_required_machines: 1, maximum_concurrent_jobs: 1 }])}><Plus className="h-4 w-4" />{t('resourceFoundation.addMachineGroup')}</Button></div>{normalized.length === 0 ? <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t('resourceFoundation.atLeastOneMachineGroup')}</div> : <div className="space-y-4">{normalized.map((group, index) => { const supportIds = new Set((group.supporting_machines || []).map((member: AnyRecord) => member.machine_id)); return <Card key={group.master_id || index} className="space-y-4 border-border bg-background p-4"><div className="flex items-start justify-between gap-3"><LocalizedTextInput label={t('resourceFoundation.machineGroupName')} required value={group.name || {}} onChange={(value) => update(index, { name: value })} /><Button type="button" variant="ghost" size="icon" title={t('common.remove')} onClick={() => setGroups(normalized.filter((_, groupIndex) => groupIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div><label className="block space-y-1"><span className="text-sm font-medium">{t('resourceFoundation.primaryMachine')} *</span><SelectBase value={group.primary_machine_id} onValueChange={(value) => update(index, { primary_machine_id: value, supporting_machines: (group.supporting_machines || []).filter((member: AnyRecord) => member.machine_id !== value) })} options={machineOptions(group.primary_machine_id)} placeholder={t('resourceFoundation.primaryMachine')} required /></label><div className="space-y-2"><div className="text-sm font-medium">{t('resourceFoundation.supportingMachines')}</div>{machines.map((machine) => { const checked = supportIds.has(machine.master_id) && machine.master_id !== group.primary_machine_id; const member = (group.supporting_machines || []).find((item: AnyRecord) => item.machine_id === machine.master_id); const unavailable = !checked && (usage.get(machine.master_id) || 0) >= capacity(machine); return <div key={machine.master_id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2"><Checkbox checked={checked} disabled={machine.master_id === group.primary_machine_id || unavailable} onCheckedChange={(value) => { const next = (group.supporting_machines || []).filter((item: AnyRecord) => item.machine_id !== machine.master_id); if (value === true && machine.master_id !== group.primary_machine_id && !unavailable) next.push({ machine_id: machine.master_id, requirement_type: 'Required' }); update(index, { supporting_machines: next }); }} /><span className="min-w-48 flex-1 text-sm">{text(machine.name) || machine.code} <span className="font-mono text-xs text-muted-foreground">{machine.code} · {Math.max(capacity(machine) - (usage.get(machine.master_id) || 0), 0)} {t('resourceFoundation.remainingUnits')}</span></span>{checked ? <SelectBase value={member?.requirement_type || 'Required'} onValueChange={(value) => update(index, { supporting_machines: (group.supporting_machines || []).map((item: AnyRecord) => item.machine_id === machine.master_id ? { ...item, requirement_type: value } : item) })} options={[{ value: 'Required', label: t('resourceFoundation.required') }, { value: 'Optional', label: t('resourceFoundation.optional') }]} /> : null}</div>; })}</div><Field label={t('resourceFoundation.minimumRequiredMachines')} type="number" value={group.minimum_required_machines} onChange={(value) => update(index, { minimum_required_machines: Number(value) })} required /></Card>; })}</div>}</Card>;
}

function ResourceList({ entity, title, rows, loading, text, t, sites, areas, workCenters, workstations, equipment, onRefresh, onCreate, onOpen, onEdit, onDelete }: AnyRecord) {
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [entity, rows.length, pageSize]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const machinePrefix = entity === 'equipment' || entity === 'machines' ? 'equipment' : '';
  const machineEntity = entity === 'machines' || entity === 'equipment';
  const productionLineEntity = entity === 'production-lines';
  const actionEntity = machineEntity || entity === 'workstations';
  const machineColumns = machineEntity ? <><th className="px-4 py-3">{t('resourceFoundation.quantity')}</th><th className="px-4 py-3">{t('resourceFoundation.availableUnits')}</th></> : null;
  const columnCount = 5 + (machineEntity ? 2 : 0) + (actionEntity ? 1 : 0);
  const columns: BaseDataTableColumn<AnyRecord>[] = [
    { id: 'identity', header: t('common.name'), cell: ({ row }) => identity(text, row.original, entity === 'work-centers' ? 'work_center' : entity === 'workstations' ? 'workstation' : machinePrefix) },
    { id: 'site', header: t('common.site'), cell: ({ row }) => row.original.site_code || '-' },
    { id: 'area', header: t('resourceFoundation.area'), cell: ({ row }) => row.original.area_code || row.original.shopfloor_code || row.original.work_center_code || '-' },
    ...(productionLineEntity ? [{ id: 'shopfloor', header: t('resourceFoundation.shopfloors'), cell: ({ row }: any) => row.original.shopfloor_code || '-' }, { id: 'wc-count', header: t('resourceFoundation.workCenterCount'), cell: ({ row }: any) => formatNumberForDisplay(row.original.active_work_center_count, '0') }, { id: 'pv-count', header: t('resourceFoundation.productionVersionCount'), cell: ({ row }: any) => formatNumberForDisplay(row.original.active_eligibility_count, '0') }, { id: 'readiness', header: t('resourceFoundation.backendReadiness'), cell: ({ row }: any) => <div className="flex items-center gap-2"><StatusBadge status={row.original.readiness_status || 'Unknown'} /><span className="text-xs text-muted-foreground">{formatNumberForDisplay(row.original.readiness_blocker_count, '0')}</span></div> }] : []),
    { id: 'status', header: t('common.status'), cell: ({ row }) => <StatusBadge status={row.original.lifecycle_status || (row.original.active_flag === false ? 'Inactive' : row.original.execution_status || 'Active')} /> },
    ...(productionLineEntity ? [{ id: 'effectivity', header: t('resourceFoundation.effectivePeriod'), cell: ({ row }: any) => <span className="text-xs text-muted-foreground">{row.original.effective_from || '-'} - {row.original.effective_to || 'open'}</span> }] : []),
    { accessorKey: 'code', header: t('common.code'), cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{String(getValue() || '-')}</span> },
    ...(machineEntity ? [{ id: 'expected', header: t('resourceFoundation.expectedUnitCount'), cell: ({ row }: any) => `${formatNumberForDisplay(row.original.quantity, '0')} ${t('resourceFoundation.units')}` }, { id: 'total', header: t('resourceFoundation.totalUnits'), cell: ({ row }: any) => formatNumberForDisplay(row.original.total_unit_count, '0') }, { id: 'identified', header: t('resourceFoundation.identifiedUnits'), cell: ({ row }: any) => formatNumberForDisplay(row.original.identified_unit_count, '0') }, { id: 'pending', header: t('resourceFoundation.pendingUnits'), cell: ({ row }: any) => formatNumberForDisplay(row.original.pending_identification_unit_count, '0') }, { id: 'available', header: t('resourceFoundation.availableUnits'), cell: ({ row }: any) => formatNumberForDisplay(row.original.available_unit_count, '0') }, { id: 'assigned', header: t('resourceFoundation.assignedUnits'), cell: ({ row }: any) => formatNumberForDisplay(row.original.assigned_unit_count, '0') }, { id: 'reserved', header: t('resourceFoundation.reservedUnits'), cell: ({ row }: any) => row.original.reserved_unit_count == null ? t('common.notAvailable') : formatNumberForDisplay(row.original.reserved_unit_count, '0') }, { id: 'maintenance', header: t('resourceFoundation.maintenanceUnits'), cell: ({ row }: any) => formatNumberForDisplay(row.original.maintenance_unit_count, '0') }, { id: 'out', header: t('resourceFoundation.outOfServiceUnits'), cell: ({ row }: any) => formatNumberForDisplay(row.original.out_of_service_unit_count, '0') }, { id: 'planning', header: t('resourceFoundation.planningUnits'), cell: ({ row }: any) => formatNumberForDisplay(row.original.planning_eligible_unit_count, '0') }] : []),
    ...(actionEntity ? [{ id: 'actions', header: t('common.actions'), enableSorting: false, cell: ({ row }: any) => <div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" title={t('common.edit')} onClick={(event) => { event.stopPropagation(); onEdit?.(row.original); }}><Wrench className="h-4 w-4" /></Button>{!machineEntity ? <Button type="button" variant="ghost" size="icon" title={t(entity === 'workstations' ? 'resourceFoundation.deleteWorkstation' : 'resourceFoundation.deleteMachine')} onClick={(event) => { event.stopPropagation(); onDelete?.(row.original); }}><Trash2 className="h-4 w-4" /></Button> : null}</div> }] : []),
  ];
  return <div data-testid={machineEntity ? 'machine-list' : undefined} className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{t('resourceFoundation.subtitle')}</p></div><div className="flex gap-2"><Button variant="outline" onClick={onRefresh}><RefreshCw className="h-4 w-4" />{t('common.refresh')}</Button><Button data-testid={machineEntity ? 'machine-create-button' : undefined} onClick={onCreate}><Plus className="h-4 w-4" />{t('common.create')}</Button></div></div>{entity === 'production-areas' ? <ResourceHierarchy title={t('resourceFoundation.hierarchy')} areas={areas} workCenters={workCenters} workstations={workstations} equipment={equipment} text={text} /> : null}<BaseDataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.master_id} onRowClick={onOpen} stickyHeader /></div>;
  return <div className="space-y-5">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{t('resourceFoundation.subtitle')}</p></div><div className="flex gap-2"><Button variant="outline" onClick={onRefresh}><RefreshCw className="h-4 w-4" />{t('common.refresh')}</Button><Button onClick={onCreate}><Plus className="h-4 w-4" />{t('common.create')}</Button></div></div>
    {entity === 'production-areas' ? <ResourceHierarchy title={t('resourceFoundation.hierarchy')} areas={areas} workCenters={workCenters} workstations={workstations} equipment={equipment} text={text} /> : null}
    <Card className="overflow-x-auto p-0"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-surface-subtle text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">{t('common.name')}</th><th className="px-4 py-3">{t('common.site')}</th><th className="px-4 py-3">{t('resourceFoundation.area')}</th><th className="px-4 py-3">{t('common.status')}</th><th className="px-4 py-3">{t('common.code')}</th>{machineColumns}{actionEntity ? <th className="px-4 py-3 text-right">{t('common.actions')}</th> : null}</tr></thead><tbody className="divide-y divide-border">
      {loading ? <tr><td colSpan={columnCount} className="px-4 py-8 text-center">{t('common.loading')}</td></tr> : visibleRows.map((row: AnyRecord) => <tr key={row.master_id} className={onOpen ? 'cursor-pointer hover:bg-hover' : ''} onClick={() => onOpen?.(row)}><td className="px-4 py-3">{identity(text, row, entity === 'work-centers' ? 'work_center' : entity === 'workstations' ? 'workstation' : machinePrefix)}</td><td className="px-4 py-3 text-sm">{row.site_code || '-'}</td><td className="px-4 py-3 text-sm">{row.area_code || row.shopfloor_code || row.work_center_code || '-'}</td><td className="px-4 py-3"><StatusBadge status={row.lifecycle_status || (row.active_flag === false ? 'Inactive' : row.execution_status || 'Active')} /></td><td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.code}</td>{machineEntity ? <><td className="px-4 py-3 font-semibold">{formatNumberForDisplay(row.quantity ?? row.available_unit_count, '1')} {t('resourceFoundation.units')}</td><td className="px-4 py-3">{formatNumberForDisplay(row.available_unit_count, '0')} / {formatNumberForDisplay(row.quantity ?? row.available_unit_count, '1')}</td></> : null}{actionEntity ? <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" title={t('common.edit')} onClick={(event) => { event.stopPropagation(); onEdit?.(row); }}><Wrench className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" title={t(entity === 'workstations' ? 'resourceFoundation.deleteWorkstation' : 'resourceFoundation.deleteMachine')} onClick={(event) => { event.stopPropagation(); onDelete?.(row); }}><Trash2 className="h-4 w-4" /></Button></div></td> : null}</tr>)}{!loading && rows.length === 0 ? <tr><td colSpan={columnCount} className="px-4 py-8 text-center text-muted-foreground">{t('common.empty')}</td></tr> : null}
    </tbody></table></Card>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{t('resourceFoundation.showing', { from: rows.length ? (page - 1) * pageSize + 1 : 0, to: Math.min(page * pageSize, rows.length), total: rows.length })}</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">{t('resourceFoundation.pageSize')}<select className="h-9 rounded-md border border-input bg-background px-2" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={50}>50</option><option value={100}>100</option></select></label><Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t('resourceFoundation.previous')}</Button><span>{page} / {pageCount}</span><Button variant="outline" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>{t('resourceFoundation.next')}</Button></div></div>
  </div>;
}

function WorkstationCapabilityDetail({ row, text, t }: { row: AnyRecord; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const capabilities = Array.isArray(row.operation_capabilities) ? row.operation_capabilities : [];
  return <Card className="space-y-4 border-action/40 bg-surface-subtle p-5">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{t('resourceFoundation.supportedOperations')}</h2><p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{t('resourceFoundation.workstationCapabilityDetailHelp')}</p></div>
      <FieldHelpPopover label={t('resourceFoundation.workstationCapabilityFlowTitle')} title={t('resourceFoundation.workstationCapabilityFlowTitle')} content={t('resourceFoundation.workstationCapabilityFlow')} />
    </div>
    {capabilities.length ? <div className="space-y-2">{capabilities.map((capability: AnyRecord) => <div key={capability.capability_id} className="rounded-md border border-border bg-background p-3"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{text(capability.operation_name) || capability.operation_code || t('common.notAvailable')}</span>{capability.operation_code ? <span className="font-mono text-xs text-muted-foreground">{capability.operation_code}</span> : null}</div><div className="mt-2 grid gap-3 text-sm sm:grid-cols-3"><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.cycleTime')}</div><div>{formatNumberForDisplay(capability.cycle_time_sec)} sec</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.setupTime')}</div><div>{formatNumberForDisplay(capability.setup_time_min, '0')} min</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.baseQuantity')}</div><div>{formatNumberForDisplay(capability.base_quantity, '1')}</div></div></div></div>)}</div> : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t('common.empty')}</div>}
  </Card>;
}

function WorkstationPrintStationDetail({ integration, text, t }: { integration: AnyRecord; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const stationName = text(integration.print_station_name) || integration.print_station_code || t('common.notAvailable');
  const status = integration.runtime_status || integration.lifecycle_status || 'UNKNOWN';
  const printers = Array.isArray(integration.printers) ? integration.printers : [];
  return <Card className="space-y-4 border-action/40 bg-surface-subtle p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{t('nav.printStations')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('printStation.bindings')}</p>
      </div>
      <StatusBadge status={status} />
    </div>
    <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><div className="text-xs text-muted-foreground">{t('printStation.name')}</div><div className="font-semibold">{stationName}</div><div className="font-mono text-xs text-muted-foreground">{integration.print_station_code || '-'}</div></div>
      <div><div className="text-xs text-muted-foreground">{t('printStation.allocated')}</div><div className="font-semibold">{integration.allocated_printer_quantity ?? 0}</div></div>
      <div><div className="text-xs text-muted-foreground">{t('printStation.capacity')}</div><div className="font-semibold">{integration.effective_allocation_capacity ?? t('printStation.unknown')}</div></div>
      <div><div className="text-xs text-muted-foreground">{t('printStation.ready')}</div><div className="font-semibold">{integration.ready_printer_count ?? 0} / {integration.registered_printer_count ?? 0}</div></div>
      <div><div className="text-xs text-muted-foreground">{t('printStation.runtimeStatus')}</div><StatusBadge status={status} /></div>
      <div><div className="text-xs text-muted-foreground">{t('printStation.kafka')}</div><StatusBadge status={integration.kafka_status || 'UNKNOWN'} /></div>
      <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">{t('printStation.runtimeStatus')}</div><div>{integration.last_heartbeat_at || t('common.notAvailable')}</div></div>
    </div>
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{t('printStation.devices')}</h3><span className="text-xs text-muted-foreground">{printers.length} / {integration.registered_printer_count ?? 0}</span></div>
      {printers.length ? <div className="grid gap-2 md:grid-cols-2">{printers.map((printer: AnyRecord, index: number) => <div key={printer.printerCode || index} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"><div><div className="font-semibold">{printer.printerCode || t('common.notAvailable')}</div>{printer.adapterId ? <div className="text-xs text-muted-foreground">{printer.adapterId}</div> : null}</div><StatusBadge status={printer.status || 'UNKNOWN'} /></div>)}</div> : <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">{t('common.notAvailable')}</div>}
    </div>
    {integration.last_error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><div className="font-semibold">{t('printStation.runtimeStatus')}</div><div className="mt-1">{integration.last_error}</div></div> : null}
  </Card>;
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium text-foreground">{value}</div></div>;
}

function ProductionLineDetail({ row, text, t, user, workCenterCatalog, workstationCatalog, onReload, onBack }: AnyRecord) {
  const [tab, setTab] = useState('overview');
  const workCenters = Array.isArray(row.work_centers) ? row.work_centers : [];
  const currentWorkCenters = workCenters.filter((item: AnyRecord) => item.active_flag !== false && !item.effective_to);
  const resourceScopes = Array.isArray(row.resource_scopes) ? row.resource_scopes : [];
  const currentScopes = resourceScopes.filter((item: AnyRecord) => item.active_flag !== false && !item.effective_to);
  const eligibilities = Array.isArray(row.production_version_eligibilities) ? row.production_version_eligibilities : [];
  const readiness = row.readiness_summary || { status: row.readiness_status || 'Unknown', blocker_count: row.readiness_blocker_count ?? 0, blockers: [] };
  const [workCenterDraft, setWorkCenterDraft] = useState<AnyRecord[]>(currentWorkCenters);
  const currentWorkstations = currentScopes.filter((item: AnyRecord, index: number, all: AnyRecord[]) => item.workstation_id && all.findIndex((candidate) => String(candidate.workstation_id) === String(item.workstation_id)) === index);
  const [scopeDraft, setScopeDraft] = useState<AnyRecord[]>(currentWorkstations);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState('');
  const [selectedWorkstation, setSelectedWorkstation] = useState('');
  const [saving, setSaving] = useState<'work-centers' | 'resource-scopes' | null>(null);
  const [mutationError, setMutationError] = useState('');
  useEffect(() => { setWorkCenterDraft(currentWorkCenters); setScopeDraft(currentWorkstations); setMutationError(''); }, [row.master_id, row.updated_at, workCenters.length, resourceScopes.length]);

  const configuredIds = new Set(workCenterDraft.map((item) => String(item.work_center_id)));
  const availableWorkCenters = (workCenterCatalog || []).filter((item: AnyRecord) => item.site_id === row.site_id && item.area_id === row.area_id && item.active_flag !== false && !configuredIds.has(String(item.master_id)));
  const scopedWorkstationIds = new Set(scopeDraft.map((item) => String(item.workstation_id || item.master_id)));
  const availableWorkstations = (workstationCatalog || []).filter((item: AnyRecord) => configuredIds.has(String(item.work_center_id)) && item.site_id === row.site_id && item.active_flag !== false && !['Inactive', 'Obsolete'].includes(String(item.lifecycle_status)) && !scopedWorkstationIds.has(String(item.master_id)));

  const addWorkCenter = () => {
    const selected = (workCenterCatalog || []).find((item: AnyRecord) => item.master_id === selectedWorkCenter);
    if (!selected) return;
    setWorkCenterDraft((current) => [...current, { work_center_id: selected.master_id, work_center_code: selected.code, work_center_name: selected.name, sequence_no: current.length + 1, mandatory_flag: true }]);
    setSelectedWorkCenter(''); setMutationError('');
  };
  const moveWorkCenter = (index: number, offset: number) => setWorkCenterDraft((current) => {
    const target = index + offset;
    if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
    return next.map((item, itemIndex) => ({ ...item, sequence_no: itemIndex + 1 }));
  });
  const removeWorkCenter = (id: string) => {
    setWorkCenterDraft((current) => current.filter((item) => String(item.work_center_id) !== id).map((item, index) => ({ ...item, sequence_no: index + 1 })));
    setScopeDraft((current) => current.filter((item) => String(item.work_center_id) !== id));
  };
  const addScope = () => {
    const selected = (workstationCatalog || []).find((item: AnyRecord) => item.master_id === selectedWorkstation);
    if (!selected) return;
    setScopeDraft((current) => [...current, selected]);
    setSelectedWorkstation(''); setMutationError('');
  };
  const saveWorkCenters = async () => {
    try {
      setSaving('work-centers'); setMutationError('');
      await saveProductionLineWorkCenters(row.master_id, workCenterDraft.map((item, index) => ({ work_center_id: item.work_center_id, sequence_no: index + 1, mandatory_flag: item.mandatory_flag !== false, effective_from: item.effective_from || null, effective_to: item.effective_to || null })), user);
      toast.success(t('resourceFoundation.lineWorkCentersSaved')); await onReload();
    } catch (error: any) { const code = String(error.code || error.message || ''); setMutationError(code); toast.error(t(`resourceFoundation.errors.${code}`)); } finally { setSaving(null); }
  };
  const saveScopes = async () => {
    try {
      setSaving('resource-scopes'); setMutationError('');
      await saveProductionLineResourceScopes(row.master_id, scopeDraft.map((item) => ({ workstation_id: item.workstation_id || item.master_id, effective_from: item.effective_from || null, effective_to: item.effective_to || null })), user);
      toast.success(t('resourceFoundation.lineResourceScopesSaved')); await onReload();
    } catch (error: any) { const code = String(error.code || error.message || ''); setMutationError(code); toast.error(t(`resourceFoundation.errors.${code}`)); } finally { setSaving(null); }
  };
  const tabs = [
    ['overview', t('resourceFoundation.overview')],
    ['work-centers', t('resourceFoundation.workCentersTab')],
    ['resource-scope', t('resourceFoundation.workstations')],
    ['eligibility', t('resourceFoundation.eligibility')],
    ['readiness', t('resourceFoundation.readiness')],
    ['history', t('resourceFoundation.auditHistory')],
  ];
  return <div data-testid="production-line-detail" className="space-y-5">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">{identity(text, row, '')}</h1><p className="mt-1 text-sm text-muted-foreground">{row.site_code || '-'} / {row.area_code || '-'} / {row.shopfloor_code || '-'}</p></div><Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button></div>
    <div className="flex flex-wrap gap-2 border-b border-border">{tabs.map(([key, label]) => <button key={key} type="button" className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === key ? 'border-action text-action' : 'border-transparent text-muted-foreground hover:text-foreground'}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'overview' ? <Card className="grid gap-4 p-5 md:grid-cols-4">
      <DetailItem label={t('common.status')} value={<StatusBadge status={row.lifecycle_status || (row.active_flag === false ? 'Inactive' : 'Active')} />} />
      <DetailItem label={t('resourceFoundation.lineType')} value={row.line_type || 'Production'} />
      <DetailItem label={t('resourceFoundation.workCenterCount')} value={formatNumberForDisplay(row.active_work_center_count ?? workCenters.length, '0')} />
      <DetailItem label={t('resourceFoundation.productionVersionCount')} value={formatNumberForDisplay(row.active_eligibility_count ?? eligibilities.length, '0')} />
      <DetailItem label={t('common.site')} value={text(row.site_name) || row.site_code || '-'} />
      <DetailItem label={t('resourceFoundation.area')} value={text(row.area_name) || row.area_code || '-'} />
      <DetailItem label={t('resourceFoundation.shopfloors')} value={text(row.shopfloor_name) || row.shopfloor_code || '-'} />
      <DetailItem label={t('resourceFoundation.effectivePeriod')} value={`${row.effective_from || '-'} - ${row.effective_to || 'open'}`} />
    </Card> : null}
    {tab === 'work-centers' ? <Card className="space-y-4 p-5" data-testid="line-work-center-editor"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.workCentersTab')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('resourceFoundation.workCenterCoverageHelp')}</p></div><Button onClick={() => void saveWorkCenters()} disabled={saving !== null}><Save className="h-4 w-4" />{t('common.save')}</Button></div><div className="flex flex-col gap-2 sm:flex-row"><SelectBase value={selectedWorkCenter} onValueChange={setSelectedWorkCenter} options={availableWorkCenters.map((item: AnyRecord) => ({ value: item.master_id, label: text(item.name) || item.code, secondaryLabel: `${item.code} · ${item.area_code || row.area_code || ''}` }))} placeholder={t('resourceFoundation.selectWorkCenter')} data-testid="line-work-center-select" /><Button type="button" variant="outline" disabled={!selectedWorkCenter} onClick={addWorkCenter}><Plus className="h-4 w-4" />{t('common.add')}</Button></div>{mutationError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{t(`resourceFoundation.errors.${mutationError}`)}</div> : null}{workCenterDraft.length ? <div className="divide-y divide-border rounded-md border border-border">{workCenterDraft.map((item: AnyRecord, index: number) => <div key={item.work_center_id} className="flex flex-wrap items-center gap-3 p-3"><div className="min-w-0 flex-1"><div className="font-semibold">{text(item.work_center_name) || item.work_center_code}</div><div className="font-mono text-xs text-muted-foreground">{item.work_center_code}</div></div><label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={item.mandatory_flag !== false} onCheckedChange={(checked) => setWorkCenterDraft((current) => current.map((value) => value.work_center_id === item.work_center_id ? { ...value, mandatory_flag: checked === true } : value))} />{t('resourceFoundation.mandatory')}</label><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" title={t('resourceFoundation.moveUp')} disabled={index === 0} onClick={() => moveWorkCenter(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title={t('resourceFoundation.moveDown')} disabled={index === workCenterDraft.length - 1} onClick={() => moveWorkCenter(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title={t('common.remove')} onClick={() => removeWorkCenter(String(item.work_center_id))}><Trash2 className="h-4 w-4" /></Button></div><span className="w-8 text-center text-xs font-semibold text-muted-foreground">{index + 1}</span></div>)}</div> : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t('resourceFoundation.noWorkCenterCoverage')}</div>}</Card> : null}
    {tab === 'resource-scope' ? <Card className="space-y-4 p-5" data-testid="line-resource-scope-editor"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.workstations')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('resourceFoundation.executionResourceScopeHelp')}</p></div><Button onClick={() => void saveScopes()} disabled={saving !== null}><Save className="h-4 w-4" />{t('common.save')}</Button></div><div className="flex flex-col gap-2 sm:flex-row"><SelectBase value={selectedWorkstation} onValueChange={setSelectedWorkstation} options={availableWorkstations.map((item: AnyRecord) => ({ value: item.master_id, label: text(item.name) || item.code, secondaryLabel: `${item.code} · ${text(item.workstation_name || item.name) || item.workstation_code || item.code || text(item.work_center_name) || item.work_center_code || ''}` }))} placeholder={t('resourceFoundation.workstations')} data-testid="line-resource-scope-select" /><Button type="button" variant="outline" disabled={!selectedWorkstation} onClick={addScope}><Plus className="h-4 w-4" />{t('common.add')}</Button></div>{mutationError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{t(`resourceFoundation.errors.${mutationError}`)}</div> : null}{scopeDraft.length ? <div className="divide-y divide-border rounded-md border border-border">{scopeDraft.map((item: AnyRecord) => <div key={item.workstation_id || item.scope_id} data-testid="line-resource-scope-row" className="flex flex-wrap items-center gap-3 p-3"><div className="min-w-0 flex-1"><div className="font-semibold">{text(item.workstation_name || item.name) || item.workstation_code || item.code}</div><div className="font-mono text-xs text-muted-foreground">{item.workstation_code}</div><div className="mt-1 text-xs text-muted-foreground">{item.work_center_code || t('common.notAvailable')}</div></div><StatusBadge status={item.active_flag === false ? 'Inactive' : 'Active'} /><Button type="button" size="icon" variant="ghost" data-testid="line-resource-scope-remove" title={t('common.remove')} onClick={() => setScopeDraft((current) => current.filter((value) => String(value.workstation_id || value.master_id) !== String(item.workstation_id || item.master_id)))}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t('resourceFoundation.noResourceScope')}</div>}</Card> : null}
    {tab === 'eligibility' ? <Card className="space-y-3 p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.productionVersionEligibility')}</h2>{eligibilities.length ? <div className="space-y-2">{eligibilities.map((item: AnyRecord) => <div key={item.eligibility_id} className="rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">{text(item.production_version_name) || item.production_version_code}</div><div className="font-mono text-xs text-muted-foreground">{item.production_version_code}</div></div><StatusBadge status={item.lifecycle_status || (item.active_flag === false ? 'Inactive' : 'Released')} /></div><div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4"><span>{item.is_primary ? t('resourceFoundation.primaryLine') : t('resourceFoundation.backupLine')}</span><span>{t('resourceFoundation.priority')}: {item.priority_no ?? '-'}</span><span>{t('resourceFoundation.efficiency')}: {item.efficiency_factor ?? 1}</span><span>{item.effective_from || '-'} - {item.effective_to || 'open'}</span></div></div>)}</div> : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card> : null}
    {tab === 'readiness' ? <Card className="space-y-4 border-action/40 bg-surface-subtle p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{t('resourceFoundation.backendReadiness')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('resourceFoundation.backendReadinessHelp')}</p></div><StatusBadge status={readiness.status || 'Unknown'} /></div><div className="grid gap-3 sm:grid-cols-2"><DetailItem label={t('resourceFoundation.workCenterCount')} value={formatNumberForDisplay(row.active_work_center_count ?? workCenters.length, '0')} /><DetailItem label={t('resourceFoundation.productionVersionCount')} value={formatNumberForDisplay(row.active_eligibility_count ?? eligibilities.length, '0')} /></div>{readiness.blockers?.length ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><div className="font-semibold">{t('resourceFoundation.blockingReasons')}</div>{readiness.blockers.map((blocker: AnyRecord, index: number) => <div key={`${blocker.code}-${index}`}>{t(`resourceFoundation.readiness.${blocker.code}`)} <span className="text-xs opacity-80">({t(`resourceFoundation.readinessCategory.${blocker.category}`)})</span></div>)}</div> : null}{readiness.warnings?.length ? <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground"><div className="font-semibold">{t('resourceFoundation.readinessWarnings')}</div>{readiness.warnings.map((warning: AnyRecord, index: number) => <div key={`${warning.code}-${index}`}>{t(`resourceFoundation.readiness.${warning.code}`)} <span className="text-xs opacity-80">({t(`resourceFoundation.readinessCategory.${warning.category}`)})</span></div>)}</div> : null}</Card> : null}
    {tab === 'history' ? <Card className="grid gap-4 p-5 md:grid-cols-3"><DetailItem label={t('resourceFoundation.lifecycleStatus')} value={row.lifecycle_status || '-'} /><DetailItem label={t('resourceFoundation.effectiveFrom')} value={row.effective_from || '-'} /><DetailItem label={t('resourceFoundation.effectiveTo')} value={row.effective_to || 'open'} /><DetailItem label={t('resourceFoundation.assignmentHistory')} value={`${workCenters.length} ${t('resourceFoundation.workCentersTab')} / ${resourceScopes.length} ${t('resourceFoundation.executionResourceScope')} / ${eligibilities.length} ${t('resourceFoundation.productionVersionEligibility')}`} /></Card> : null}
  </div>;
}

function ResourcePlanningEvidencePanel({ row, text, t }: { row: AnyRecord; text: (value: unknown) => string; t: (key: string, params?: Record<string, unknown>) => string }) {
  const capabilities = Array.isArray(row.operation_capabilities) ? row.operation_capabilities : [];
  const calendars = Array.isArray(row.calendars) ? row.calendars : [];
  const standards = Array.isArray(row.production_standards) ? row.production_standards : [];
  const lineMemberships = Array.isArray(row.line_memberships) ? row.line_memberships : [];
  return <div className="grid gap-5 lg:grid-cols-2">
    {lineMemberships.length ? <Card className="space-y-3 p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.lineMembership')}</h2>{lineMemberships.map((item: AnyRecord) => <div key={item.line_work_center_id} className="rounded-md border border-border p-3 text-sm"><div className="font-semibold">{text(item.production_line_name) || item.production_line_code}</div><div className="text-xs text-muted-foreground">{item.production_line_code} · {item.effective_from || '-'} - {item.effective_to || 'open'}</div></div>)}</Card> : null}
    <Card className="space-y-3 p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.capabilities')}</h2>{capabilities.length ? capabilities.map((item: AnyRecord) => <div key={item.master_id} className="rounded-md border border-border p-3 text-sm"><div className="font-semibold">{text(item.operation_name) || item.operation_code}</div><div className="text-xs text-muted-foreground">{item.operation_code} · {item.equipment_code || t('resourceFoundation.workCenter')} · {item.lifecycle_status || (item.active_flag === false ? 'Inactive' : 'Active')}</div></div>) : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card>
    <Card className="space-y-3 p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.calendars')}</h2>{calendars.length ? calendars.map((item: AnyRecord) => <div key={item.master_id} className="rounded-md border border-border p-3 text-sm"><div className="font-semibold">{item.calendar_date || item.effective_from}</div><div className="text-xs text-muted-foreground">{item.resource_type} · {item.shift_code || '-'} · {item.availability_status || 'Available'} · {item.available_minutes ?? '-'} min</div></div>) : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card>
    <Card className="space-y-3 p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.productionStandards')}</h2>{standards.length ? standards.map((item: AnyRecord) => <div key={item.master_id} className="rounded-md border border-border p-3 text-sm"><div className="font-semibold">{text(item.operation_name) || item.operation_code}</div><div className="text-xs text-muted-foreground">{item.equipment_code || t('resourceFoundation.workCenter')} · {t('resourceFoundation.cycleTime')}: {item.cycle_time_sec ?? '-'} · {t('resourceFoundation.setupTime')}: {item.setup_time_min ?? '-'}</div></div>) : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card>
  </div>;
}

function ResourceDetail({ entity, row, text, t, user, workCenterCatalog, workstationCatalog, resourceAssignments, onReload, onBack, onRelease, releasing }: AnyRecord) {
  const releasableEntity = ['workstations', 'production-lines'].includes(entity);
  const releaseLifecycleAllowed = releasableEntity && ['Draft', 'InReview', 'Inactive'].includes(row.lifecycle_status);
  const lineReleaseBlocked = entity === 'production-lines' && (row.readiness_summary?.blocker_count || 0) > 0;
  const canRelease = releaseLifecycleAllowed && !lineReleaseBlocked;
  if (entity === 'production-lines') return <>{releasableEntity ? <Card className="flex items-center justify-between gap-3 border-action/40 bg-surface-subtle p-4"><div><div className="font-semibold">{t('resourceFoundation.releaseLine')}</div><div className="text-sm text-muted-foreground">{t('resourceFoundation.releaseLineHelp')}</div></div>{releaseLifecycleAllowed ? <Button onClick={onRelease} disabled={releasing || lineReleaseBlocked}><CheckCircle2 className="h-4 w-4" />{t('resourceFoundation.releaseLine')}</Button> : null}</Card> : null}<ProductionLineDetail row={row} text={text} t={t} user={user} workCenterCatalog={workCenterCatalog} workstationCatalog={workstationCatalog} onReload={onReload} onBack={onBack} /></>;
  return <>{releasableEntity ? <><Card className="flex items-center justify-between gap-3 border-action/40 bg-surface-subtle p-4"><div><div className="font-semibold">{t('resourceFoundation.release')}</div><div className="text-sm text-muted-foreground">{t('resourceFoundation.releaseHelp')}</div></div>{canRelease ? <Button onClick={onRelease} disabled={releasing}><CheckCircle2 className="h-4 w-4" />{t('resourceFoundation.release')}</Button> : null}</Card>{entity === 'workstations' && row.print_station_integration ? <WorkstationPrintStationDetail integration={row.print_station_integration} text={text} t={t} /> : null}</> : null}<LegacyResourceDetail entity={entity} row={row} text={text} t={t} user={user} onBack={onBack} onRelease={onRelease} releasing={releasing} /></>;
}

function EquipmentReadinessDetail({ row, t }: { row: AnyRecord; t: (key: string, params?: Record<string, unknown>) => string }) {
  const readiness = row.readiness || {};
  const dimensions = ['machine_unit', 'assignment', 'capability', 'calendar', 'capacity', 'maintenance', 'calibration', 'operational_state'];
  const label: Record<string, string> = { machine_unit: t('resourceFoundation.machineUnits'), assignment: t('resourceFoundation.assignments'), capability: t('resourceFoundation.capabilities'), calendar: t('resourceFoundation.calendars'), capacity: t('resourceFoundation.capacity'), maintenance: t('resourceFoundation.maintenance'), calibration: t('resourceFoundation.calibration'), operational_state: t('resourceFoundation.operationalState') };
  const status = readiness.status || 'Unknown';
  return <Card className="space-y-4 border-action/40 bg-surface-subtle p-5">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{t('resourceFoundation.readiness')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('resourceFoundation.readinessHelp')}</p></div><StatusBadge status={status} /></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{dimensions.map((key) => { const dimension = readiness[key] || {}; return <div key={key} className="rounded-md border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{label[key]}</div><div className="mt-1 font-semibold">{dimension.status || t('resourceFoundation.unknown')}</div>{dimension.reason ? <div className="mt-1 text-xs text-muted-foreground">{dimension.reason}</div> : null}</div>; })}</div>
    {readiness.blocking_errors?.length ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><div className="font-semibold">{t('resourceFoundation.blockingReasons')}</div>{readiness.blocking_errors.map((error: AnyRecord, index: number) => <div key={`${error.code}-${index}`}>{error.code}</div>)}</div> : null}
    {readiness.warnings?.length ? <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700"><div className="font-semibold">{t('resourceFoundation.warnings')}</div>{readiness.warnings.map((warning: AnyRecord, index: number) => <div key={`${warning.code}-${index}`}>{warning.code}</div>)}</div> : null}
  </Card>;
}

function MachineUnitsPanel({ machineId, units, user, t }: { machineId: string; units: AnyRecord[]; user: AnyRecord; t: (key: string, params?: Record<string, unknown>) => string }) {
  const [items, setItems] = useState(units);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: '', serial_number: '', unit_sequence: '' });
  const reload = async () => { const response = await fetch(`${masterDataBaseUrl()}/machines/${machineId}/units`, { headers: authHeaders(user), cache: 'no-store' }); if (response.ok) setItems((await response.json()).data || []); };
  const save = async () => { setSaving(true); try { const response = await fetch(`${masterDataBaseUrl()}/machines/${machineId}/units`, { method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, unit_sequence: form.unit_sequence ? Number(form.unit_sequence) : undefined }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || payload.error || t('resourceFoundation.machineUnitCreateFailed')); toast.success(t('resourceFoundation.machineUnitCreated')); setOpen(false); setForm({ code: '', serial_number: '', unit_sequence: '' }); await reload(); } catch (error: any) { toast.error(error.message || t('resourceFoundation.machineUnitCreateFailed')); } finally { setSaving(false); } };
  const toggle = async (unit: AnyRecord) => { const nextActive = unit.lifecycle_status === 'Inactive' || unit.active_flag === false; const response = await fetch(`${masterDataBaseUrl()}/machine-units/${unit.machine_unit_id}`, { method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ active_flag: nextActive, lifecycle_status: nextActive ? 'Released' : 'Inactive' }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) toast.error(payload.message || payload.error || t('resourceFoundation.machineUnitUpdateFailed')); else await reload(); };
  const remove = async () => { if (!deleteTarget) return; setSaving(true); try { const response = await fetch(`${masterDataBaseUrl()}/machine-units/${deleteTarget.machine_unit_id}`, { method: 'DELETE', headers: authHeaders(user) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || payload.error || t('resourceFoundation.machineUnitDeleteFailed')); toast.success(t('resourceFoundation.machineUnitDeleted')); setDeleteTarget(null); await reload(); } catch (error: any) { toast.error(error.message || t('resourceFoundation.machineUnitDeleteFailed')); } finally { setSaving(false); } };
  return <Card data-testid="machine-unit-list" className="space-y-3 border-action/40 bg-surface-subtle p-4 md:col-span-2"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">{t('resourceFoundation.physicalMachineUnits')}</h2><p className="text-xs text-muted-foreground">{t('resourceFoundation.physicalMachineUnitsHelp')}</p></div><Button data-testid="machine-unit-add-button" type="button" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('resourceFoundation.addMachineUnit')}</Button></div><BaseCardGrid data={items} pageSize={10} getRowId={(unit) => unit.machine_unit_id} renderCard={(unit) => <div data-testid="machine-unit-card" className="rounded-md border border-border bg-background p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{unit.code}</div><div className="font-mono text-xs text-muted-foreground">{unit.serial_number || t('resourceFoundation.pendingIdentification')}</div></div><StatusBadge status={unit.active_flag === false || unit.lifecycle_status === 'Inactive' ? 'Inactive' : unit.execution_status || 'Unknown'} /></div><div className="mt-2 grid gap-1 text-xs text-muted-foreground"><span>{t('resourceFoundation.lifecycleStatus')}: {unit.lifecycle_status || 'Draft'}</span><span>{t('resourceFoundation.planningResource')}: {unit.planning_resource_flag ? t('common.active') : t('common.inactive')}</span><span>{t('resourceFoundation.workstation')}: {unit.current_workstation_code || t('common.notAvailable')}</span></div><div className="mt-2 flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => void toggle(unit)}>{unit.active_flag === false || unit.lifecycle_status === 'Inactive' ? t('common.active') : t('common.inactive')}</Button><Button type="button" variant="ghost" size="sm" disabled={!unit.can_delete} title={unit.can_delete ? t('resourceFoundation.deleteMachineUnit') : t('resourceFoundation.machineUnitDeleteBlocked')} onClick={() => setDeleteTarget(unit)}><Trash2 className="h-4 w-4" />{t('common.delete')}</Button></div></div>} emptyState={t('common.empty')} /> <Modal open={open} title={t('resourceFoundation.addMachineUnit')} onClose={() => setOpen(false)} footerLeft={<Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>} footer={<Button data-testid="machine-unit-save-button" type="button" disabled={saving} onClick={() => void save()}><Save className="h-4 w-4" />{t('common.save')}</Button>}><div data-testid="machine-unit-form" className="space-y-3"><Field testId="machine-unit-asset-code-input" label={t('resourceFoundation.assetCode')} value={form.code} onChange={(value) => setForm((current) => ({ ...current, code: value }))} /><Field testId="machine-unit-serial-input" label={t('resourceFoundation.serialNumber')} value={form.serial_number} onChange={(value) => setForm((current) => ({ ...current, serial_number: value }))} required /><Field label={t('resourceFoundation.unitSequence')} type="number" value={form.unit_sequence} onChange={(value) => setForm((current) => ({ ...current, unit_sequence: value }))} /></div></Modal><Confirmation open={Boolean(deleteTarget)} title={t('resourceFoundation.deleteMachineUnit')} description={t('resourceFoundation.deleteMachineUnitConfirm')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} loading={saving} onClose={() => { if (!saving) setDeleteTarget(null); }} onConfirm={() => void remove()} /></Card>;
}

function LegacyResourceDetail(props: AnyRecord) {
  const { entity, row, user } = props;
  const machineEntity = entity === 'equipment' || entity === 'machines';
  return machineEntity ? <MachineDetailTabs {...props} /> : <LegacyResourceDetailContent {...props} />;
}

function MachineDetailTabs({ row, text, t, user, onBack }: AnyRecord) {
  const [tab, setTab] = useState<'info' | 'history'>('info');
  const assignments = Array.isArray(row.assignments) ? row.assignments : [];
  const units = Array.isArray(row.units) ? row.units : [];
  const skills = Array.isArray(row.skills) ? row.skills : [];
  return <div data-testid="machine-detail" className="space-y-5">
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-black">{text(row.name) || row.code}</h1><p className="mt-1 text-sm text-muted-foreground">{row.site_code || '-'} · {row.work_center_code || row.shopfloor_code || row.area_code || '-'}</p></div>
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button>
      </div>
      <div className="border-t border-border pt-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{t('resourceFoundation.machineDescription')}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{text(row.description) || t('common.notAvailable')}</p>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label={t('common.code')} value={<span className="font-mono">{row.code}</span>} />
          <DetailItem label={t('common.status')} value={<StatusBadge status={row.active_flag === false ? 'Inactive' : row.execution_status || row.lifecycle_status || 'Available'} />} />
          <DetailItem label={t('resourceFoundation.equipmentType')} value={row.equipment_type || t('common.notAvailable')} />
          <DetailItem label={t('resourceFoundation.manufacturer')} value={row.manufacturer || t('common.notAvailable')} />
          <DetailItem label={t('resourceFoundation.model')} value={row.model || t('common.notAvailable')} />
          <DetailItem label={t('common.site')} value={text(row.site_name) || row.site_code || t('common.notAvailable')} />
          <DetailItem label={t('resourceFoundation.workCenter')} value={text(row.work_center_name) || row.work_center_code || t('common.notAvailable')} />
          <DetailItem label={t('resourceFoundation.quantity')} value={row.quantity || units.length || 1} />
          <DetailItem label={t('resourceFoundation.availableUnits')} value={`${row.available_unit_count ?? 0} / ${units.length || row.quantity || 1}`} />
          <DetailItem label={t('resourceFoundation.efficiency')} value={row.default_efficiency ?? 1} />
          <DetailItem label={t('resourceFoundation.planningResource')} value={row.planning_resource_flag ? t('common.active') : t('common.inactive')} />
        </div>
      </div>
    </Card>
    <div className="flex gap-2 border-b border-border">
      <button type="button" className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'info' ? 'border-action text-action' : 'border-transparent text-muted-foreground hover:text-foreground'}`} onClick={() => setTab('info')}>{t('resourceFoundation.machineInformation')}</button>
      <button type="button" className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'history' ? 'border-action text-action' : 'border-transparent text-muted-foreground hover:text-foreground'}`} onClick={() => setTab('history')}>{t('resourceFoundation.assignmentHistory')}</button>
    </div>
    {tab === 'info' ? <div className="space-y-5">
      <MachineUnitsPanel machineId={row.master_id} units={units} user={user} t={t} />
      <Card className="space-y-3 p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('skills.resourceSkills')}</h2><p className="text-xs text-muted-foreground">{t('skills.resourceSkillsHelp')}</p></div><span className="text-sm font-semibold">{skills.length}</span></div>{skills.length ? <div className="grid gap-2 md:grid-cols-2">{skills.map((skill: AnyRecord) => <div key={skill.assignment_id} className="rounded-md border border-border bg-surface-subtle p-3"><div className="font-semibold">{text(skill.skill_name) || skill.skill_code}</div><div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="font-mono">{skill.skill_code}</span><span>{t('resourceFoundation.minimumLevel')}: {skill.minimum_level}</span><span>{skill.required_flag ? t('resourceFoundation.required') : t('resourceFoundation.optional')}</span></div></div>)}</div> : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card>
    </div> : <Card className="p-5"><h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.assignmentHistory')}</h2>{assignments.length ? <div className="space-y-2">{assignments.map((assignment: AnyRecord) => <div key={assignment.master_id} className="rounded-md border border-border p-3"><div>{text(assignment.work_center_name) || assignment.work_center_code || '-'} · {text(assignment.workstation_name) || assignment.workstation_code || '-'}</div><div className="text-xs text-muted-foreground">{assignment.assignment_role || assignment.assignment_type} · {assignment.effective_from} → {assignment.effective_to || 'open'}</div></div>)}</div> : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card>}
  </div>;
}

function LegacyResourceDetailContent({ entity, row, text, t, onBack, onRelease, releasing, user }: AnyRecord) {
  const assignments = row.assignments || [];
  const skills = row.skills || [];
  const units = row.units || [];
  const resourcePrefix = entity === 'work-centers' ? 'work_center' : entity === 'workstations' ? 'workstation' : entity === 'equipment' || entity === 'machines' ? 'equipment' : '';
  const machineEntity = entity === 'equipment' || entity === 'machines';
  const assignmentIdentity = (name: unknown, code: unknown) => `${text(name) || text(code) || '-'}`;
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">{identity(text, row, resourcePrefix)}</h1><p className="mt-1 text-sm text-muted-foreground">{row.site_code || '-'} · {row.work_center_code || row.shopfloor_code || row.area_code || '-'}</p></div><Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('common.back')}</Button></div><Card className="grid gap-4 p-5 md:grid-cols-4"><div><div className="text-xs text-muted-foreground">{t('common.status')}</div><StatusBadge status={row.execution_status || (row.active_flag === false ? 'Inactive' : row.lifecycle_status || 'Active')} /></div><div><div className="text-xs text-muted-foreground">{t('common.code')}</div><div className="font-mono">{row.code}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.assignments')}</div><div className="font-bold">{assignments.length}</div></div>{machineEntity ? <div><div className="text-xs text-muted-foreground">{t('skills.resourceSkills')}</div><div className="font-bold">{skills.length}</div></div> : null}{machineEntity ? <><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.equipmentType')}</div><div>{row.equipment_type || t('common.notAvailable')}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.manufacturer')}</div><div>{row.manufacturer || t('common.notAvailable')}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.model')}</div><div>{row.model || t('common.notAvailable')}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.serialNumber')}</div><div>{row.serial_number || t('common.notAvailable')}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.quantity')}</div><div>{row.quantity || units.length || 1}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.availableUnits')}</div><div>{row.available_unit_count ?? 0} / {units.length || row.quantity || 1}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.efficiency')}</div><div>{row.default_efficiency ?? 1}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.planningResource')}</div><div>{row.planning_resource_flag ? t('common.active') : t('common.inactive')}</div></div></> : null}</Card>{entity === 'workstations' ? <WorkstationReadinessSummary row={row} text={text} t={t} /> : null}{['work-centers', 'workstations'].includes(entity) ? <ResourcePlanningEvidencePanel row={row} text={text} t={t} /> : null}{machineEntity ? <><EquipmentReadinessDetail row={row} t={t} /><Card className="space-y-3 p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.machineDescription')}</h2><p className="whitespace-pre-wrap text-sm text-foreground">{text(row.description) || t('common.notAvailable')}</p><div className="grid gap-3 text-sm md:grid-cols-3"><div><div className="text-xs text-muted-foreground">{t('common.site')}</div><div>{text(row.site_name) || row.site_code || '-'}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.workCenter')}</div><div>{text(row.work_center_name) || row.work_center_code || '-'}</div></div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.machineStatus')}</div><StatusBadge status={row.active_flag === false ? 'Inactive' : row.execution_status || 'Available'} /></div></div></Card><Card className="space-y-3 p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('skills.resourceSkills')}</h2><p className="text-xs text-muted-foreground">{t('skills.resourceSkillsHelp')}</p></div><span className="text-sm font-semibold">{skills.length}</span></div>{skills.length ? <div className="grid gap-2 md:grid-cols-2">{skills.map((skill: AnyRecord) => <div key={skill.assignment_id} className="rounded-md border border-border bg-surface-subtle p-3"><div className="font-semibold">{text(skill.skill_name) || skill.skill_code}</div><div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="font-mono">{skill.skill_code}</span><span>{t('resourceFoundation.minimumLevel')}: {skill.minimum_level}</span><span>{skill.required_flag ? t('resourceFoundation.required') : t('resourceFoundation.optional')}</span></div></div>)}</div> : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card><Card className="space-y-3 p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.machineUnits')}</h2>{units.length ? <div className="grid gap-2 md:grid-cols-2">{units.map((unit: AnyRecord) => <div key={unit.machine_unit_id} className="flex items-center justify-between rounded-md border border-border p-3"><div><div className="font-mono text-sm">{unit.code}</div><div className="text-xs text-muted-foreground">{t('resourceFoundation.unitSequence')} {unit.unit_sequence}</div></div><StatusBadge status={unit.active_flag === false ? 'Inactive' : unit.execution_status || 'Unknown'} /></div>)}</div> : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card></> : null}{entity === 'workstations' && row.machine_groups?.length ? <Card className="space-y-3 p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.machineGroups')}</h2>{row.machine_groups.map((group: AnyRecord) => <div key={group.master_id} className="rounded-md border border-border p-3"><div className="flex items-center justify-between"><div className="font-semibold">{text(group.name) || group.code}</div><StatusBadge status={group.lifecycle_status || 'Active'} /></div><div className="mt-2 grid gap-2 text-sm md:grid-cols-2"><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.primaryMachine')}</div>{(group.members || []).filter((member: AnyRecord) => (member.role || member.assignment_role) === 'Primary').map((member: AnyRecord) => <div key={member.master_id}>{text(member.machine_name) || member.equipment_code || '-'} <span className="font-mono text-xs text-muted-foreground">{member.machine_unit_code || member.machine_code || ''}</span></div>)}</div><div><div className="text-xs text-muted-foreground">{t('resourceFoundation.supportingMachines')}</div>{(group.members || []).filter((member: AnyRecord) => (member.role || member.assignment_role) === 'Supporting').map((member: AnyRecord) => <div key={member.master_id}>{text(member.machine_name) || member.machine_code || '-'} <span className="font-mono text-xs text-muted-foreground">{member.machine_unit_code || member.machine_code || ''}</span></div>)}</div></div></div>)}</Card> : null}<Card className="p-5"><h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('resourceFoundation.assignmentHistory')}</h2>{assignments.length ? <div className="space-y-2">{assignments.map((assignment: AnyRecord) => <div key={assignment.master_id} className="rounded-md border border-border p-3"><div>{assignmentIdentity(assignment.work_center_name, assignment.work_center_code)} · {assignmentIdentity(assignment.workstation_name, assignment.workstation_code)}</div><div className="text-xs text-muted-foreground">{assignment.assignment_role || assignment.assignment_type} · {assignment.effective_from} → {assignment.effective_to || 'open'}</div></div>)}</div> : <div className="text-sm text-muted-foreground">{t('common.empty')}</div>}</Card></div>;
}
