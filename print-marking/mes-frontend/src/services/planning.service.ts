import { apiGet, apiPost, apiPut, apiDelete } from './api-client'
import type {
  ShiftTemplate,
  CreateShiftTemplateRequest,
  UpdateShiftTemplateRequest,
  ScheduleGridResponse,
  WorkerAvailabilityDTO,
  TeamAssignmentRequest,
} from '@/types'

export const planningService = {
  // Shift Templates
  getShiftTemplates: () => 
    apiGet<ShiftTemplate[]>('/planning/shift-templates'),

  createShiftTemplate: (data: CreateShiftTemplateRequest) => 
    apiPost<ShiftTemplate>('/planning/shift-templates', data),

  updateShiftTemplate: (id: string, data: UpdateShiftTemplateRequest) => 
    apiPut<ShiftTemplate>(`/planning/shift-templates/${id}`, data),

  deleteShiftTemplate: (id: string) => 
    apiDelete(`/planning/shift-templates/${id}`),

  listShifts: (startDate: string, endDate: string) => 
    apiGet<any[]>(`/planning/shifts?start_date=${startDate}&end_date=${endDate}`),

  // Calendar & Scheduling
  generateCalendar: (year: number, month: number) => 
    apiPost('/planning/calendar/generate', { year, month }),

  getScheduleGrid: (year: number, month: number, workshopId?: string, teamId?: string) => {
    let query = `?year=${year}&month=${month}`
    if (workshopId) query += `&workshop_id=${workshopId}`
    if (teamId) query += `&team_id=${teamId}`
    return apiGet<ScheduleGridResponse>(`/planning/calendar/grid${query}`)
  },

  assignTeamSchedule: (data: TeamAssignmentRequest) => 
    apiPost('/planning/calendar/assign-team', data),

  assignWorkerSchedule: (shiftId: string, data: { worker_id: string; role: string }) => 
    apiPost(`/planning/shifts/${shiftId}/workers`, data),

  removeWorkerSchedule: (shiftId: string, workerId: string) => 
    apiDelete(`/planning/shifts/${shiftId}/workers/${workerId}`),

  // Workforce Availability
  getWorkersAvailability: (date: string) => 
    apiGet<WorkerAvailabilityDTO[]>(`/planning/workers/availability?date=${date}`),
}
