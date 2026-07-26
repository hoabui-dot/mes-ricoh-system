import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Shield, Edit2, Trash2, Users, Lock } from 'lucide-react'
import { PageHeader, PermissionGuard } from '@/components/common'
import { DataTable } from '@/components/common/DataTable'
import { roleService } from '@/services/identity.service'
import { PERMISSIONS } from '@/utils/permissions'
import { formatRelative } from '@/utils/date'
import { RoleDialog } from '../components/RoleDialog'
import type { ColumnDef } from '@tanstack/react-table'
import type { RoleDTO } from '@/types'

export function RolesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedRole, setSelectedRole] = useState<RoleDTO | null>(null)
  const [isDialogOpened, setIsDialogOpened] = useState(false)
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: res, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const resp = await roleService.list()
      return resp.data ?? []
    },
  })

  const roles: RoleDTO[] = Array.isArray(res) ? res : []

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return roleService.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setDeletingRoleId(null)
      setActionError(null)
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.error?.message || err?.message || 'Failed to delete role')
    },
  })

  const handleCreateNew = () => {
    setSelectedRole(null)
    setIsDialogOpened(true)
  }

  const handleEditRole = (role: RoleDTO) => {
    setSelectedRole(role)
    setIsDialogOpened(true)
  }

  const handleDeleteRole = (role: RoleDTO) => {
    setActionError(null)
    setDeletingRoleId(role.id)
  }

  const columns: ColumnDef<RoleDTO, unknown>[] = [
    {
      id: 'icon',
      header: '',
      size: 44,
      cell: ({ row }) => (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: row.original.is_system ? 'rgba(37,99,235,0.12)' : 'rgba(249,115,22,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Shield size={16} style={{ color: row.original.is_system ? '#2563EB' : '#F97316' }} />
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: t('roles.roleName'),
      cell: ({ row }) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#1E293B', fontSize: 13 }}>{row.original.name}</span>
            {row.original.is_system && (
              <span
                className="badge"
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: '#EFF6FF',
                  color: '#1D4ED8',
                  border: '1px solid #BFDBFE',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <Lock size={10} /> {t('roles.systemRole')}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
            {row.original.code}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: t('common.description'),
      cell: ({ getValue }) => {
        const desc = getValue<string>()
        return (
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
            {desc ? t('roleDescriptions.' + desc, desc) : t('common.noData')}
          </span>
        )
      },
    },
    {
      id: 'users_count',
      header: t('roles.usersCount'),
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569' }}>
          <Users size={14} style={{ color: '#64748B' }} />
          <span>{row.original.users_count ?? 0}</span>
        </div>
      ),
    },
    {
      id: 'permissions',
      header: t('roles.permissionsCount'),
      cell: ({ row }) => {
        const count = row.original.permissions?.length ?? 0
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              className="badge"
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                background: '#F1F5F9',
                color: '#334155',
                fontWeight: 500,
              }}
            >
              {count} {t('roles.permissionsCount').toLowerCase()}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: t('common.created'),
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {formatRelative(getValue<string>())}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      size: 100,
      cell: ({ row }) => {
        const role = row.original
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PermissionGuard permission={PERMISSIONS.ROLE_UPDATE}>
              <button
                type="button"
                onClick={() => handleEditRole(role)}
                className="btn btn-ghost btn-xs"
                title={t('common.edit')}
                style={{ padding: 5, borderRadius: 6, color: '#2563EB' }}
                id={`edit-role-${role.id}`}
              >
                <Edit2 size={14} />
              </button>
            </PermissionGuard>

            <PermissionGuard permission={PERMISSIONS.ROLE_DELETE}>
              <button
                type="button"
                onClick={() => handleDeleteRole(role)}
                className="btn btn-ghost btn-xs"
                title={role.is_system ? t('roles.systemRoleDeleteForbidden') : t('common.delete')}
                disabled={role.is_system}
                style={{
                  padding: 5,
                  borderRadius: 6,
                  color: role.is_system ? '#CBD5E1' : '#DC2626',
                  cursor: role.is_system ? 'not-allowed' : 'pointer',
                }}
                id={`delete-role-${role.id}`}
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
    <div className="fade-in">
      <PageHeader title={t('roles.title')} description={t('roles.subtitle')}>
        <PermissionGuard permission={PERMISSIONS.ROLE_CREATE}>
          <button
            onClick={handleCreateNew}
            className="btn btn-primary btn-sm"
            id="create-role-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} />
            {t('roles.addRole')}
          </button>
        </PermissionGuard>
      </PageHeader>

      {actionError && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 8,
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            style={{ border: 'none', background: 'transparent', color: '#991B1B', cursor: 'pointer' }}
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <DataTable
          data={roles}
          columns={columns}
          loading={isLoading}
          emptyMessage={t('roles.emptyMessage')}
          searchPlaceholder={t('roles.searchPlaceholder')}
        />
      </div>

      {/* Create / Edit Role Dialog */}
      <RoleDialog
        isOpen={isDialogOpened}
        role={selectedRole}
        onClose={() => {
          setIsDialogOpened(false)
          setSelectedRole(null)
        }}
      />

      {/* Delete Role Confirmation Dialog */}
      {deletingRoleId && (
        <div className="dialog-overlay">
          <div
            className="dialog-content"
            style={{
              maxWidth: 420,
              width: '90vw',
              padding: 24,
              borderRadius: 12,
              background: '#FFFFFF',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, color: '#1E293B' }}>
              {t('roles.deleteConfirmTitle')}
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
              {t('roles.deleteConfirmMsg')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDeletingRoleId(null)}
                disabled={deleteMutation.isPending}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => deleteMutation.mutate(deletingRoleId)}
                disabled={deleteMutation.isPending}
                id="confirm-delete-role-btn"
              >
                {deleteMutation.isPending ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
