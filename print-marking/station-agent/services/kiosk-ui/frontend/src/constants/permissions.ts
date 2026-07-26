/** Permission codes used in RBAC */
export const PERMISSIONS = {
  JOB_VIEW: 'JOB_VIEW',
  JOB_REPROCESS: 'JOB_REPROCESS',
  USER_MANAGE: 'USER_MANAGE',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
} as const

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS]

/** Vietnamese labels for permission codes */
export const PERMISSION_LABELS: Record<string, string> = {
  [PERMISSIONS.JOB_VIEW]: 'Xem công việc',
  [PERMISSIONS.JOB_REPROCESS]: 'Làm lại / Xử lý lại sản phẩm',
  [PERMISSIONS.USER_MANAGE]: 'Quản lý người dùng',
  [PERMISSIONS.SYSTEM_ADMIN]: 'Toàn quyền hệ thống',
}
