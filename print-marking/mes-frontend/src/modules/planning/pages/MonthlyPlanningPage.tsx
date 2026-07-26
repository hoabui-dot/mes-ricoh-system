import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Users, Users2, AlertTriangle, X } from 'lucide-react'
import { PageHeader, PermissionGuard, Spinner, EmptyState } from '@/components/common'
import { planningService } from '@/services/planning.service'
import { apiGet } from '@/services/api-client'
import { PERMISSIONS } from '@/utils/permissions'
import type { TeamDTO, WorkshopDTO } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { toast } from '@/stores/toast.store'

export function MonthlyPlanningPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Grid filter states
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [workshopId, setWorkshopId] = useState('')
  const [teamId, setTeamId] = useState('')

  // Control state for action modals
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [showCellActionModal, setShowCellActionModal] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Cell Action configuration state
  const [selectedCell, setSelectedCell] = useState<{
    row: any
    day: number
    dateStr: string
    currentAssignment: any
  } | null>(null)
  const [actionTplId, setActionTplId] = useState<string>('')
  const [actionRole, setActionRole] = useState<string>('operator')

  // Confirmation alert helper
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    description: string
    onConfirm: () => void
    isDanger?: boolean
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  })

  // Generate form state
  const [genYear, setGenYear] = useState(year)
  const [genMonth, setGenMonth] = useState(month)

  // Team bulk assign form state
  const [bulkTeamId, setBulkTeamId] = useState('')
  const [bulkTplId, setBulkTplId] = useState('')
  const [bulkStart, setBulkStart] = useState('')
  const [bulkEnd, setBulkEnd] = useState('')

  // Queries
  const { data: gridRes, isLoading: isGridLoading } = useQuery({
    queryKey: ['schedule-grid', year, month, workshopId, teamId],
    queryFn: () => planningService.getScheduleGrid(year, month, workshopId || undefined, teamId || undefined),
  })

  const { data: tplRes } = useQuery({
    queryKey: ['shift-templates'],
    queryFn: () => planningService.getShiftTemplates(),
  })

  const { data: wsRes } = useQuery({
    queryKey: ['workshops'],
    queryFn: () => apiGet<WorkshopDTO[]>('/workshops'),
  })

  const { data: teamsRes } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiGet<TeamDTO[]>('/teams'),
  })

  const startStr = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: shiftsRes } = useQuery({
    queryKey: ['shifts-list', year, month],
    queryFn: () => planningService.listShifts(startStr, endStr),
  })

  const gridData = gridRes?.data
  const templates = tplRes?.data ?? []
  const workshops = wsRes?.data ?? []
  const teams = teamsRes?.data ?? []
  const shiftsList = shiftsRes?.data ?? []

  // Get total days in month
  const totalDays = new Date(year, month, 0).getDate()
  const daysArray = Array.from({ length: totalDays }, (_, i) => i + 1)

  // Format date helper YYYY-MM-DD
  const formatDateString = (day: number) => {
    const d = String(day).padStart(2, '0')
    const m = String(month).padStart(2, '0')
    return `${year}-${m}-${d}`
  }

  // Get day of week helper
  const getDayOfWeek = (day: number) => {
    const date = new Date(year, month - 1, day)
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return weekdays[date.getDay()]
  }

  // Get localized shift abbreviation helper
  const getShiftAbbr = (code: string) => {
    const lowercaseCode = code.toLowerCase()
    if (lowercaseCode.includes('morning')) {
      return t('planning_module.shiftAbbr.morning', 'MOR')
    }
    if (lowercaseCode.includes('afternoon')) {
      return t('planning_module.shiftAbbr.afternoon', 'AFT')
    }
    if (lowercaseCode.includes('night')) {
      return t('planning_module.shiftAbbr.night', 'NIG')
    }
    return code.replace('_shift', '').substring(0, 3).toUpperCase()
  }

  // Mutate calendars
  const generateMutation = useMutation({
    mutationFn: () => planningService.generateCalendar(genYear, genMonth),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-grid'] })
      queryClient.invalidateQueries({ queryKey: ['shifts-list'] })
      setShowGenerateModal(false)
      setActionError(null)
      toast.success('Calendar generated successfully')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to generate'
      setActionError(msg)
      toast.error(msg)
    },
  })

  // Assign Team schedule
  const assignTeamMutation = useMutation({
    mutationFn: () => planningService.assignTeamSchedule({
      team_id: bulkTeamId,
      shift_template_id: bulkTplId,
      start_date: bulkStart,
      end_date: bulkEnd,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-grid'] })
      queryClient.invalidateQueries({ queryKey: ['shifts-list'] })
      setShowTeamModal(false)
      setActionError(null)
      toast.success('Team schedule assigned successfully')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to assign'
      setActionError(msg)
      toast.error(msg)
    },
  })

  // Assign individual override
  const assignWorkerMutation = useMutation({
    mutationFn: ({ shiftId, workerId, role }: { shiftId: string; workerId: string; role: string }) =>
      planningService.assignWorkerSchedule(shiftId, { worker_id: workerId, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-grid'] })
      queryClient.invalidateQueries({ queryKey: ['shifts-list'] })
      toast.success('Worker override assigned successfully')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Assignment failed'
      toast.error(msg)
    },
  })

  // Remove individual override
  const removeWorkerMutation = useMutation({
    mutationFn: ({ shiftId, workerId }: { shiftId: string; workerId: string }) =>
      planningService.removeWorkerSchedule(shiftId, workerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-grid'] })
      queryClient.invalidateQueries({ queryKey: ['shifts-list'] })
      toast.success('Worker override removed successfully')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Removal failed'
      toast.error(msg)
    },
  })

  // Handle cell click opens the assignment details modal
  const handleCellClick = (row: any, day: number) => {
    const dateStr = formatDateString(day)
    const assignment = row.assignments[dateStr]
    setSelectedCell({ row, day, dateStr, currentAssignment: assignment })
    setActionTplId(assignment?.shift_template_id || '')
    setActionRole(assignment?.role || 'operator')
    setShowCellActionModal(true)
  }

  // Handle save override from modal
  const handleSaveCellOverride = () => {
    if (!selectedCell) return

    const { row, dateStr, currentAssignment } = selectedCell

    if (!actionTplId) {
      toast.error('Please select a shift template')
      return
    }

    const foundShift = shiftsList.find(s => {
      const shiftDateStr = s.date.split('T')[0]
      return shiftDateStr === dateStr && s.shift_template?.id === actionTplId
    })
    const shiftId = foundShift?.id

    if (!shiftId) {
      toast.error('Please generate the calendar for this month first to create shift instances.')
      return
    }

    setConfirmState({
      isOpen: true,
      title: t('planning_module.title'),
      description: t('planning_module.confirmAssignWorker'),
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }))
        setShowCellActionModal(false)
        if (currentAssignment) {
          removeWorkerMutation.mutate({ shiftId: currentAssignment.shift_id, workerId: row.worker_id })
        }
        assignWorkerMutation.mutate({ shiftId, workerId: row.worker_id, role: actionRole })
      }
    })
  }

  // Handle remove override from modal
  const handleRemoveCellOverride = () => {
    if (!selectedCell || !selectedCell.currentAssignment) return

    const { row, currentAssignment } = selectedCell

    setConfirmState({
      isOpen: true,
      title: t('planning_module.delete'),
      description: t('planning_module.confirmRemoveWorker'),
      isDanger: true,
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }))
        setShowCellActionModal(false)
        removeWorkerMutation.mutate({ shiftId: currentAssignment.shift_id, workerId: row.worker_id })
      }
    })
  }

  const triggerGenerate = (e: React.FormEvent) => {
    e.preventDefault()
    setConfirmState({
      isOpen: true,
      title: t('planning_module.generateTitle'),
      description: t('planning_module.confirmGenerate'),
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }))
        generateMutation.mutate()
      }
    })
  }

  const triggerBulkAssign = (e: React.FormEvent) => {
    e.preventDefault()
    if (!bulkTeamId || !bulkTplId || !bulkStart || !bulkEnd) {
      setActionError('Please fill in all required fields')
      return
    }

    setConfirmState({
      isOpen: true,
      title: t('planning_module.bulkAssignTitle'),
      description: t('planning_module.confirmAssignTeam'),
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }))
        assignTeamMutation.mutate()
      }
    })
  }

  // Navigate months
  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  return (
    <div className="fade-in space-y-6 max-w-full p-4 overflow-x-hidden">
      <PageHeader
        title={t('planning_module.title')}
        description={t('planning_module.subtitle')}
      >
        <button 
          onClick={() => { setActionError(null); setShowTeamModal(true) }} 
          className="btn btn-secondary flex items-center gap-2 text-xs"
        >
          <Users2 className="w-4 h-4 shrink-0" size={14} />
          {t('planning_module.bulkAssignTeam')}
        </button>
        <button 
          onClick={() => { setActionError(null); setShowGenerateModal(true) }} 
          className="btn btn-primary flex items-center gap-2 text-xs"
        >
          <CalendarDays className="w-4 h-4 shrink-0" size={14} />
          {t('planning_module.generateMonthShifts')}
        </button>
      </PageHeader>

      {/* Filter Bar */}
      <div className="card p-4 bg-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
            <button onClick={handlePrevMonth} className="p-1.5 text-slate-600 hover:bg-white rounded transition-all">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-slate-800 px-2 min-w-[100px] text-center uppercase">
              {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={handleNextMonth} className="p-1.5 text-slate-600 hover:bg-white rounded transition-all">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
            >
              <option value="">{t('planning_module.allWorkshops')}</option>
              {workshops.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>

            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
            >
              <option value="">{t('planning_module.allTeams')}</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Board Grid */}
      {isGridLoading ? (
        <div className="flex justify-center items-center h-64 bg-white rounded-lg card">
          <Spinner size={36} />
        </div>
      ) : (
        <div className="card bg-white overflow-hidden flex flex-col">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 sticky left-0 bg-slate-50 z-10 border-r border-slate-100 min-w-[200px]">
                    {t('planning_module.worker')}
                  </th>
                  {daysArray.map(day => (
                    <th 
                      key={day} 
                      className="px-2 py-2 text-center text-[10px] font-bold text-slate-500 border-r border-slate-100 min-w-[42px]"
                    >
                      <div className="text-slate-400 uppercase tracking-wider">{getDayOfWeek(day)}</div>
                      <div className="text-slate-800 text-sm mt-0.5">{day}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gridData?.rows.map((row) => (
                  <tr key={row.worker_id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Worker Info Column */}
                    <td className="px-4 py-2 text-xs sticky left-0 bg-white hover:bg-slate-50/50 z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.01)] min-w-[200px]">
                      <div className="font-bold text-slate-800">{row.first_name} {row.last_name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                        <span>{row.employee_code}</span>
                        {row.team_name && (
                          <span className="px-1 bg-slate-100 text-slate-600 rounded">{row.team_name}</span>
                        )}
                      </div>
                    </td>

                    {/* Day Cells */}
                    {daysArray.map(day => {
                      const dateStr = formatDateString(day)
                      const ass = row.assignments[dateStr]

                      return (
                        <td 
                          key={day} 
                          onClick={() => handleCellClick(row, day)}
                          className={`p-1.5 text-center border-r border-slate-100 cursor-pointer transition-all hover:bg-orange-50/30 ${
                            getDayOfWeek(day) === 'Sun' || getDayOfWeek(day) === 'Sat' ? 'bg-slate-50/30' : ''
                          }`}
                        >
                          {ass ? (
                            <div 
                              className={`w-full py-1.5 px-2 rounded font-bold text-[10px] text-white text-center shadow-sm select-none ${
                                ass.type === 'team' ? 'opacity-85 border border-dashed border-white/40' : ''
                              }`}
                              style={{ backgroundColor: ass.color }}
                              title={`${ass.name} (${ass.role})`}
                            >
                              {getShiftAbbr(ass.code)}
                            </div>
                          ) : (
                            <div className="h-7 w-full border border-dashed border-slate-200/50 rounded hover:border-slate-400 transition-colors" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {gridData?.rows.length === 0 && (
                  <tr>
                    <td colSpan={totalDays + 1} className="py-12">
                      <EmptyState 
                        title={t('planning_module.noActiveWorkersFound')} 
                        description={t('planning_module.noActiveWorkersDesc')} 
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generate Calendar dialog.tsx Modal */}
      <Dialog open={showGenerateModal} onOpenChange={(open) => { if (!open) setShowGenerateModal(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="text-orange-500" size={18} />
              {t('planning_module.generateTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('planning_module.generateDesc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={triggerGenerate} className="space-y-4 my-2">
            {actionError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg flex gap-2 text-xs">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.year')}</label>
              <input
                type="number"
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.month')}</label>
              <select
                value={genMonth}
                onChange={(e) => setGenMonth(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
                required
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {new Date(2020, m - 1).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-2">
              <button type="button" onClick={() => setShowGenerateModal(false)} className="btn btn-secondary text-xs">
                {t('planning_module.cancel')}
              </button>
              <button 
                type="submit" 
                disabled={generateMutation.isPending}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                {generateMutation.isPending && <Spinner size={12} />}
                {t('planning_module.confirm')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Team Bulk Assign dialog.tsx Modal */}
      <Dialog open={showTeamModal} onOpenChange={(open) => { if (!open) setShowTeamModal(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="text-orange-500" size={18} />
              {t('planning_module.bulkAssignTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('planning_module.bulkAssignDesc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={triggerBulkAssign} className="space-y-4 my-2">
            {actionError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg flex gap-2 text-xs">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.teamLabel', 'Team *')}</label>
              <select
                value={bulkTeamId}
                onChange={(e) => setBulkTeamId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
                required
              >
                <option value="">{t('planning_module.selectTeam', 'Select Team')}</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.shiftTemplateLabel', 'Shift Template *')}</label>
              <select
                value={bulkTplId}
                onChange={(e) => setBulkTplId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
                required
              >
                <option value="">{t('planning_module.selectTemplate', 'Select Template')}</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.startDate', 'Start Date *')}</label>
                <input
                  type="date"
                  value={bulkStart}
                  onChange={(e) => setBulkStart(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.endDate', 'End Date *')}</label>
                <input
                  type="date"
                  value={bulkEnd}
                  onChange={(e) => setBulkEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500"
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <button type="button" onClick={() => setShowTeamModal(false)} className="btn btn-secondary text-xs">
                {t('planning_module.cancel')}
              </button>
              <button 
                type="submit" 
                disabled={assignTeamMutation.isPending}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                {assignTeamMutation.isPending && <Spinner size={12} />}
                {t('planning_module.confirm')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cell Actions Radix dialog.tsx Modal */}
      <Dialog open={showCellActionModal} onOpenChange={(open) => { if (!open) setShowCellActionModal(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 font-bold">
              {t('planning_module.cellActionTitle')}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              {selectedCell?.row ? `${selectedCell.row.first_name} ${selectedCell.row.last_name} (${selectedCell.row.employee_code})` : ''}
              <span className="block mt-1 font-semibold text-slate-700">{selectedCell?.dateStr}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {t('planning_module.selectOverrideShift')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActionTplId(t.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                      actionTplId === t.id 
                        ? 'border-orange-500 bg-orange-50/10 ring-1 ring-orange-500' 
                        : 'border-slate-200 hover:bg-slate-50 bg-white'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{t.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.start_time} - {t.end_time}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {t('planning_module.assignedRole')}
              </label>
              <select
                value={actionRole}
                onChange={(e) => setActionRole(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
              >
                <option value="operator">Operator</option>
                <option value="supervisor">Supervisor</option>
                <option value="leader">Leader</option>
              </select>
            </div>
          </div>

          <DialogFooter className="pt-2 flex justify-between items-center w-full">
            <div>
              {selectedCell?.currentAssignment && (
                <button
                  type="button"
                  onClick={handleRemoveCellOverride}
                  className="btn btn-secondary text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                >
                  {t('planning_module.removeAssignment')}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setShowCellActionModal(false)} 
                className="btn btn-secondary text-xs"
              >
                {t('planning_module.cancel')}
              </button>
              <button 
                type="button"
                onClick={handleSaveCellOverride}
                disabled={assignWorkerMutation.isPending || removeWorkerMutation.isPending}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                {(assignWorkerMutation.isPending || removeWorkerMutation.isPending) && <Spinner size={12} />}
                {t('planning_module.confirm')}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog helper */}
      <ConfirmationDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        description={confirmState.description}
        isDanger={confirmState.isDanger}
        confirmText={t('planning_module.confirm')}
        cancelText={t('planning_module.cancel')}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
