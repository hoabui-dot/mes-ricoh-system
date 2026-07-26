import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Key, Layers } from 'lucide-react'
import { PageHeader, PermissionGuard } from '@/components/common'
import { DataTable } from '@/components/common/DataTable'
import { permissionService } from '@/services/identity.service'
import { PERMISSIONS } from '@/utils/permissions'
import type { ColumnDef } from '@tanstack/react-table'
import type { PermissionDTO } from '@/types'

export function PermissionsPage() {
  const { t } = useTranslation()

  const { data: res, isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const resp = await permissionService.list()
      return resp.data ?? []
    },
  })

  const permissions: PermissionDTO[] = Array.isArray(res) ? res : []

  const columns: ColumnDef<PermissionDTO, unknown>[] = [
    {
      id: 'icon',
      header: '',
      size: 44,
      cell: () => (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(249,115,22,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Key size={16} style={{ color: '#F97316' }} />
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: t('permissions.permHeader'),
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1E293B', fontSize: 13 }}>
            {t('permissionsList.displayNames.' + row.original.name, row.original.display_name || row.original.name)}
          </div>
          <code
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              background: 'rgba(249,115,22,0.08)',
              color: '#EA580C',
              padding: '1px 6px',
              borderRadius: 4,
            }}
          >
            {row.original.name}
          </code>
        </div>
      ),
    },
    {
      accessorKey: 'module',
      header: t('permissions.moduleHeader'),
      cell: ({ getValue }) => (
        <span
          className="badge"
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 12,
            background: '#F1F5F9',
            color: '#334155',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Layers size={12} style={{ color: '#64748B' }} />
          {t('permissionsList.modules.' + getValue<string>(), getValue<string>() || 'Identity')}
        </span>
      ),
    },
    {
      accessorKey: 'resource',
      header: t('permissions.resourceHeader'),
      cell: ({ getValue }) => (
        <span
          className="badge"
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 12,
            background: '#F8FAFC',
            color: '#475569',
            border: '1px solid #E2E8F0',
          }}
        >
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'action',
      header: t('permissions.actionHeader'),
      cell: ({ getValue }) => (
        <span
          className="badge"
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 12,
            background: '#EFF6FF',
            color: '#1D4ED8',
            border: '1px solid #BFDBFE',
            fontWeight: 500,
          }}
        >
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'description',
      header: t('permissions.descHeader'),
      cell: ({ row }) => (
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
          {t('permissionsList.descriptions.' + row.original.name, row.original.description || t('common.noData'))}
        </span>
      ),
    },
  ]

  return (
    <div className="fade-in">
      <PageHeader title={t('permissions.title')} description={t('permissions.subtitle')}>
        <PermissionGuard permission={PERMISSIONS.PERMISSION_CREATE}>
          <button className="btn btn-primary btn-sm" id="create-permission-btn">
            <Plus size={14} />
            {t('permissions.addPermission')}
          </button>
        </PermissionGuard>
      </PageHeader>

      <div className="card" style={{ overflow: 'hidden' }}>
        <DataTable
          data={permissions}
          columns={columns}
          loading={isLoading}
          emptyMessage={t('permissions.emptyMessage')}
          searchPlaceholder={t('permissions.searchPlaceholder')}
        />
      </div>
    </div>
  )
}
