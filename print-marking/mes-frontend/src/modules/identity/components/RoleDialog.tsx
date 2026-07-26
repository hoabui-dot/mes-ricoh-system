import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X, Shield, CheckSquare, Square, ChevronDown, ChevronRight } from 'lucide-react'
import { roleService, permissionService } from '@/services/identity.service'
import type { RoleDTO, PermissionGroupDTO } from '@/types'

interface RoleDialogProps {
  isOpen: boolean
  role?: RoleDTO | null
  onClose: () => void
}

export function RoleDialog({ isOpen, role, onClose }: RoleDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEditing = Boolean(role)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPermIds, setSelectedPermIds] = useState<string[]>([])
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  // Fetch permissions grouped by module
  const { data: permRes, isLoading: isPermsLoading } = useQuery({
    queryKey: ['permissions-grouped'],
    queryFn: async () => {
      const res = await permissionService.listGrouped()
      return res.data ?? []
    },
    enabled: isOpen,
  })

  const groups: PermissionGroupDTO[] = permRes ?? []

  useEffect(() => {
    if (isOpen) {
      setError(null)
      if (role) {
        setName(role.name || '')
        setCode(role.code || '')
        setDescription(role.description || '')
        setSelectedPermIds(role.permissions?.map((p) => p.id) || [])
      } else {
        setName('')
        setCode('')
        setDescription('')
        setSelectedPermIds([])
      }
    }
  }, [isOpen, role])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error(t('roles.nameLabel'))
      }
      if (selectedPermIds.length === 0) {
        throw new Error(t('roles.permsLabel'))
      }

      if (isEditing && role) {
        return roleService.update(role.id, {
          name: name.trim(),
          description: description.trim(),
          permission_ids: selectedPermIds,
        })
      } else {
        return roleService.create({
          name: name.trim(),
          code: code.trim() || undefined,
          description: description.trim(),
          permission_ids: selectedPermIds,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || err?.message || t('common.error'))
    },
  })

  if (!isOpen) return null

  const togglePerm = (permId: string) => {
    setSelectedPermIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    )
  }

  const toggleModule = (group: PermissionGroupDTO) => {
    const groupPermIds = group.permissions.map((p) => p.id)
    const allSelected = groupPermIds.every((id) => selectedPermIds.includes(id))

    if (allSelected) {
      setSelectedPermIds((prev) => prev.filter((id) => !groupPermIds.includes(id)))
    } else {
      setSelectedPermIds((prev) => Array.from(new Set([...prev, ...groupPermIds])))
    }
  }

  const toggleCollapse = (moduleName: string) => {
    setCollapsedModules((prev) => ({ ...prev, [moduleName]: !prev[moduleName] }))
  }

  return (
    <div className="dialog-overlay">
      <div
        className="dialog-content"
        style={{
          maxWidth: 720,
          width: '90vw',
          maxHeight: '88vh',
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
                background: 'rgba(249,115,22,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={18} style={{ color: '#F97316' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                {isEditing ? `${t('roles.editTitle')}: ${role?.name}` : t('roles.createTitle')}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {isEditing ? t('roles.editSub') : t('roles.subtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: 6, borderRadius: 6, color: '#64748B' }}
            id="close-role-modal"
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label required" style={{ fontSize: 13, fontWeight: 500 }}>
                {t('roles.roleName')}
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Quality Auditor"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={role?.is_system}
                id="role-name-input"
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 500 }}>
                {t('roles.roleCode')}
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. quality_auditor"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isEditing || role?.is_system}
                id="role-code-input"
              />
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, display: 'block' }}>
                {isEditing ? t('roles.codeHelp') : t('roles.codeHelp')}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="form-label" style={{ fontSize: 13, fontWeight: 500 }}>
              {t('roles.description')}
            </label>
            <textarea
              className="form-input"
              rows={2}
              placeholder={t('roles.descLabel')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              id="role-description-input"
            />
          </div>

          {/* Module-Grouped Permission Checkbox Tree */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label className="form-label required" style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                {t('roles.permsLabel')} ({selectedPermIds.length} {t('roles.permsSelected')})
              </label>

              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{ fontSize: 12, color: '#2563EB' }}
                onClick={() => {
                  const allIds = groups.flatMap((g) => g.permissions.map((p) => p.id))
                  if (selectedPermIds.length === allIds.length) {
                    setSelectedPermIds([])
                  } else {
                    setSelectedPermIds(allIds)
                  }
                }}
                id="select-all-perms-btn"
              >
                {selectedPermIds.length === groups.flatMap((g) => g.permissions).length ? t('roles.deselectAllPerms') : t('roles.selectAllPerms')}
              </button>
            </div>

            {isPermsLoading ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                {t('common.loading')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {groups.map((group) => {
                  const groupPermIds = group.permissions.map((p) => p.id)
                  const selectedInGroupCount = groupPermIds.filter((id) => selectedPermIds.includes(id)).length
                  const allSelectedInGroup = groupPermIds.length > 0 && selectedInGroupCount === groupPermIds.length
                  const isCollapsed = Boolean(collapsedModules[group.module])

                  return (
                    <div
                      key={group.module}
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: '#FFFFFF',
                      }}
                    >
                      {/* Module Header */}
                      <div
                        style={{
                          padding: '10px 14px',
                          background: '#F8FAFC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: isCollapsed ? 'none' : '1px solid var(--color-border)',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                        onClick={() => toggleCollapse(group.module)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#64748B' }}>
                            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
                            {t('permissionsList.modules.' + group.module, group.module)}
                          </span>
                          <span
                            className="badge"
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: selectedInGroupCount > 0 ? 'rgba(37,99,235,0.1)' : '#F1F5F9',
                              color: selectedInGroupCount > 0 ? '#2563EB' : '#64748B',
                              fontWeight: 500,
                            }}
                          >
                            {selectedInGroupCount}/{group.permissions.length}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleModule(group)
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            color: allSelectedInGroup ? '#2563EB' : '#64748B',
                            fontWeight: 500,
                          }}
                          id={`select-module-${group.module.toLowerCase()}`}
                        >
                          {allSelectedInGroup ? <CheckSquare size={16} color="#2563EB" /> : <Square size={16} />}
                          <span>{allSelectedInGroup ? t('common.selected') : t('roles.selectModule')}</span>
                        </button>
                      </div>

                      {/* Module Permissions Checklist */}
                      {!isCollapsed && (
                        <div
                          style={{
                            padding: 12,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 10,
                          }}
                        >
                          {group.permissions.map((perm) => {
                            const isChecked = selectedPermIds.includes(perm.id)
                            return (
                              <div
                                key={perm.id}
                                onClick={() => togglePerm(perm.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 10,
                                  padding: '8px 10px',
                                  borderRadius: 6,
                                  border: `1px solid ${isChecked ? 'rgba(37,99,235,0.3)' : 'transparent'}`,
                                  backgroundColor: isChecked ? 'rgba(37,99,235,0.04)' : '#FAFBFD',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  style={{ marginTop: 2, cursor: 'pointer' }}
                                  id={`perm-check-${perm.id}`}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: isChecked ? '#1D4ED8' : '#334155' }}>
                                    {t('permissionsList.displayNames.' + perm.name, perm.display_name || perm.name)}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, wordBreak: 'break-word' }}>
                                    {t('permissionsList.descriptions.' + perm.name, perm.description || perm.name)}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
            id="cancel-role-dialog-btn"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            className="btn btn-primary btn-sm"
            disabled={saveMutation.isPending}
            id="save-role-dialog-btn"
          >
            {saveMutation.isPending ? t('common.loading') : isEditing ? t('common.save') : t('roles.addRole')}
          </button>
        </div>
      </div>
    </div>
  )
}
