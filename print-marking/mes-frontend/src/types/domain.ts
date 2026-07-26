// Workforce types matching Go backend

export interface WorkerDTO {
  id: string
  user_id?: string
  first_name: string
  last_name: string
  full_name: string
  email: string
  phone: string
  employee_code: string
  employee_number: string
  avatar: string
  gender: string
  birthday?: string
  address: string
  employment_date?: string
  department_id?: string
  workshop_id?: string
  team_id?: string
  position: string
  status: string // active probation suspended resigned retired inactive terminated
  availability: string // available busy on_leave sick_leave training overtime offline suspended
  notes: string
  skills: WorkerSkillDTO[]
  created_at: string
  updated_at: string
}

export interface DepartmentDTO {
  id: string
  code: string
  name: string
  description?: string
  manager_id?: string
  status: string
  worker_count?: number
  created_at: string
  updated_at: string
}

export interface WorkshopDTO {
  id: string
  department_id: string
  code: string
  name: string
  factory: string
  description?: string
  status: string
  created_at: string
  updated_at: string
}

export interface TeamDTO {
  id: string
  workshop_id: string
  code: string
  name: string
  leader_id?: string
  description?: string
  status: string
  created_at: string
  updated_at: string
}

export interface SkillDTO {
  id: string
  name: string
  code: string
  description?: string
  created_at: string
  updated_at: string
}

export interface WorkerSkillDTO {
  skill_id: string
  skill_name: string
  skill_code: string
  proficiency_level: number
}

export interface CertificateDTO {
  id: string
  worker_id: string
  name: string
  issuing_authority: string
  certificate_number: string
  issued_at: string
  expires_at: string
  document_url: string
  is_expired: boolean
}

// Planning types
export interface ShiftTemplateDTO {
  id: string
  name: string
  code: string
  start_time: string
  end_time: string
  duration_hours: number
  break_minutes: number
  days_of_week: number[]
  created_at: string
  updated_at: string
}

export interface ShiftDTO {
  id: string
  template_id: string
  template_name: string
  date: string
  start_time: string
  end_time: string
  status: ShiftStatus
  team_assignments: TeamAssignmentDTO[]
  created_at: string
  updated_at: string
}

export type ShiftStatus = 'scheduled' | 'active' | 'completed' | 'cancelled'

export interface TeamAssignmentDTO {
  id: string
  shift_id: string
  team_id: string
  team_name: string
  worker_assignments: WorkerShiftAssignmentDTO[]
}

export interface WorkerShiftAssignmentDTO {
  id: string
  worker_id: string
  worker_name: string
  role: string
  status: 'assigned' | 'confirmed' | 'absent' | 'replaced'
}

export interface LeaveRequestDTO {
  id: string
  worker_id: string
  worker_name: string
  type: LeaveType
  start_date: string
  end_date: string
  reason: string
  status: LeaveStatus
  approved_by?: string
  created_at: string
  updated_at: string
}

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'emergency' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface OvertimeRequestDTO {
  id: string
  worker_id: string
  worker_name: string
  shift_id: string
  date: string
  hours: number
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  approved_by?: string
  created_at: string
  updated_at: string
}

export interface ProductionOrderEventDTO {
  id: string
  production_order_id: string
  event_type: string
  status: string
  message: string
  occurred_at: string
}

// Production types
export interface ProductionOrderDTO {
  id: string
  order_number: string
  product_code: string
  product_name: string
  quantity: number
  unit: string
  status: ProductionOrderStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  operation_type: 'PRINT_ONLY' | 'MARK_ONLY' | 'PRINT_AND_MARK'
  station: string
  gateway_order_id?: string
  events?: ProductionOrderEventDTO[]
  planned_start: string
  planned_end: string
  actual_start?: string
  actual_end?: string
  work_orders: WorkOrderDTO[]
  created_at: string
  updated_at: string
}

export type ProductionOrderStatus = 'draft' | 'released' | 'sent_to_gateway' | 'accepted' | 'in_progress' | 'completed' | 'closed' | 'failed' | 'cancelled'

export interface WorkOrderDTO {
  id: string
  production_order_id: string
  order_number: string
  operation_id: string
  operation_name: string
  routing_step: number
  status: WorkOrderStatus
  planned_start: string
  planned_end: string
  actual_start?: string
  actual_end?: string
  assigned_worker_id?: string
  assigned_worker_name?: string
  quantity_planned: number
  quantity_completed: number
  created_at: string
  updated_at: string
}

export type WorkOrderStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled'

export interface RoutingTemplateDTO {
  id: string
  name: string
  code: string
  product_code: string
  operations: RoutingOperationDTO[]
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RoutingOperationDTO {
  id: string
  routing_id: string
  step: number
  name: string
  description?: string
  skill_required?: string
  skill_level?: SkillLevel
  duration_minutes: number
  setup_minutes: number
  workshop_id?: string
  workshop_name?: string
}

// Assignment types
export interface AssignmentDTO {
  id: string
  work_order_id: string
  work_order_number: string
  operation_name: string
  worker_id: string
  worker_name: string
  score: number
  score_breakdown: ScoreBreakdownDTO
  status: AssignmentStatus
  assigned_by?: string
  override_reason?: string
  revision: number
  created_at: string
  updated_at: string
}

export type AssignmentStatus = 'proposed' | 'approved' | 'rejected' | 'overridden' | 'cancelled'

export interface ScoreBreakdownDTO {
  skill_match: number
  availability: number
  workload: number
  experience: number
  total: number
}

export interface AssignmentRevisionDTO {
  revision: number
  worker_id: string
  worker_name: string
  score: number
  action: 'proposed' | 'approved' | 'rejected' | 'overridden'
  reason?: string
  actor_id: string
  actor_name: string
  created_at: string
}

// Dashboard / Projection types
export interface DashboardSnapshot {
  captured_at: string
  workers_online: number
  workers_available: number
  workers_on_leave: number
  current_shift?: CurrentShiftDTO
  production_orders: ProductionOrderStats
  assignment_stats: AssignmentStats
  department_distribution: DepartmentStats[]
}

export interface CurrentShiftDTO {
  id: string
  name: string
  start_time: string
  end_time: string
  assigned_workers: number
  total_capacity: number
}

export interface ProductionOrderStats {
  total: number
  planned: number
  in_progress: number
  completed: number
  delayed: number
  cancelled: number
}

export interface AssignmentStats {
  total: number
  proposed: number
  approved: number
  overridden: number
  avg_score: number
}

export interface DepartmentStats {
  department_id: string
  department_name: string
  worker_count: number
  available: number
  utilization_rate: number
}

// Notification types
export interface NotificationDTO {
  id: string
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  severity: 'info' | 'warning' | 'error' | 'success'
  entity_type?: string
  entity_id?: string
  created_at: string
}

export type NotificationType = 
  | 'work_order_started'
  | 'work_order_completed'
  | 'work_order_delayed'
  | 'assignment_proposed'
  | 'assignment_approved'
  | 'assignment_rejected'
  | 'certification_expiring'
  | 'leave_approved'
  | 'leave_rejected'
  | 'system_alert'

// Audit types
export interface AuditLogDTO {
  id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  actor_id: string
  actor_name: string
  changes?: Record<string, { old: unknown; new: unknown }>
  metadata?: Record<string, unknown>
  trace_id: string
  correlation_id: string
  created_at: string
}

// Common filter types
export interface PaginationParams {
  page?: number
  page_size?: number
}

export interface UserFilter extends PaginationParams {
  search?: string
  status?: string
}

export interface WorkerFilter extends PaginationParams {
  search?: string
  status?: string
  department_id?: string
  team_id?: string
  skill_id?: string
}

export interface ProductionOrderFilter extends PaginationParams {
  search?: string
  status?: string
  priority?: string
  from_date?: string
  to_date?: string
}

export interface AuditFilter extends PaginationParams {
  entity_type?: string
  entity_id?: string
  actor_id?: string
  action?: string
  from?: string
  to?: string
  trace_id?: string
}

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'
