// API response types matching Go backend (shared/response/response.go)

export interface APIEnvelope<T = unknown> {
  success: boolean
  data?: T
  error?: APIError
  pagination?: Pagination
  trace_id?: string
  request_id?: string
}

export interface APIError {
  code: string
  message: string
  details?: FieldError[]
}

export interface FieldError {
  field: string
  message: string
}

export interface Pagination {
  page: number
  page_size: number
  total_items: number
  total_pages: number
}

// Generic list response
export interface ListResponse<T> {
  data: T[]
  pagination: Pagination
}

// Common entity fields
export interface BaseEntity {
  id: string
  created_at: string
  updated_at: string
}

// Auth / Identity types
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  user: UserDTO
}

export interface UserDTO extends BaseEntity {
  email: string
  username?: string
  first_name?: string
  last_name?: string
  full_name: string
  phone?: string
  status: UserStatus
  roles?: RoleDTO[]
  permissions?: string[]
  last_login_at?: string
}

export type UserStatus = 'active' | 'inactive' | 'suspended'

export interface RoleDTO extends BaseEntity {
  name: string
  code: string
  description: string
  is_system?: boolean
  users_count?: number
  permissions: PermissionDTO[]
}

export interface PermissionDTO extends BaseEntity {
  name: string
  resource: string
  action: string
  description: string
  module?: string
  display_name?: string
  category?: string
}

export interface PermissionGroupDTO {
  module: string
  permissions: PermissionDTO[]
}

export interface UpdateUserStatusRequest {
  status: UserStatus
}

export interface AssignRoleRequest {
  role_id: string
}

export interface AssignRolesRequest {
  role_ids: string[]
}

export interface CreateRoleRequest {
  name: string
  code?: string
  description?: string
  permission_ids: string[]
}

export interface UpdateRoleRequest {
  name: string
  description?: string
  permission_ids: string[]
}

export interface CreatePermissionRequest {
  name: string
  resource: string
  action: string
  description?: string
  module?: string
  display_name?: string
  category?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export interface UpdateProfileRequest {
  first_name: string
  last_name: string
}

export interface RegisterRequest {
  email: string
  password: string
  first_name: string
  last_name: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

// ─── Planning Module Types ────────────────────────────────────────────────────

export interface ShiftTemplate extends BaseEntity {
  code: string
  name: string
  description: string
  start_time: string
  end_time: string
  break_start: string
  break_end: string
  working_hours: number
  cross_day: boolean
  color: string
  status: string
}

export interface CreateShiftTemplateRequest {
  code: string
  name: string
  description?: string
  start_time: string
  end_time: string
  break_start?: string
  break_end?: string
  cross_day: boolean
  color: string
  status?: string
}

export interface UpdateShiftTemplateRequest {
  code: string
  name: string
  description?: string
  start_time: string
  end_time: string
  break_start?: string
  break_end?: string
  cross_day: boolean
  color: string
  status?: string
}

export interface GenerateCalendarRequest {
  year: number
  month: number
}

export interface TeamAssignmentRequest {
  team_id: string
  shift_template_id: string
  start_date: string
  end_date: string
}

export interface GridAssignmentDTO {
  shift_id: string
  shift_template_id: string
  code: string
  name: string
  color: string
  role: string
  type: 'worker' | 'team'
}

export interface WorkerScheduleGridRow {
  worker_id: string
  first_name: string
  last_name: string
  employee_code: string
  team_id?: string
  team_name?: string
  workshop_id?: string
  workshop_name?: string
  assignments: Record<string, GridAssignmentDTO | null>
}

export interface ScheduleGridResponse {
  year: number
  month: number
  rows: WorkerScheduleGridRow[]
}

export interface WorkerAvailabilityDTO {
  worker_id: string
  first_name: string
  last_name: string
  employee_code: string
  status: string
  availability: 'available' | 'busy' | 'leave' | 'suspended'
  today_shift?: string
  leave_reason?: string
  weekly_hours: number
  skills: string[]
}
