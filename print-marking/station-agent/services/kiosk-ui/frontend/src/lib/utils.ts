import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ROLE_LABELS } from '@/constants/roles'
import { PERMISSION_LABELS } from '@/constants/permissions'
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS, JOB_STATUS_COLORS } from '@/constants/jobs'

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Translate role code to Vietnamese label */
export function translateRole(role: string): string {
  return ROLE_LABELS[role] ?? role
}

/** Translate permission code to Vietnamese label */
export function translatePermission(perm: string): string {
  return PERMISSION_LABELS[perm] ?? perm
}

/** Translate job status code to Vietnamese label */
export function translateJobStatus(status: string, jobType?: string): string {
  if (status === 'PRINTING' && jobType) {
    const jt = jobType.toUpperCase();
    const isPrint = jt.includes('PRINT');
    const isLaserOrMark = jt.includes('LASER') || jt.includes('MARK') || jt.includes('PROCESS');
    if (isPrint && isLaserOrMark) {
      return 'Đang in và khắc';
    }
    if (isLaserOrMark) {
      return 'Đang khắc';
    }
    if (isPrint) {
      return 'Đang in';
    }
  }
  return JOB_STATUS_LABELS[status] ?? status
}

/** Translate job type code to Vietnamese label */
export function translateJobType(type: string): string {
  if (!type) return '—'
  const cleanType = type.toUpperCase().trim()
  const labels: Record<string, string> = {
    ...JOB_TYPE_LABELS,
    'PRINT_ONLY': 'In nhãn',
    'MARK_ONLY': 'Khắc laser',
    'PRINT_LABEL': 'In nhãn',
    'LASER_MARK': 'Khắc laser'
  }
  return labels[cleanType] ?? type
}

/** Get Tailwind color class for job status */
export function getStatusColor(status: string): string {
  return JOB_STATUS_COLORS[status] ?? 'bg-slate-500'
}

const ALARM_SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Nghiêm trọng', HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp', INFO: 'Thông tin',
  Critical: 'Nghiêm trọng', Error: 'Cao', Warning: 'Trung bình',
}
const ALARM_STATE_LABELS: Record<string, string> = {
  RAISED: 'Chưa xác nhận', ACKNOWLEDGED: 'Đã xác nhận', IN_PROGRESS: 'Đang xử lý',
  CLEARED: 'Đã khôi phục', CLOSED: 'Đã đóng', SUPPRESSED: 'Đã tạm ẩn',
  Active: 'Chưa xác nhận', Acknowledged: 'Đã xác nhận', Resolved: 'Đã khôi phục',
}
const ALARM_CATEGORY_LABELS: Record<string, string> = {
  DEVICE: 'Thiết bị', JOB: 'Công việc', QUALITY: 'Chất lượng', NETWORK: 'Mạng',
  SYSTEM: 'Hệ thống', SECURITY: 'Bảo mật', MAINTENANCE: 'Bảo trì',
}
const ALARM_RESOLUTION_LABELS: Record<string, string> = {
  AUTO_RECOVERED: 'Tự động khôi phục', DEVICE_RECONNECTED: 'Thiết bị đã kết nối lại',
  MEDIA_REPLACED: 'Đã thay vật tư', JOB_RETRIED: 'Đã thử lại công việc',
  CONFIGURATION_FIXED: 'Đã sửa cấu hình', MANUAL_RESET: 'Đặt lại thủ công',
  FALSE_POSITIVE: 'Cảnh báo nhầm', MAINTENANCE_COMPLETED: 'Hoàn tất bảo trì',
  BYPASSED_BY_SUPERVISOR: 'Quản lý đã cho phép bỏ qua', OTHER: 'Khác',
}

export const translateAlarmSeverity = (value: string) => ALARM_SEVERITY_LABELS[value] ?? value
export const translateAlarmState = (value: string) => ALARM_STATE_LABELS[value] ?? value
export const translateAlarmCategory = (value: string) => ALARM_CATEGORY_LABELS[value] ?? value
export const translateAlarmResolution = (value?: string | null) => value ? (ALARM_RESOLUTION_LABELS[value] ?? value) : '—'

const ALARM_TITLES: Record<string, string> = {
  PRINTER_CONNECTION_LOST: 'Máy in mất kết nối', PRINTER_PAPER_OUT: 'Máy in hết giấy',
  PRINTER_RIBBON_OUT: 'Máy in hết ribbon', PRINTER_HEAD_OPEN: 'Đầu in đang mở',
  LASER_CONNECTION_FAILURE: 'Máy khắc laser mất kết nối', LASER_EXECUTION_FAILED: 'Khắc laser thất bại',
  VISION_OCR_MISMATCH: 'Nội dung OCR không khớp', VISION_RETRY_EXHAUSTED: 'Đã hết số lần thử camera',
  PLC_COMMUNICATION_FAILURE: 'PLC mất kết nối', JOB_FAILED: 'Công việc sản xuất thất bại',
  OUTBOX_DELIVERY_DELAYED: 'Đồng bộ sự kiện bị chậm', PROJECTION_LAG_DETECTED: 'Dữ liệu hiển thị bị trễ',
  DISK_WRITE_FAILURE: 'Không thể ghi dữ liệu cục bộ', DEVICE_CONNECTION_LOST: 'Thiết bị mất kết nối',
}
export const translateAlarmTitle = (alarmCode: string) => ALARM_TITLES[alarmCode] ?? `Cảnh báo ${alarmCode}`

export function alarmGuidance(alarmCode: string): string[] {
  if (alarmCode.startsWith('PRINTER_')) return ['Kiểm tra nguồn điện máy in', 'Kiểm tra giấy và ribbon', 'Kiểm tra cáp mạng', 'Thử kết nối lại thiết bị', 'Liên hệ bộ phận bảo trì nếu lỗi tiếp diễn']
  if (alarmCode.startsWith('LASER_')) return ['Kiểm tra nguồn và khóa an toàn laser', 'Kiểm tra kết nối điều khiển', 'Không mở buồng laser khi thiết bị đang hoạt động', 'Liên hệ bộ phận bảo trì']
  if (alarmCode.startsWith('VISION_')) return ['Vệ sinh ống kính camera', 'Kiểm tra ánh sáng', 'Kiểm tra nội dung in hoặc khắc', 'Thử lại bước xác thực']
  if (alarmCode.startsWith('PLC_')) return ['Kiểm tra nguồn PLC', 'Kiểm tra cáp mạng công nghiệp', 'Dừng thao tác cơ khí thủ công', 'Liên hệ bộ phận bảo trì']
  return ['Ghi nhận tình trạng hiện tại', 'Kiểm tra thiết bị hoặc công việc liên quan', 'Liên hệ quản lý nếu cảnh báo tiếp diễn']
}
