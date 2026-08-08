/** Permission codes used in RBAC */
export const PERMISSIONS = {
  JOB_VIEW: 'JOB_VIEW',
  JOB_REPROCESS: 'JOB_REPROCESS',
  USER_MANAGE: 'USER_MANAGE',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  ALARM_VIEW: 'ALARM_VIEW',
  ALARM_ACKNOWLEDGE: 'ALARM_ACKNOWLEDGE',
  ALARM_ASSIGN: 'ALARM_ASSIGN',
  ALARM_ASSIGN_OTHERS: 'ALARM_ASSIGN_OTHERS',
  ALARM_START_WORK: 'ALARM_START_WORK',
  ALARM_RETRY_DEVICE: 'ALARM_RETRY_DEVICE',
  ALARM_RETRY_JOB: 'ALARM_RETRY_JOB',
  ALARM_CLEAR: 'ALARM_CLEAR',
  ALARM_CLOSE: 'ALARM_CLOSE',
  ALARM_SUPPRESS: 'ALARM_SUPPRESS',
  ALARM_ESCALATE: 'ALARM_ESCALATE',
  ALARM_VISION_BYPASS: 'ALARM_VISION_BYPASS',
} as const

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS]

/** Vietnamese labels for permission codes */
export const PERMISSION_LABELS: Record<string, string> = {
  [PERMISSIONS.JOB_VIEW]: 'Xem công việc',
  [PERMISSIONS.JOB_REPROCESS]: 'Làm lại / Xử lý lại sản phẩm',
  [PERMISSIONS.USER_MANAGE]: 'Quản lý người dùng',
  [PERMISSIONS.SYSTEM_ADMIN]: 'Toàn quyền hệ thống',
  [PERMISSIONS.ALARM_VIEW]: 'Xem cảnh báo',
  [PERMISSIONS.ALARM_ACKNOWLEDGE]: 'Xác nhận cảnh báo',
  [PERMISSIONS.ALARM_ASSIGN]: 'Nhận xử lý cảnh báo',
  [PERMISSIONS.ALARM_ASSIGN_OTHERS]: 'Phân công cảnh báo',
  [PERMISSIONS.ALARM_START_WORK]: 'Bắt đầu xử lý cảnh báo',
  [PERMISSIONS.ALARM_RETRY_DEVICE]: 'Thử lại thiết bị',
  [PERMISSIONS.ALARM_RETRY_JOB]: 'Thử lại bước công việc',
  [PERMISSIONS.ALARM_CLEAR]: 'Đánh dấu cảnh báo đã khôi phục',
  [PERMISSIONS.ALARM_CLOSE]: 'Đóng cảnh báo',
  [PERMISSIONS.ALARM_SUPPRESS]: 'Tạm ẩn cảnh báo',
  [PERMISSIONS.ALARM_ESCALATE]: 'Chuyển cấp cảnh báo',
  [PERMISSIONS.ALARM_VISION_BYPASS]: 'Bỏ qua kiểm tra vision có kiểm soát',
}
