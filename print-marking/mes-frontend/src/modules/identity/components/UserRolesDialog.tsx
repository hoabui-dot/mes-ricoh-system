import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X, Shield, CheckSquare, Square } from 'lucide-react'
import { roleService, userService } from '@/services/identity.service'
import type { UserDTO, RoleDTO } from '@/types'

interface UserRolesDialogProps {
  isOpen: boolean
  user: UserDTO | null
  onClose: () => void
}

export function UserRolesDialog({ isOpen, user, onClose }: UserRolesDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: rolesRes, isLoading: isRolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await roleService.list()
      return res.data ?? []
    },
    enabled: isOpen,
  })

  const roles: RoleDTO[] = Array.isArray(rolesRes) ? rolesRes : []

  useEffect(() => {
    if (isOpen && user) {
      setError(null)
      setSelectedRoleIds(user.roles?.map((r) => r.id) || [])
    }
  }, [isOpen, user])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) return
      return userService.assignRoles(user.id, selectedRoleIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || err?.message || t('common.error'))
    },
  })

  if (!isOpen || !user) return null

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    )
  }

  return (
    <div className="dialog-overlay">
      <div
        className="dialog-content"
        style={{
          maxWidth: 540,
          width: '90vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAFAFA',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'rgba(37,99,235,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={18} style={{ color: '#2563EB' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                {t('users.manageRolesTitle')}: {user.full_name || user.username}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {user.email}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: 6, borderRadius: 6, color: '#64748B' }}
            id="close-user-roles-modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <label className="form-label" style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'block' }}>
            {t('users.assignedRolesLabel')}
          </label>

          {isRolesLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
              {t('common.loading')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {roles.map((role) => {
                const isChecked = selectedRoleIds.includes(role.id)
                return (
                  <div
                    key={role.id}
                    onClick={() => toggleRole(role.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: `1px solid ${isChecked ? 'rgba(37,99,235,0.4)' : 'var(--color-border)'}`,
                      backgroundColor: isChecked ? 'rgba(37,99,235,0.04)' : '#FFFFFF',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: isChecked ? '#2563EB' : '#94A3B8' }}>
                        {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isChecked ? '#1D4ED8' : '#1E293B' }}>
                          {role.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>
                          {role.description ? t('roleDescriptions.' + role.description, role.description) : role.code}
                        </div>
                      </div>
                    </div>

                    <span
                      className="badge"
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: '#F1F5F9',
                        color: '#475569',
                      }}
                    >
                      {role.permissions?.length || 0} {t('roles.permissionsCount').toLowerCase()}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            background: '#FAFAFA',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            disabled={saveMutation.isPending}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            className="btn btn-primary btn-sm"
            disabled={saveMutation.isPending}
            id="save-user-roles-btn"
          >
            {saveMutation.isPending ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
