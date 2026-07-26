import React, { useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import {
  Button,
  Card,
  Confirmation,
  Modal,
  SelectBase,
} from '../../components/ui';
import { LocalizedTextInput } from '../../components/LocalizedTextInput';
import { authHeaders, fetchResource, masterDataBaseUrl, postResource } from '../../lib/masterDataApi';

type Row = Record<string, any>;
const SCOPE_BY_PATH: Record<string, string> = {
  machines: 'Machine',
  workstations: 'Workstation',
  'work-centers': 'WorkCenter',
  workers: 'Employee',
};

const emptySkill = () => ({ name: { vi: '' }, description: { vi: '' }, minimum_level: 'L1' });

export function SkillManagementScreen() {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.split('/').pop() || '';
  const scope = SCOPE_BY_PATH[path] || 'Machine';
  const workerTab = scope === 'Employee';
  const [skills, setSkills] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [skillDetailOpen, setSkillDetailOpen] = useState(false);
  const [skillEditOpen, setSkillEditOpen] = useState(false);
  const [dependencyLoading, setDependencyLoading] = useState(false);
  const [dependencies, setDependencies] = useState<Row | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Row | null>(null);
  const [skillForm, setSkillForm] = useState<Row>(emptySkill());

  const request = async (pathName: string, init: RequestInit = {}) => {
    const response = await fetch(`${masterDataBaseUrl()}${pathName}`, {
      ...init,
      headers: { ...authHeaders(user), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || t('skills.saveFailed'));
    return payload;
  };

  const load = async () => {
    setLoading(true);
    try {
      const skillRows = workerTab
        ? await request('/worker-skills')
        : await fetchResource('skills', user, `?scope=${encodeURIComponent(scope)}`);
      setSkills(workerTab ? (skillRows.data || []) : skillRows);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [scope, user?.userId]);

  const errorMessage = (error: any) => {
    const messages: Record<string, string> = {
      SKILL_DUPLICATE: t('skills.duplicate'),
      SKILL_SCOPE_REQUIRED: t('skills.scopeRequired'),
      SKILL_REFERENCED: t('skills.referenced'),
      SKILL_SCOPE_IMMUTABLE: t('skills.scopeMismatch'),
      WORKER_SKILL_SCOPE_IMMUTABLE: t('skills.scopeMismatch'),
    };
    return messages[String(error?.message || '')] || t('skills.saveFailed');
  };

  const openEdit = async (skill: Row) => {
    setSelectedSkill(skill);
    setSkillForm({ name: skill.name || { vi: '' }, description: skill.description || { vi: '' }, minimum_level: skill.minimum_level || 'L1' });
    setDependencies(null);
    setSkillEditOpen(true);
    setDependencyLoading(true);
    try {
      const payload = await request(`${workerTab ? '/worker-skills' : '/skills'}/${skill.master_id}/dependencies`);
      setDependencies(payload.data || {});
    } catch (error: any) {
      toast.error(errorMessage(error));
    } finally {
      setDependencyLoading(false);
    }
  };

  const saveEditSkill = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSkill) return;
    try {
      const saved = await request(`${workerTab ? '/worker-skills' : '/skills'}/${selectedSkill.master_id}`, { method: 'PUT', body: JSON.stringify(skillForm) });
      setSkills(skills.map((skill) => skill.master_id === selectedSkill.master_id ? (saved.data || saved) : skill));
      setSkillEditOpen(false);
      toast.success(t('skills.saved'));
    } catch (error: any) {
      toast.error(errorMessage(error));
    }
  };

  const saveSkill = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const saved = workerTab
        ? await request('/worker-skills', { method: 'POST', body: JSON.stringify(skillForm) })
        : await (async () => {
            const reservation = await request('/business-codes/reservations', {
              method: 'POST',
              body: JSON.stringify({ entity_type: `Skill:${scope}` }),
            });
            return postResource('skills', { ...skillForm, scope, code_reservation_id: reservation.data?.reservation_id }, user);
          })();
      setSkills([...skills, saved.data || saved]);
      setSkillForm(emptySkill());
      setSkillModalOpen(false);
      toast.success(t('skills.saved'));
    } catch (error: any) {
      toast.error(errorMessage(error));
    }
  };

  const openAssignments = async (skill: Row) => {
    setSelectedSkill(skill);
    setSkillDetailOpen(true);
    try {
      const payload = await request(`/worker-skills/${skill.master_id}/assignments`);
      setAssignments(payload.data || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const deactivate = async (skill: Row) => {
    try {
      await request(workerTab ? `/worker-skills/${skill.master_id}` : `/skills/${skill.master_id}`, {
        method: 'PUT',
        body: JSON.stringify({ lifecycle_status: 'Inactive' }),
      });
      toast.success(t('skills.saved'));
      await load();
    } catch (error: any) {
      toast.error(errorMessage(error));
    }
  };

  const tabs = [
    ['machines', t('skills.machineTab')],
    ['workstations', t('skills.workstationTab')],
    ['work-centers', t('skills.workCenterTab')],
    ['workers', t('skills.workerTab')],
  ];
  const scopeLabel = workerTab ? t('skills.workerDefinitions') : t('skills.definitions');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{t('skills.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('skills.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />{t('common.refresh')}</Button>
          <Button onClick={() => { setSkillForm(emptySkill()); setSkillModalOpen(true); }}><Plus className="h-4 w-4" />{workerTab ? t('skills.addWorkerSkill') : t('skills.addSkill')}</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map(([tabPath, label]) => <Button key={tabPath} variant={scope === SCOPE_BY_PATH[tabPath] ? 'secondary' : 'ghost'} onClick={() => navigate(`/master-data/skills/${tabPath}`)}>{label}</Button>)}
      </div>

      {workerTab ? (
        <Card className="space-y-4 p-5">
          <div><h2 className="font-bold">{scopeLabel}</h2><p className="text-xs text-muted-foreground">{t('skills.workerScopeHelp')}</p></div>
          <div className="space-y-2">
            {loading ? <p>{t('common.loading')}</p> : skills.map((skill) => <div key={skill.master_id} className="flex items-center justify-between gap-3 rounded border border-border p-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openAssignments(skill)}><div className="font-semibold">{text(skill.name)}</div><div className="font-mono text-xs text-muted-foreground">{skill.code} · {skill.active_assignment_count || 0} {t('skills.assignments')}</div></button><span className="text-xs text-muted-foreground">{skill.lifecycle_status}</span><Button type="button" variant="ghost" size="icon" title={t('skills.addSkill')} onClick={() => void openEdit(skill)}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" title={t('skills.deactivate')} onClick={() => setDeactivateTarget(skill)}><UserMinus className="h-4 w-4" /></Button></div>)}
          </div>
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          <div><h2 className="font-bold">{scopeLabel}</h2><p className="text-xs text-muted-foreground">{t('skills.definitionsHelp')}</p></div>
          <div className="space-y-2">{loading ? <p>{t('common.loading')}</p> : skills.map((skill) => <div key={skill.master_id} className="flex items-center justify-between gap-3 rounded border border-border p-3"><div className="min-w-0"><div className="font-semibold">{text(skill.name)}</div><div className="text-xs text-muted-foreground">{text(skill.description) || t('common.notAvailable')}</div><div className="font-mono text-xs text-muted-foreground">{skill.code}</div></div><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{skill.minimum_level || 'Basic'}</span><Button type="button" variant="ghost" size="icon" title={t('skills.addSkill')} onClick={() => void openEdit(skill)}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" title={t('skills.deactivate')} onClick={() => setDeactivateTarget(skill)}><UserMinus className="h-4 w-4" /></Button></div></div>)}</div>
        </Card>
      )}

      <Modal open={skillModalOpen} title={workerTab ? t('skills.addWorkerSkill') : t('skills.addSkill')} onClose={() => setSkillModalOpen(false)} footerLeft={<Button type="button" variant="outline" onClick={() => setSkillModalOpen(false)}>{t('common.cancel')}</Button>} footer={<Button type="submit" form="skill-create-form"><Plus className="h-4 w-4" />{workerTab ? t('skills.addWorkerSkill') : t('skills.addSkill')}</Button>} className="max-w-xl">
        <form id="skill-create-form" onSubmit={saveSkill} className="space-y-4"><LocalizedTextInput label={t('common.name')} required value={skillForm.name} onChange={(value) => setSkillForm({ ...skillForm, name: value })} /><LocalizedTextInput label={t('resourceFoundation.description')} value={skillForm.description} onChange={(value) => setSkillForm({ ...skillForm, description: value })} /><SelectBase value={skillForm.minimum_level} onValueChange={(value) => setSkillForm({ ...skillForm, minimum_level: value })} options={['L1', 'L2', 'L3'].map((value) => ({ value, label: value }))} label={t('common.level')} /></form>
      </Modal>
      <Modal open={skillEditOpen} title={t('skills.edit')} onClose={() => setSkillEditOpen(false)} footerLeft={<Button type="button" variant="outline" onClick={() => setSkillEditOpen(false)}>{t('common.cancel')}</Button>} footer={<Button type="submit" form="skill-edit-form"><Pencil className="h-4 w-4" />{t('skills.saved')}</Button>} className="max-w-2xl">
        <form id="skill-edit-form" onSubmit={saveEditSkill} className="space-y-4">
          <div className="rounded border border-border bg-muted/30 p-3 text-sm"><div className="font-semibold">{selectedSkill ? text(selectedSkill.name) : t('skills.addSkill')}</div><div className="font-mono text-xs text-muted-foreground">{selectedSkill?.code}</div><p className="mt-2 text-xs text-muted-foreground">{t('skills.referenced')}</p></div>
          <LocalizedTextInput label={t('common.name')} required value={skillForm.name} onChange={(value) => setSkillForm({ ...skillForm, name: value })} />
          <LocalizedTextInput label={t('resourceFoundation.description')} value={skillForm.description} onChange={(value) => setSkillForm({ ...skillForm, description: value })} />
          <SelectBase value={skillForm.minimum_level} onValueChange={(value) => setSkillForm({ ...skillForm, minimum_level: value })} options={['L1', 'L2', 'L3'].map((value) => ({ value, label: value }))} label={t('common.level')} />
          <div className="rounded border border-border p-3"><div className="mb-2 text-sm font-semibold">{t('skills.assignments')}</div>{dependencyLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><div>{t('skills.assignments')}: {(dependencies?.resource_assignments || 0) + (dependencies?.employee_assignments || 0)}</div><div>{t('skills.operationRequirements')}: {dependencies?.operation_skill_requirements || 0}</div><div>{t('skills.productionStandards')}: {dependencies?.production_standards || 0}</div><div>{t('common.status')}: {selectedSkill?.lifecycle_status}</div></div>}</div>
        </form>
      </Modal>
      <Modal open={skillDetailOpen} title={selectedSkill ? text(selectedSkill.name) : t('skills.selectWorkerSkill')} onClose={() => setSkillDetailOpen(false)} className="max-w-2xl">
          <p className="mb-5 text-sm text-muted-foreground">{t('skills.workerScopeHelp')}</p>
          {selectedSkill && <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded border border-border p-3"><div className="text-xs text-muted-foreground">{t('common.code')}</div><div className="font-mono text-sm">{selectedSkill.code}</div></div><div className="rounded border border-border p-3"><div className="text-xs text-muted-foreground">{t('common.level')}</div><div className="text-sm">{selectedSkill.minimum_level || 'Basic'}</div></div><div className="rounded border border-border p-3"><div className="text-xs text-muted-foreground">{t('common.status')}</div><div className="text-sm">{selectedSkill.lifecycle_status}</div></div></div><div><div className="text-sm font-semibold">{t('resourceFoundation.description')}</div><p className="mt-1 text-sm text-muted-foreground">{text(selectedSkill.description) || t('common.notAvailable')}</p></div><div><div className="mb-2 text-sm font-semibold">{t('skills.assignments')}</div>{assignments.length ? <div className="space-y-2">{assignments.map((assignment) => <div key={`${assignment.employee_id}-${assignment.effective_from}`} className="rounded border border-border p-3"><div className="font-semibold">{text(assignment.employee_name) || assignment.employee_code}</div><div className="text-xs text-muted-foreground">{assignment.employee_code} · {assignment.level} · {assignment.qualification_status} · {assignment.active_flag ? t('skills.activeAssignment') : t('skills.endedAssignment')}</div></div>)}</div> : <p className="text-sm text-muted-foreground">{t('common.empty')}</p>}</div></div>}
      </Modal>
      <Confirmation open={Boolean(deactivateTarget)} title={t('skills.deactivate')} description={t('skills.deactivateConfirm')} confirmLabel={t('skills.deactivate')} cancelLabel={t('common.cancel')} destructive onClose={() => setDeactivateTarget(null)} onConfirm={() => { const target = deactivateTarget; setDeactivateTarget(null); if (target) void deactivate(target); }} />
    </div>
  );
}
