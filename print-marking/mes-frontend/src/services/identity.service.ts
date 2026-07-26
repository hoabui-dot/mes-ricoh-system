import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './api-client'
import type {
  LoginRequest,
  LoginResponse,
  UserDTO,
  UpdateProfileRequest,
  ChangePasswordRequest,
} from '@/types'

export const authService = {
  login: (data: LoginRequest) =>
    apiPost<LoginResponse>('/auth/login', data),

  logout: () =>
    apiPost<void>('/auth/logout'),

  refresh: (refreshToken: string) =>
    apiPost<{ access_token: string; refresh_token: string; expires_in: number; token_type: string }>(
      '/auth/refresh',
      { refresh_token: refreshToken },
    ),

  me: () =>
    apiGet<UserDTO>('/auth/me'),

  updateProfile: (data: UpdateProfileRequest) =>
    apiPost<UserDTO>('/auth/profile', data),

  changePassword: (data: ChangePasswordRequest) =>
    apiPost<void>('/auth/change-password', data),

  forgotPassword: (email: string) =>
    apiPost<void>('/auth/forgot-password', { email }),
}

export const userService = {
  list: (params?: Record<string, unknown>) =>
    apiGet<UserDTO[]>('/users', params),

  get: (id: string) =>
    apiGet<UserDTO>(`/users/${id}`),

  updateStatus: (id: string, status: string) =>
    apiPatch<void>(`/users/${id}/status`, { status }),

  assignRole: (id: string, roleId: string) =>
    apiPost<void>(`/users/${id}/roles`, { role_id: roleId }),

  assignRoles: (id: string, roleIds: string[]) =>
    apiPut<void>(`/users/${id}/roles`, { role_ids: roleIds }),
}

export const roleService = {
  list: (params?: { search?: string; page?: number; pageSize?: number }) => {
    const qp = new URLSearchParams()
    if (params?.search) qp.append('search', params.search)
    if (params?.page) qp.append('page', params.page.toString())
    if (params?.pageSize) qp.append('pageSize', params.pageSize.toString())
    const query = qp.toString() ? `?${qp.toString()}` : ''
    return apiGet<import('@/types').RoleDTO[]>(`/roles${query}`)
  },

  get: (id: string) =>
    apiGet<import('@/types').RoleDTO>(`/roles/${id}`),

  create: (data: import('@/types').CreateRoleRequest) =>
    apiPost<import('@/types').RoleDTO>('/roles', data),

  update: (id: string, data: import('@/types').UpdateRoleRequest) =>
    apiPut<import('@/types').RoleDTO>(`/roles/${id}`, data),

  delete: (id: string) =>
    apiDelete<void>(`/roles/${id}`),
}

export const permissionService = {
  list: () =>
    apiGet<import('@/types').PermissionDTO[]>('/permissions'),

  listGrouped: () =>
    apiGet<import('@/types').PermissionGroupDTO[]>('/permissions?grouped=true'),

  create: (data: import('@/types').CreatePermissionRequest) =>
    apiPost<import('@/types').PermissionDTO>('/permissions', data),
}
