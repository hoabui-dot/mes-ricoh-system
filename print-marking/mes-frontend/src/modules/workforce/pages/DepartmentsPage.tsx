import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { PageHeader, PermissionGuard, Spinner } from '@/components/common'
import { DataTable } from '@/components/common/DataTable'
import { apiGet, apiPost, apiPut, apiDelete } from '@/services/api-client'
import { PERMISSIONS } from '@/utils/permissions'
import type { ColumnDef } from '@tanstack/react-table'
import type { DepartmentDTO } from '@/types/domain'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface UserDTO {
  id: string
  username: string
  full_name: string
  email: string
}

export function DepartmentsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Modal states
  const [activeModal, setActiveModal] = React.useState<'create' | 'edit' | null>(null)
  const [selectedDept, setSelectedDept] = React.useState<DepartmentDTO | null>(null)
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({})
  const [formData, setFormData] = React.useState({
    code: '',
    name: '',
    description: '',
    manager_id: '',
    status: 'active',
  })

  // Queries
  const { data: deptRes, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiGet<DepartmentDTO[]>('/workforce/departments'),
  })

  const { data: userRes } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<UserDTO[]>('/identity/users?page_size=1000'),
  })

  const departments = deptRes?.data ?? []
  const users = userRes?.data ?? []

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiPost('/workforce/departments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      closeModal()
    },
    onError: (err: any) => {
      const responseErrors = err?.response?.data?.error?.details || {}
      setFormErrors({
        ...responseErrors,
        _global: err?.response?.data?.error?.message || 'Failed to create department',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData & { id: string }) =>
      apiPut(`/workforce/departments/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      closeModal()
    },
    onError: (err: any) => {
      const responseErrors = err?.response?.data?.error?.details || {}
      setFormErrors({
        ...responseErrors,
        _global: err?.response?.data?.error?.message || 'Failed to update department',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/workforce/departments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error?.message || 'Failed to delete department')
    },
  })

  // Handlers
  const openCreateModal = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      manager_id: '',
      status: 'active',
    })
    setFormErrors({})
    setActiveModal('create')
  }

  const openEditModal = (dept: DepartmentDTO) => {
    setSelectedDept(dept)
    setFormData({
      code: dept.code,
      name: dept.name,
      description: dept.description || '',
      manager_id: dept.manager_id || '',
      status: dept.status || 'active',
    })
    setFormErrors({})
    setActiveModal('edit')
  }

  const closeModal = () => {
    setActiveModal(null)
    setSelectedDept(null)
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
    } else if (activeModal === 'edit' && selectedDept) {
      updateMutation.mutate({ ...formData, id: selectedDept.id })
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this department?')) {
      deleteMutation.mutate(id)
    }
  }

  // Columns definition
  const columns: ColumnDef<DepartmentDTO>[] = [
    {
      accessorKey: 'code',
      header: t('common.code'),
      cell: (info) => <span className="font-mono font-bold text-slate-800">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
      cell: (info) => <span className="font-semibold text-slate-700">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'description',
      header: t('common.description'),
    },
    {
      accessorKey: 'manager_name',
      header: t('departments.manager'),
      cell: (info) => info.getValue() as string || <span className="text-slate-400">—</span>,
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
        title={t('departments.title')}
        description={t('departments.subtitle')}
      >
        <PermissionGuard permission={PERMISSIONS.WORKER_CREATE}>
          <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2 text-xs">
            <Plus size={16} />
            {t('departments.addDept')}
          </button>
        </PermissionGuard>
      </PageHeader>

      <div className="card bg-white p-6">
        <DataTable
          data={departments}
          columns={columns}
          loading={isLoading}
          emptyMessage={t('departments.emptyMessage')}
        />
      </div>

      {/* Radix Dialog Modal */}
      <Dialog open={Boolean(activeModal)} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeModal === 'create' ? 'Create Department' : 'Edit Department'}
            </DialogTitle>
            <DialogDescription>
              Configure organizational department settings and supervisors.
            </DialogDescription>
          </DialogHeader>

          {formErrors._global && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg text-xs">
              {formErrors._global}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 my-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Department Code *</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-400 font-mono"
                value={formData.code}
                disabled={activeModal === 'edit'}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g. DEPT-QA"
                required
              />
              {formErrors.code && <span className="text-xs text-rose-600 font-medium">{formErrors.code}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Department Name *</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Quality Assurance"
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
                placeholder="Department description"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Manager</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
                value={formData.manager_id}
                onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
              >
                <option value="">— Select Manager —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>
                ))}
              </select>
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
              <button type="submit" className="btn btn-primary text-xs">Save Department</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
