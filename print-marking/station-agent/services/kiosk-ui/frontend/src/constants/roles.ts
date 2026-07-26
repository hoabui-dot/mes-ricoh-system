/** Role codes used in the system */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MEMBER: 'MEMBER',
} as const

export type RoleCode = typeof ROLES[keyof typeof ROLES]

/** Vietnamese labels for role codes */
export const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Quản trị hệ thống',
  [ROLES.MEMBER]: 'Nhân viên vận hành',
}

/**
 * Roles available when creating a new user.
 * SUPER_ADMIN is intentionally excluded — only one super admin is allowed.
 */
export const CREATABLE_ROLES: Array<{ value: string; label: string }> = [
  { value: ROLES.MEMBER, label: 'Nhân viên vận hành (Mặc định: Xem công việc)' },
]

/** Username of the protected super admin account that cannot be deleted */
export const PROTECTED_ADMIN_USERNAME = 'admin123'
