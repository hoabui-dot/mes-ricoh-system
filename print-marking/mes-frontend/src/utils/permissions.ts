// RBAC permission constants — must exactly match backend casbin policies

export const PERMISSIONS = {
  // Identity
  USER_VIEW: 'user.view',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  ROLE_VIEW: 'role.view',
  ROLE_CREATE: 'role.create',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',
  ROLE_ASSIGN: 'role.assign',
  ROLE_MANAGE: 'role.manage',
  PERMISSION_VIEW: 'permission.view',
  PERMISSION_CREATE: 'permission.create',

  // Workforce
  WORKER_VIEW: 'worker.view',
  WORKER_CREATE: 'worker.create',
  WORKER_UPDATE: 'worker.update',
  WORKER_DELETE: 'worker.delete',
  WORKER_RESTORE: 'worker.restore',
  DEPARTMENT_VIEW: 'department.view',
  DEPARTMENT_CREATE: 'department.create',
  DEPARTMENT_UPDATE: 'department.update',
  DEPARTMENT_DELETE: 'department.delete',
  TEAM_VIEW: 'team.view',
  TEAM_CREATE: 'team.create',
  TEAM_UPDATE: 'team.update',
  TEAM_DELETE: 'team.delete',
  WORKSHOP_VIEW: 'workshop.view',
  WORKSHOP_CREATE: 'workshop.create',
  WORKSHOP_UPDATE: 'workshop.update',
  WORKSHOP_DELETE: 'workshop.delete',
  SKILL_VIEW: 'skill.view',
  SKILL_CREATE: 'skill.create',
  SKILL_UPDATE: 'skill.update',
  SKILL_DELETE: 'skill.delete',

  // Planning
  SHIFT_VIEW: 'shift.view',
  SHIFT_CREATE: 'shift.create',
  SHIFT_UPDATE: 'shift.update',
  SHIFT_DELETE: 'shift.delete',
  PLANNING_PUBLISH: 'planning.publish',
  LEAVE_VIEW: 'leave.view',
  LEAVE_APPROVE: 'leave.approve',
  OVERTIME_VIEW: 'overtime.view',
  OVERTIME_APPROVE: 'overtime.approve',

  // Production
  PRODUCTION_VIEW: 'production.view',
  PRODUCTION_CREATE: 'production.create',
  PRODUCTION_UPDATE: 'production.update',
  PRODUCTION_DELETE: 'production.delete',
  WORK_ORDER_VIEW: 'work_order.view',
  WORK_ORDER_UPDATE: 'work_order.update',

  // Assignment
  ASSIGNMENT_VIEW: 'assignment.view',
  ASSIGNMENT_PROPOSE: 'assignment.propose',
  ASSIGNMENT_APPROVE: 'assignment.approve',
  ASSIGNMENT_REJECT: 'assignment.reject',
  ASSIGNMENT_OVERRIDE: 'assignment.override',

  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',

  // Audit
  AUDIT_VIEW: 'audit.view',

  // Notifications
  NOTIFICATION_VIEW: 'notification.view',

  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',

  // Workflow / Operations
  WORKFLOW_VIEW: 'workflow.view',
  WORKFLOW_CREATE: 'workflow.create',
  WORKFLOW_UPDATE: 'workflow.update',
  WORKFLOW_PUBLISH: 'workflow.publish',
  WORKFLOW_ARCHIVE: 'workflow.archive',
  WORKFLOW_CLONE: 'workflow.clone',
  WORKFLOW_DELETE: 'workflow.delete',
  OPERATION_CREATE: 'operation.create',
  OPERATION_UPDATE: 'operation.update',
  OPERATION_DELETE: 'operation.delete',
  OPERATION_MOVE: 'operation.move',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

// Role names
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  FACTORY_MANAGER: 'factory_manager',
  PRODUCTION_MANAGER: 'production_manager',
  SHIFT_SUPERVISOR: 'shift_supervisor',
  OPERATOR: 'operator',
  HR_PERSONNEL: 'hr_personnel',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]
