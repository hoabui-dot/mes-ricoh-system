import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { PageHeader, PermissionGuard, Spinner } from '@/components/common'
import { DataTable } from '@/components/common/DataTable'
import { apiGet, apiPost, apiPut, apiDelete } from '@/services/api-client'
import { PERMISSIONS } from '@/utils/permissions'
import type { ColumnDef } from '@tanstack/react-table'
import type { TeamDTO, WorkshopDTO, WorkerDTO } from '@/types/domain'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function TeamsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Modal states
  const [activeModal, setActiveModal] = React.useState<'create' | 'edit' | null>(null)
  const [selectedTeam, setSelectedTeam] = React.useState<TeamDTO | null>(null)
  const [workshopId, setWorkshopId] = React.useState('')
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({})
  const [formData, setFormData] = React.useState({
    code: '',
    name: '',
    description: '',
    leader_id: '',
    status: 'active',
  })

  // Queries
  const { data: teamRes, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiGet<TeamDTO[]>('/workforce/teams'),
  })

  const { data: wsRes } = useQuery({
    queryKey: ['workshops'],
    queryFn: () => apiGet<WorkshopDTO[]>('/workshops'),
  })

  const { data: workerRes } = useQuery({
    queryKey: ['workers'],
    queryFn: () => apiGet<WorkerDTO[]>('/workers?page_size=1000'),
  })

  const teams = teamRes?.data ?? []
  const workshops = wsRes?.data ?? []
  const workers = workerRes?.data ?? []

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: typeof formData & { workshop_id: string }) =>
      apiPost('/workforce/teams', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      closeModal()
    },
    onError: (err: any) => {
      const responseErrors = err?.response?.data?.error?.details || {}
      setFormErrors({
        ...responseErrors,
        _global: err?.response?.data?.error?.message || 'Failed to create team',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData & { id: string }) =>
      apiPut(`/workforce/teams/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      closeModal()
    },
    onError: (err: any) => {
      const responseErrors = err?.response?.data?.error?.details || {}
      setFormErrors({
        ...responseErrors,
        _global: err?.response?.data?.error?.message || 'Failed to update team',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/workforce/teams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error?.message || 'Failed to delete team')
    },
  })

  // Handlers
  const openCreateModal = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      leader_id: '',
      status: 'active',
    })
    setWorkshopId('')
    setFormErrors({})
    setActiveModal('create')
  }

  const openEditModal = (team: TeamDTO) => {
    setSelectedTeam(team)
    setFormData({
      code: team.code,
      name: team.name,
      description: team.description || '',
      leader_id: team.leader_id || '',
      status: team.status || 'active',
    })
    setWorkshopId(team.workshop_id || '')
    setFormErrors({})
    setActiveModal('edit')
  }

  const closeModal = () => {
    setActiveModal(null)
    setSelectedTeam(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormErrors({})

    const validationErrors: Record<string, string> = {}
    if (!formData.code.trim()) validationErrors.code = 'Code is required'
    if (!formData.name.trim()) validationErrors.name = 'Name is required'
    if (activeModal === 'create' && !workshopId) validationErrors.workshop_id = 'Workshop is required'

    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

    if (activeModal === 'create') {
      createMutation.mutate({ ...formData, workshop_id: workshopId })
    } else if (activeModal === 'edit' && selectedTeam) {
      updateMutation.mutate({ ...formData, id: selectedTeam.id })
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this team?')) {
      deleteMutation.mutate(id)
    }
  }

  // Columns definition
  const columns: ColumnDef<TeamDTO>[] = [
    {
      accessorKey: 'code',
      header: t('common.code'),
      cell: (info) => <span className="font-mono font-bold text-slate-800">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
      cell: (info) => <span className="font-semibold text-slate-700">{t(`team_values.${info.getValue() as string}`, { defaultValue: info.getValue() as string })}</span>,
    },
    {
      accessorKey: 'workshop_name',
      header: t('teams.workshop', { defaultValue: 'Workshop' }),
      cell: (info) => {
        const wName = info.getValue() as string
        return wName ? <span>{t(`workshops.${wName}`, { defaultValue: wName })}</span> : <span className="text-slate-400">—</span>
      },
    },
    {
      accessorKey: 'leader_name',
      header: t('teams.supervisor'),
      cell: (info) => info.getValue() as string || <span className="text-slate-400">—</span>,
    },
    {
      accessorKey: 'description',
      header: t('common.description'),
      cell: (info) => <span>{t(`teams_desc.${info.getValue() as string}`, { defaultValue: info.getValue() as string })}</span>,
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: (info) => {
        const val = info.getValue() as string
        return (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            val === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-600'
          }`}>
            {val}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="flex justify-end gap-2">
            <PermissionGuard permission={PERMISSIONS.WORKER_UPDATE}>
              <button
                onClick={() => openEditModal(row)}
                className="p-1 hover:text-orange-500 rounded transition-all"
                title="Edit"
              >
                <Edit size={14} />
              </button>
            </PermissionGuard>
            <PermissionGuard permission={PERMISSIONS.WORKER_DELETE}>
              <button
                onClick={() => handleDelete(row.id)}
                className="p-1 hover:text-rose-600 rounded transition-all"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </PermissionGuard>
          </div>
        )
      },
    },
  ]

  return (
    <div className="fade-in max-w-7xl mx-auto p-4 space-y-6">
      <PageHeader
        title={t('teams.title')}
        description={t('teams.subtitle')}
      >
        <PermissionGuard permission={PERMISSIONS.WORKER_CREATE}>
          <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2 text-xs">
            <Plus size={16} />
            {t('teams.addTeam')}
          </button>
        </PermissionGuard>
      </PageHeader>

      <div className="card bg-white p-6">
        <DataTable
          columns={columns}
          data={teams}
          loading={isLoading}
          emptyMessage={t('teams.emptyMessage')}
        />
      </div>

      {/* Radix Dialog Modal */}
      <Dialog open={Boolean(activeModal)} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeModal === 'create' ? 'Create Team' : 'Edit Team'}
            </DialogTitle>
            <DialogDescription>
              Configure work crew assignments and designate team leaders.
            </DialogDescription>
          </DialogHeader>

          {formErrors._global && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg text-xs">
              {formErrors._global}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 my-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Team Code *</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-400 font-mono"
                value={formData.code}
                disabled={activeModal === 'edit'}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g. TEAM-A"
                required
              />
              {formErrors.code && <span className="text-xs text-rose-600 font-medium">{formErrors.code}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Team Name *</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Assembly Team Alpha"
                required
              />
              {formErrors.name && <span className="text-xs text-rose-600 font-medium">{formErrors.name}</span>}
            </div>

            {activeModal === 'create' && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Workshop *</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
                  value={workshopId}
                  onChange={(e) => setWorkshopId(e.target.value)}
                  required
                >
                  <option value="">— Select Workshop —</option>
                  {workshops.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {formErrors.workshop_id && <span className="text-xs text-rose-600 font-medium">{formErrors.workshop_id}</span>}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Team Leader</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
                value={formData.leader_id}
                onChange={(e) => setFormData({ ...formData, leader_id: e.target.value })}
              >
                <option value="">— Select Leader —</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.first_name} {w.last_name} ({w.employee_code})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Description</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Team description"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <button type="button" className="btn btn-secondary text-xs" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn btn-primary text-xs">Save Team</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
