import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Shield } from 'lucide-react'
import { PageHeader, PermissionGuard } from '@/components/common'
import { DataTable } from '@/components/common/DataTable'
import { StatusBadge } from '@/components/industrial/StatusComponents'
import { userService } from '@/services/identity.service'
import { PERMISSIONS } from '@/utils/permissions'
import { formatRelative } from '@/utils/date'
import { UserRolesDialog } from '../components/UserRolesDialog'
import type { ColumnDef } from '@tanstack/react-table'
import type { UserDTO } from '@/types'

export function UsersPage() {
  const { t } = useTranslation()
  const [selectedUser, setSelectedUser] = useState<UserDTO | null>(null)
  const [isRolesDialogOpen, setIsRolesDialogOpen] = useState(false)

  const { data: res, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const resp = await userService.list()
      return resp.data ?? []
    },
  })

  const users: UserDTO[] = Array.isArray(res) ? res : []

  const handleManageRoles = (user: UserDTO) => {
    setSelectedUser(user)
    setIsRolesDialogOpen(true)
  }

  const columns: ColumnDef<UserDTO, unknown>[] = [
    {
      id: 'avatar',
      header: '',
      size: 44,
      cell: ({ row }) => (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #F97316, #EA580C)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'white',
        }}>
          {row.original.full_name?.[0] || 'U'}
        </div>
      ),
    },
    {
      accessorKey: 'full_name',
      header: t('common.name'),
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1E293B' }}>{row.original.full_name || row.original.username}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.original.email}</div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
    },
    {
      id: 'roles',
      header: t('nav.roles'),
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(row.original.roles ?? []).map((r) => (
            <span
              key={r.id}
              className="badge"
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                background: r.code === 'super_admin' ? '#EFF6FF' : '#F1F5F9',
                color: r.code === 'super_admin' ? '#1D4ED8' : '#334155',
                border: r.code === 'super_admin' ? '1px solid #BFDBFE' : 'none',
                fontWeight: 500,
              }}
            >
              {r.name}
            </span>
          ))}

          <PermissionGuard permission={PERMISSIONS.ROLE_ASSIGN}>
            <button
              type="button"
              onClick={() => handleManageRoles(row.original)}
              className="btn btn-ghost btn-xs"
              style={{ padding: '2px 6px', borderRadius: 4, color: '#2563EB', fontSize: 11 }}
              id={`manage-roles-user-${row.original.id}`}
            >
              <Shield size={12} style={{ marginRight: 3 }} /> Manage
            </button>
          </PermissionGuard>
        </div>
      ),
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
  ]

  return (
    <div className="fade-in">
      <PageHeader
        title={t('users.title')}
        description={t('users.subtitle')}
      >
        <PermissionGuard permission={PERMISSIONS.USER_CREATE}>
          <button className="btn btn-primary btn-sm" id="create-user-btn">
            <Plus size={14} />
            {t('users.addUser')}
          </button>
        </PermissionGuard>
      </PageHeader>

      <div className="card" style={{ overflow: 'hidden' }}>
        <DataTable
          data={users}
          columns={columns}
          loading={isLoading}
          emptyMessage={t('users.emptyMessage')}
          emptyDescription={t('users.emptyDescription')}
          searchPlaceholder={t('users.searchPlaceholder')}
        />
      </div>

      <UserRolesDialog
        isOpen={isRolesDialogOpen}
        user={selectedUser}
        onClose={() => {
          setIsRolesDialogOpen(false)
          setSelectedUser(null)
        }}
      />
    </div>
  )
}
