import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Clock, FileText, Settings, Trash2, Edit3, AlertCircle } from 'lucide-react'
import { PageHeader, PermissionGuard, Spinner, EmptyState } from '@/components/common'
import { planningService } from '@/services/planning.service'
import { PERMISSIONS } from '@/utils/permissions'
import type { ShiftTemplate } from '@/types'
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

export function ShiftsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Modal control
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null)
  
  // Confirmation state
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

  // Form fields
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('17:00')
  const [breakStart, setBreakStart] = useState('12:00')
  const [breakEnd, setBreakEnd] = useState('13:00')
  const [crossDay, setCrossDay] = useState(false)
  const [color, setColor] = useState('#F97316')
  const [status, setStatus] = useState('active')
  const [formError, setFormError] = useState<string | null>(null)

  // Fetch templates
  const { data: res, isLoading } = useQuery({
    queryKey: ['shift-templates'],
    queryFn: () => planningService.getShiftTemplates(),
  })

  const shifts = res?.data ?? []

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        start_time: startTime,
        end_time: endTime,
        break_start: breakStart || undefined,
        break_end: breakEnd || undefined,
        cross_day: crossDay,
        color,
        status,
      }

      if (editingTemplate) {
        return planningService.updateShiftTemplate(editingTemplate.id, payload)
      } else {
        return planningService.createShiftTemplate(payload)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-templates'] })
      closeDialog()
      toast.success(editingTemplate ? 'Shift template updated successfully' : 'Shift template created successfully')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'An error occurred'
      setFormError(msg)
      toast.error(msg)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => planningService.deleteShiftTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-templates'] })
      toast.success('Shift template deleted successfully')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || 'Failed to delete template')
    }
  })

  const openCreateDialog = () => {
    setEditingTemplate(null)
    setCode('')
    setName('')
    setDescription('')
    setStartTime('08:00')
    setEndTime('17:00')
    setBreakStart('12:00')
    setBreakEnd('13:00')
    setCrossDay(false)
    setColor('#F97316')
    setStatus('active')
    setFormError(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = (tpl: ShiftTemplate) => {
    setEditingTemplate(tpl)
    setCode(tpl.code)
    setName(tpl.name)
    setDescription(tpl.description || '')
    setStartTime(tpl.start_time)
    setEndTime(tpl.end_time)
    setBreakStart(tpl.break_start || '')
    setBreakEnd(tpl.break_end || '')
    setCrossDay(tpl.cross_day)
    setColor(tpl.color || '#F97316')
    setStatus(tpl.status || 'active')
    setFormError(null)
    setIsDialogOpen(true)
  }

  const closeDialog = () => {
    setIsDialogOpen(false)
    setEditingTemplate(null)
  }

  // Action confirmations
  const handleSaveClick = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !name.trim() || !startTime || !endTime) {
      setFormError('Please fill in all required fields')
      return
    }

    setConfirmState({
      isOpen: true,
      title: editingTemplate ? t('planning_module.edit') : t('planning_module.generateTitle'),
      description: editingTemplate 
        ? t('planning_module.confirmUpdateTpl') 
        : t('planning_module.confirmCreateTpl'),
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }))
        saveMutation.mutate()
      }
    })
  }

  const handleDeleteClick = (id: string) => {
    setConfirmState({
      isOpen: true,
      title: t('planning_module.delete'),
      description: t('planning_module.confirmDeleteTpl'),
      isDanger: true,
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }))
        deleteMutation.mutate(id)
      }
    })
  }

  return (
    <div className="fade-in max-w-7xl mx-auto p-4 space-y-6">
      <PageHeader
        title={t('planning_module.title')}
        description={t('planning_module.subtitle')}
      >
        <PermissionGuard permission={PERMISSIONS.SHIFT_CREATE}>
          <button onClick={openCreateDialog} className="btn btn-primary flex items-center gap-2 text-xs">
            <Plus size={16} />
            {t('shifts.addShift')}
          </button>
        </PermissionGuard>
      </PageHeader>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Spinner size={36} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shifts.map((s) => (
            <div 
              key={s.id} 
              className="card relative overflow-hidden transition-all duration-300 hover:shadow-lg border-t-4"
              style={{ borderTopColor: s.color }}
            >
              <div className="p-5 flex flex-col justify-between h-full space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{s.name}</h3>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{s.code}</p>
                    </div>
                    <span 
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        s.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {s.status === 'active' ? t('planning_module.active') : t('planning_module.inactive')}
                    </span>
                  </div>

                  {s.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{s.description}</p>
                  )}
                </div>

                <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock size={13} className="text-amber-500" />
                    <span className="font-semibold">{t('planning_module.hours')}:</span>
                    <span>{s.start_time} - {s.end_time}</span>
                    {s.cross_day && (
                      <span className="px-1.5 py-0.2 bg-amber-50 text-amber-700 rounded text-[9px] font-bold">
                        +1 Day
                      </span>
                    )}
                  </div>

                  {s.break_start && s.break_end && (
                    <div className="flex items-center gap-2 text-slate-500 pl-5">
                      <span>{t('planning_module.break')}:</span>
                      <span>{s.break_start} - {s.break_end}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-slate-600">
                    <span>{t('planning_module.workingHours')}:</span>
                    <span className="font-bold text-slate-800">{s.working_hours.toFixed(2)} hrs</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <PermissionGuard permission={PERMISSIONS.SHIFT_UPDATE}>
                    <button 
                      onClick={() => openEditDialog(s)} 
                      className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-50 rounded transition-colors"
                      title={t('planning_module.edit')}
                    >
                      <Edit3 size={14} />
                    </button>
                  </PermissionGuard>
                  <PermissionGuard permission={PERMISSIONS.SHIFT_DELETE}>
                    <button 
                      onClick={() => handleDeleteClick(s.id)} 
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-50 rounded transition-colors"
                      title={t('planning_module.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </PermissionGuard>
                </div>
              </div>
            </div>
          ))}

          {shifts.length === 0 && (
            <div className="col-span-full">
              <EmptyState 
                icon={<Clock size={40} />} 
                title={t('planning_module.noShiftTemplatesFound')}
                description={t('planning_module.noShiftTemplatesDesc')}
                action={
                  <PermissionGuard permission={PERMISSIONS.SHIFT_CREATE}>
                    <button onClick={openCreateDialog} className="btn btn-primary text-xs">
                      {t('planning_module.createFirstTemplate')}
                    </button>
                  </PermissionGuard>
                }
              />
            </div>
          )}
        </div>
      )}

      {/* dialog.tsx Modal */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? t('planning_module.editShiftTemplate') : t('planning_module.createShiftTemplate')}
            </DialogTitle>
            <DialogDescription>
              {t('planning_module.configureShiftDesc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveClick} className="space-y-4 my-2">
            {formError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg flex gap-2 text-xs items-start">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.code')} *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={Boolean(editingTemplate)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-400 font-mono"
                  placeholder={t('planning_module.placeholderCode', 'morning_shift')}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.name')} *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder={t('planning_module.placeholderName', 'Morning Shift')}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.description')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                rows={2}
                placeholder={t('planning_module.placeholderDesc', 'Standard morning shifts')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.startTime')} *</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.endTime')} *</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.breakStart')}</label>
                <input
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.breakEnd')}</label>
                <input
                  type="time"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 py-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={crossDay}
                  onChange={(e) => setCrossDay(e.target.checked)}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-700">{t('planning_module.crossMidnight')}</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.color')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-8 border border-slate-200 rounded cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('planning_module.status')}</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
                >
                  <option value="active">{t('planning_module.active')}</option>
                  <option value="inactive">{t('planning_module.inactive')}</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <button type="button" onClick={closeDialog} className="btn btn-secondary text-xs">
                {t('planning_module.cancel')}
              </button>
              <button 
                type="submit"
                disabled={saveMutation.isPending}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                {saveMutation.isPending && <Spinner size={12} />}
                {editingTemplate ? t('planning_module.edit') : t('planning_module.confirm')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation helper */}
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
