import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { PageHeader, PermissionGuard, Spinner } from '@/components/common'
import { DataTable } from '@/components/common/DataTable'
import { apiGet, apiPost, apiPut, apiDelete } from '@/services/api-client'
import { PERMISSIONS } from '@/utils/permissions'
import type { ColumnDef } from '@tanstack/react-table'
import type { SkillDTO } from '@/types/domain'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function SkillsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Modal states
  const [activeModal, setActiveModal] = React.useState<'create' | 'edit' | null>(null)
  const [selectedSkill, setSelectedSkill] = React.useState<SkillDTO | null>(null)
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({})
  const [formData, setFormData] = React.useState({
    code: '',
    name: '',
    description: '',
  })

  // Queries
  const { data: skillRes, isLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiGet<SkillDTO[]>('/workforce/skills'),
  })

  const skills = skillRes?.data ?? []

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiPost('/workforce/skills', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      closeModal()
    },
    onError: (err: any) => {
      const responseErrors = err?.response?.data?.error?.details || {}
      setFormErrors({
        ...responseErrors,
        _global: err?.response?.data?.error?.message || 'Failed to create skill definition',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData & { id: string }) =>
      apiPut(`/workforce/skills/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      closeModal()
    },
    onError: (err: any) => {
      const responseErrors = err?.response?.data?.error?.details || {}
      setFormErrors({
        ...responseErrors,
        _global: err?.response?.data?.error?.message || 'Failed to update skill definition',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/workforce/skills/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error?.message || 'Failed to delete skill definition')
    },
  })

  // Handlers
  const openCreateModal = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
    })
    setFormErrors({})
    setActiveModal('create')
  }

  const openEditModal = (skill: SkillDTO) => {
    setSelectedSkill(skill)
    setFormData({
      code: skill.code,
      name: skill.name,
      description: skill.description || '',
    })
    setFormErrors({})
    setActiveModal('edit')
  }

  const closeModal = () => {
    setActiveModal(null)
    setSelectedSkill(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormErrors({})

    const validationErrors: Record<string, string> = {}
    if (!formData.code.trim()) validationErrors.code = 'Code is required'
    if (!formData.name.trim()) validationErrors.name = 'Name is required'

    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

    if (activeModal === 'create') {
      createMutation.mutate(formData)
    } else if (activeModal === 'edit' && selectedSkill) {
      updateMutation.mutate({ ...formData, id: selectedSkill.id })
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this skill definition?')) {
      deleteMutation.mutate(id)
    }
  }

  // Columns definition
  const columns: ColumnDef<SkillDTO>[] = [
    {
      accessorKey: 'code',
      header: t('common.code'),
      cell: (info) => <span className="font-mono font-bold text-slate-800">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
      cell: (info) => <span className="font-semibold text-slate-700">{t(`skills.${info.getValue() as string}`, { defaultValue: info.getValue() as string })}</span>,
    },
    {
      accessorKey: 'description',
      header: t('common.description'),
      cell: (info) => <span>{t(`skills_desc.${info.getValue() as string}`, { defaultValue: info.getValue() as string })}</span>,
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
        title={t('skills_module.title')}
        description={t('skills_module.subtitle')}
      >
        <PermissionGuard permission={PERMISSIONS.WORKER_CREATE}>
          <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2 text-xs">
            <Plus size={16} />
            {t('skills_module.addSkill')}
          </button>
        </PermissionGuard>
      </PageHeader>

      <div className="card bg-white p-6">
        <DataTable
          data={skills}
          columns={columns}
          loading={isLoading}
          emptyMessage={t('skills_module.emptyMessage')}
        />
      </div>

      {/* Radix Dialog Modal */}
      <Dialog open={Boolean(activeModal)} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeModal === 'create' ? 'Create Skill Definition' : 'Edit Skill Definition'}
            </DialogTitle>
            <DialogDescription>
              Configure qualification codes and descriptors for assignment mapping.
            </DialogDescription>
          </DialogHeader>

          {formErrors._global && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg text-xs">
              {formErrors._global}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 my-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Skill Code *</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-400 font-mono"
                value={formData.code}
                disabled={activeModal === 'edit'}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g. PM-1"
                required
              />
              {formErrors.code && <span className="text-xs text-rose-600 font-medium">{formErrors.code}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Skill Name *</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Print Marking Operation"
                required
              />
              {formErrors.name && <span className="text-xs text-rose-600 font-medium">{formErrors.name}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Description</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Skill description"
              />
            </div>

            <DialogFooter className="pt-2">
              <button type="button" className="btn btn-secondary text-xs" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn btn-primary text-xs">Save Skill</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
