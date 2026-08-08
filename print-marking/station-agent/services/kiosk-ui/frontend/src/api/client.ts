import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

client.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client

export const authApi = {
  login: (username: string, password: string) =>
    client.post<{ token: string; userId: string; username: string; fullName: string; expiresAt: string }>(
      '/auth/login', { username, password }
    ),
  me: () => client.get<{ userId: string; username: string; roles: string[]; permissions: string[] }>('/auth/me'),
}

export const rbacApi = {
  getUsers: () => client.get<any[]>('/rbac/users'),
  createUser: (data: { username: string; password?: string; fullName: string; roleCode: string }) =>
    client.post('/rbac/users', data),
  deleteUser: (id: string) => client.delete(`/rbac/users/${id}`),
  getPermissions: () => client.get<any[]>('/rbac/permissions'),
  updateUserPermissions: (userId: string, permissionCodes: string[]) =>
    client.post(`/rbac/users/${userId}/permissions`, { permissionCodes }),
  resetPassword: (userId: string, data: { password?: string; reason: string }) =>
    client.post(`/rbac/users/${userId}/reset-password`, data),
  toggleActive: (userId: string) => client.post(`/rbac/users/${userId}/toggle-active`),
  getUserAuditLogs: (userId: string) => client.get<any[]>(`/rbac/users/${userId}/audit-logs`)
}

export const jobsApi = {
  list: (page = 1, pageSize = 20, status?: string) =>
    client.get('/jobs', { params: { page, pageSize, status } }),
  getById: (id: string) => client.get(`/jobs/${id}`),
  getHistory: (id: string) => client.get(`/jobs/${id}/history`),
  getAttempts: (id: string) => client.get(`/jobs/${id}/attempts`),
  getAttemptSteps: (attemptId: string) => client.get(`/jobs/attempts/${attemptId}/steps`),
}

export const overwriteApi = {
  getPending: () => client.get('/overwrite-requests/pending'),
  create: (jobId: string, overwriteType: string, reason: string) =>
    client.post('/overwrite-requests', { jobId, overwriteType, reason }),
}

export const commandsApi = {
  manualOverride: (data: { 
    jobId: string; 
    jobNo: string; 
    productCode: string; 
    parentAttemptId: string; 
    reasonCode: string; 
    reasonDescription: string; 
    overrideType: string; 
  }) =>
    client.post<{ success: boolean; eventId: string }>('/commands/manual-override', data),

  dispatchOrder: (data: {
    orderNo: string
    dispatchTarget: 'simulation' | 'production-printer'
    notes?: string
  }) =>
    client.post<{ success: boolean; orderNo: string; dispatchTarget: string; dispatched: number; total: number }>(
      '/commands/dispatch-order', data
    ),
}


export const printerApi = {
  list: () => client.get<any[]>('/printers'),
  discover: () => client.get<any[]>('/printers/discover'),
  health: (printerCode: string) => client.get<{
    printerCode: string
    displayName: string
    driverType: string
    cupsQueueName?: string
    status: string
    isReady: boolean
    checkedAt: string
  }>(`/printers/${printerCode}/health`),
  testConnection: (printerCode: string) => client.post<{
    printerCode: string
    driverType: string
    cupsQueueName?: string
    status: string
    isReachable: boolean
    checkedAt: string
  }>(`/printers/${printerCode}/test-connection`),
}

export const templateApi = {
  list: (params?: { search?: string; dpi?: number; status?: string; layoutType?: string; includeArchived?: boolean }) =>
    client.get<any[]>('/label-templates', { params }),
  getById: (id: string) => client.get<any>(`/label-templates/${id}`),
  getDefault: () => client.get<any>('/label-templates/default'),
  create: (data: {
    name: string; description?: string; note?: string; dpi: number
    labelWidth: number; labelHeight: number; templateJson: string
    templateCode?: string; category?: string; orientation?: string; revision?: string
    supportedBarcodeTypes?: string; supportedPrinterModels?: string; compatibleStationTypes?: string
    // N-Up layout
    layoutType?: string; sheetColumns?: number; sheetRows?: number; gapMm?: number
  }) =>
    client.post<any>('/label-templates', data),
  update: (id: string, data: {
    name: string; description?: string; note?: string; dpi: number
    labelWidth: number; labelHeight: number; templateJson: string
    templateCode?: string; category?: string; orientation?: string; revision?: string
    supportedBarcodeTypes?: string; supportedPrinterModels?: string; compatibleStationTypes?: string
    // N-Up: only gapMm is adjustable after creation
    gapMm?: number
  }) =>
    client.put<any>(`/label-templates/${id}`, data),
  delete: (id: string) => client.delete(`/label-templates/${id}`),
  duplicate: (id: string) => client.post<any>(`/label-templates/${id}/duplicate`),
  publish: (id: string) => client.post<any>(`/label-templates/${id}/publish`),
  archive: (id: string) => client.post<any>(`/label-templates/${id}/archive`),
  setDefault: (id: string) => client.post<any>(`/label-templates/${id}/set-default`),
  exportTemplate: (id: string) => client.get(`/label-templates/${id}/export`, { responseType: 'blob' }),
  importTemplate: (data: object) => client.post<any>('/label-templates/import', data),
  getVersions: (id: string) => client.get<any[]>(`/label-templates/${id}/versions`),
  render: (templateJson: string, data: Record<string, string>) =>
    client.post<{ zpl: string; rendererType: string }>('/label-templates/render', { templateJson, data }),
  printTest: (id: string, data: { printerCode?: string; data?: Record<string, string>; correlationId?: string }) =>
    client.post<any>(`/label-templates/${id}/print-test`, data),
  // Printer assignments
  getAssignments: () => client.get<any[]>('/printer-template-assignments'),
  getAssignment: (printerCode: string) => client.get<any>(`/printer-template-assignments/${printerCode}`),
  assignTemplate: (printerCode: string, templateId: string) =>
    client.post('/printer-template-assignments', { printerCode, templateId }),
  removeAssignment: (printerCode: string) => client.delete(`/printer-template-assignments/${printerCode}`),
  // Print history
  getPrintHistory: (page = 1, pageSize = 50) =>
    client.get<any[]>('/print-history', { params: { page, pageSize } }),
  getPrintHistoryDetail: (id: string) => client.get<any>(`/print-history/${id}`),
  // Printer management (proxied through projection-service → printer-adapter)
  getPrintersReady: (includeSimulation = false) =>
    client.get<any[]>('/projection/printers/ready', { params: includeSimulation ? { includeSimulation: true } : undefined }),
  getPrintersSimulation: () =>
    client.get<any[]>('/projection/printers/ready', { params: { includeSimulation: true } }),
  getPrintersActive: () => client.get<any[]>('/projection/printers/active'),
  activatePrinter: (printerCode: string, templateId: string, activatedBy?: string) =>
    client.post(`/projection/printers/${printerCode}/activate`, { templateId, activatedBy }),
  deactivatePrinter: (printerCode: string) =>
    client.post(`/projection/printers/${printerCode}/deactivate`),
  getPrinterMaintenance: (printerCode: string) =>
    client.get<any>(`/projection/printers/${printerCode}/maintenance`),
}
